import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "../src/lib/secretbox";
import { base32Decode, base32Encode, generateRecoveryCodes, otpauthUri, totpCode, verifyTotp } from "../src/lib/totp";
import { Harness, PASSWORD, type Client } from "./harness";

const KEY = "test-mfa-encryption-key-0123456789";

describe("TOTP primitives", () => {
  // RFC 6238 appendix B (SHA-1 secret "12345678901234567890"); the RFC lists 8 digits, these are the last 6.
  const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
  it("matches the RFC 6238 test vectors", async () => {
    expect(await totpCode(secret, 59_000)).toBe("287082");
    expect(await totpCode(secret, 1_111_111_109_000)).toBe("081804");
    expect(await totpCode(secret, 1_234_567_890_000)).toBe("005924");
    expect(await totpCode(secret, 2_000_000_000_000)).toBe("279037");
  });

  it("accepts one step of clock drift but not more, and rejects malformed codes", async () => {
    const now = 1_234_567_890_000;
    const code = await totpCode(secret, now);
    expect(await verifyTotp(secret, code, now)).toBe(Math.floor(now / 30_000));
    expect(await verifyTotp(secret, code, now + 30_000)).not.toBeNull();
    expect(await verifyTotp(secret, code, now - 30_000)).not.toBeNull();
    expect(await verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(await verifyTotp(secret, "12345", now)).toBeNull();
    expect(await verifyTotp(secret, "abcdef", now)).toBeNull();
    expect(await verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).not.toBeNull(); // authenticator apps group digits
  });

  it("round-trips base32 and builds a standard otpauth URI", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "a@b.example", "TripWeave");
    expect(uri).toBe("otpauth://totp/TripWeave%3Aa%40b.example?secret=JBSWY3DPEHPK3PXP&issuer=TripWeave&algorithm=SHA1&digits=6&period=30");
  });

  it("generates distinct, hand-copyable recovery codes", async () => {
    const { codes, hashes } = await generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((c) => /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(c))).toBe(true);
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it("encrypts secrets with AES-GCM and detects a wrong key or tampering", async () => {
    const sealed = await sealSecret("JBSWY3DPEHPK3PXP", KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(await sealSecret("JBSWY3DPEHPK3PXP", KEY)).not.toBe(sealed); // fresh IV every time
    expect(await openSecret(sealed, KEY)).toBe("JBSWY3DPEHPK3PXP");
    await expect(openSecret(sealed, "another-key-another-key-123")).rejects.toThrow();
    const parts = sealed.split(".");
    const flipped = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -4)}AAAA`;
    await expect(openSecret(flipped, KEY)).rejects.toThrow();
    await expect(sealSecret("x", "short")).rejects.toThrow();
  });
});

async function enrol(h: Harness, c: Client): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await c.ok("POST", "/auth/mfa/setup");
  const done = await c.post("/auth/mfa/enable", { code: await totpCode(setup.secret, h.now.getTime()) });
  expect(done.status).toBe(200);
  return { secret: setup.secret, recoveryCodes: done.body.data.recoveryCodes };
}
const login = (h: Harness, email = "mfa@co.example") => h.client().post("/auth/login", { email, password: PASSWORD });
const later = (h: Harness, seconds: number) => void (h.now = new Date(h.now.getTime() + seconds * 1000));

describe("multi-factor authentication", () => {
  it("is unavailable until the platform has an encryption key, and nothing is stored", async () => {
    const h = new Harness();
    const c = await h.register("No Key Co", "tour_operator", "nokey@co.example");
    expect((await c.get("/auth/mfa")).body.data).toMatchObject({ available: false, enabled: false });
    expect((await c.post("/auth/mfa/setup")).status).toBe(412);
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM user_mfa").first<{ n: number }>())!.n).toBe(0);
  });

  it("enrols with a confirming code, encrypts the seed and returns recovery codes once", async () => {
    const h = new Harness({}, { MFA_ENCRYPTION_KEY: KEY });
    const c = await h.register("Mfa Co", "tour_operator", "mfa@co.example");
    expect((await c.get("/auth/mfa")).body.data).toMatchObject({ available: true, enabled: false });
    const setup = await c.ok("POST", "/auth/mfa/setup");
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.otpauthUri).toContain(`secret=${setup.secret}`);
    const stored = await h.db.prepare("SELECT secret_encrypted, enabled_at FROM user_mfa").first<{ secret_encrypted: string; enabled_at: string | null }>();
    expect(stored!.secret_encrypted).not.toContain(setup.secret);
    expect(stored!.enabled_at).toBeNull(); // pending: sign-in is not affected yet
    expect((await login(h)).body.data.mfaRequired).toBeUndefined();

    expect((await c.post("/auth/mfa/enable", { code: "000000" })).status).toBe(400);
    const enable = await c.post("/auth/mfa/enable", { code: await totpCode(setup.secret, h.now.getTime()) });
    expect(enable.status).toBe(200);
    expect(enable.body.data.recoveryCodes).toHaveLength(10);
    expect((await c.get("/auth/mfa")).body.data).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });
    expect((await c.get("/auth/me")).body.data.user.mfaEnabled).toBe(true);
    const rows = JSON.stringify((await h.db.prepare("SELECT * FROM mfa_recovery_codes").all()).results);
    for (const code of enable.body.data.recoveryCodes) expect(rows).not.toContain(code); // only hashes at rest
    expect((await c.post("/auth/mfa/setup")).status).toBe(409); // cannot silently replace an active factor
    expect((await c.post("/auth/mfa/enable", { code: await totpCode(setup.secret, h.now.getTime()) })).status).toBe(400);
  });

  it("requires the second factor at sign-in, and a challenge buys exactly one session", async () => {
    const h = new Harness({}, { MFA_ENCRYPTION_KEY: KEY });
    const c = await h.register("Mfa Co", "tour_operator", "mfa@co.example");
    const { secret } = await enrol(h, c);
    later(h, 60);

    const attempt = h.client();
    const pw = await attempt.post("/auth/login", { email: "mfa@co.example", password: PASSWORD });
    expect(pw.status).toBe(200);
    expect(pw.body.data).toMatchObject({ mfaRequired: true, expiresInSeconds: 300 });
    expect(pw.body.data.user).toBeUndefined();
    expect(attempt.cookie).toBe(""); // no session after the password step
    expect((await attempt.get("/auth/me")).status).toBe(401);

    const mfaToken = pw.body.data.mfaToken;
    expect((await attempt.post("/auth/mfa/verify", { mfaToken, code: "123456" })).status).toBe(401);
    const code = await totpCode(secret, h.now.getTime());
    const ok = await attempt.post("/auth/mfa/verify", { mfaToken, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe("mfa@co.example");
    expect((await attempt.get("/auth/me")).status).toBe(200);
    expect((await h.client().post("/auth/mfa/verify", { mfaToken, code })).status).toBe(401); // challenge already used

    // The same code cannot be replayed on a fresh sign-in within its validity window...
    const second = (await login(h)).body.data.mfaToken;
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: second, code })).status).toBe(401);
    // ...but the next one works.
    later(h, 30);
    const third = (await login(h)).body.data.mfaToken;
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: third, code: await totpCode(secret, h.now.getTime()) })).status).toBe(200);
  });

  it("locks a challenge after five wrong codes and expires it after five minutes", async () => {
    const h = new Harness({}, { MFA_ENCRYPTION_KEY: KEY });
    const c = await h.register("Mfa Co", "tour_operator", "mfa@co.example");
    const { secret } = await enrol(h, c);
    later(h, 60);
    const mfaToken = (await login(h)).body.data.mfaToken;
    for (let i = 0; i < 5; i++) expect((await h.client().post("/auth/mfa/verify", { mfaToken, code: "000000" })).status).toBe(401);
    expect((await h.client().post("/auth/mfa/verify", { mfaToken, code: await totpCode(secret, h.now.getTime()) })).status).toBe(401); // right code, burned challenge
    expect(Number((await h.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'auth.mfa_failed'").first<{ n: number }>())!.n)).toBe(5);

    const fresh = (await login(h)).body.data.mfaToken;
    later(h, 301);
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: fresh, code: await totpCode(secret, h.now.getTime()) })).status).toBe(401);
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: "x".repeat(40), code: "123456" })).status).toBe(401);
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: fresh })).status).toBe(422); // must send a factor
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: fresh, code: "123456", recoveryCode: "AAAAA-AAAAA" })).status).toBe(422); // exactly one
  });

  it("accepts each recovery code once, case- and dash-insensitively", async () => {
    const h = new Harness({}, { MFA_ENCRYPTION_KEY: KEY });
    const c = await h.register("Mfa Co", "tour_operator", "mfa@co.example");
    const { recoveryCodes } = await enrol(h, c);
    const recovery = recoveryCodes[0]!;
    const t1 = (await login(h)).body.data.mfaToken;
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: t1, recoveryCode: recovery.toLowerCase().replace("-", " ") })).status).toBe(200);
    const t2 = (await login(h)).body.data.mfaToken;
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: t2, recoveryCode: recovery })).status).toBe(401); // spent
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: t2, recoveryCode: recoveryCodes[1]! })).status).toBe(200);
    expect((await c.get("/auth/mfa")).body.data.recoveryCodesRemaining).toBe(8);
    expect(Number((await h.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'auth.mfa_recovery_code_used'").first<{ n: number }>())!.n)).toBe(2);
  });

  it("needs the password and a second factor to disable it or reissue recovery codes", async () => {
    const h = new Harness({}, { MFA_ENCRYPTION_KEY: KEY });
    const c = await h.register("Mfa Co", "tour_operator", "mfa@co.example");
    const { secret, recoveryCodes } = await enrol(h, c);
    later(h, 60);
    const code = () => totpCode(secret, h.now.getTime());

    expect((await c.post("/auth/mfa/disable", { password: "wrong-Password1", code: await code() })).status).toBe(403);
    expect((await c.post("/auth/mfa/disable", { password: PASSWORD, code: "000000" })).status).toBe(403);
    expect((await c.post("/auth/mfa/disable", { password: PASSWORD })).status).toBe(422);
    expect((await c.get("/auth/mfa")).body.data.enabled).toBe(true);

    const regen = await c.post("/auth/mfa/recovery-codes", { password: PASSWORD, code: await code() });
    expect(regen.status).toBe(200);
    expect(regen.body.data.recoveryCodes).toHaveLength(10);
    const t = (await login(h)).body.data.mfaToken;
    expect((await h.client().post("/auth/mfa/verify", { mfaToken: t, recoveryCode: recoveryCodes[2]! })).status).toBe(401); // old set is void

    later(h, 30);
    expect((await c.post("/auth/mfa/disable", { password: PASSWORD, recoveryCode: regen.body.data.recoveryCodes[0] })).status).toBe(200);
    expect((await c.get("/auth/mfa")).body.data).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });
    expect((await login(h)).body.data.user.email).toBe("mfa@co.example"); // plain sign-in again
    expect((await h.db.prepare("SELECT COUNT(*) AS n FROM user_mfa").first<{ n: number }>())!.n).toBe(0);
  });

  it("fails closed when the encryption key is removed after enrolment", async () => {
    const h = new Harness({}, { MFA_ENCRYPTION_KEY: KEY });
    const c = await h.register("Mfa Co", "tour_operator", "mfa@co.example");
    const { secret } = await enrol(h, c);
    later(h, 60);
    const mfaToken = (await login(h)).body.data.mfaToken;
    delete h.env.MFA_ENCRYPTION_KEY;
    const r = await h.client().post("/auth/mfa/verify", { mfaToken, code: await totpCode(secret, h.now.getTime()) });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});

describe("email verification", () => {
  const tokenFor = async (h: Harness, subject: string, email: string) => {
    const mail = await h.db.prepare("SELECT body_text FROM email_outbox WHERE to_email = ? AND subject LIKE ? ORDER BY created_at DESC").bind(email, `${subject}%`).first<{ body_text: string }>();
    return /token=([\w-]+)/.exec(mail!.body_text)![1]!;
  };

  it("sends a link at registration, verifies once, and marks the account", async () => {
    const h = new Harness();
    const c = await h.register("Verify Co", "tour_operator", "v@co.example");
    expect((await c.get("/auth/me")).body.data.user.emailVerified).toBe(false);
    const token = await tokenFor(h, "Verify your", "v@co.example");
    const stored = JSON.stringify((await h.db.prepare("SELECT token_hash FROM email_verification_tokens").all()).results);
    expect(stored).not.toContain(token); // only a hash at rest

    expect((await h.client().post("/auth/verify-email", { token: "z".repeat(43) })).status).toBe(400);
    expect((await h.client().post("/auth/verify-email", { token })).status).toBe(200);
    expect((await h.client().post("/auth/verify-email", { token })).status).toBe(400); // single use
    expect((await c.get("/auth/me")).body.data.user.emailVerified).toBe(true);
  });

  it("rejects an expired link and issues a new one on request", async () => {
    const h = new Harness();
    const c = await h.register("Verify Co", "tour_operator", "v@co.example");
    const token = await tokenFor(h, "Verify your", "v@co.example");
    later(h, 49 * 3600);
    expect((await h.client().post("/auth/verify-email", { token })).status).toBe(400);
    expect((await h.client().post("/auth/resend-verification")).status).toBe(401);
    const c2 = h.client();
    await c2.post("/auth/login", { email: "v@co.example", password: PASSWORD });
    expect((await c2.post("/auth/resend-verification")).body.data.message).toContain("sent");
    const fresh = await tokenFor(h, "Verify your", "v@co.example");
    expect(fresh).not.toBe(token);
    expect((await h.client().post("/auth/verify-email", { token: fresh })).status).toBe(200);
    expect((await c2.post("/auth/resend-verification")).body.data.alreadyVerified).toBe(true);
    void c;
  });

  it("blocks everything except /auth for unverified accounts only when enforcement is on", async () => {
    const off = new Harness();
    const free = await off.register("Free Co", "tour_operator", "free@co.example");
    expect((await free.get("/customers")).status).toBe(200);

    const h = new Harness({}, { REQUIRE_EMAIL_VERIFICATION: "true" });
    const c = await h.register("Strict Co", "tour_operator", "strict@co.example");
    const blocked = await c.get("/customers");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.details).toMatchObject({ reason: "email_not_verified" });
    expect((await c.get("/auth/me")).status).toBe(200);
    expect((await c.post("/auth/resend-verification")).status).toBe(200);
    expect((await h.client().get("/health")).status).toBe(200);
    await h.client().post("/auth/verify-email", { token: await tokenFor(h, "Verify your", "strict@co.example") });
    expect((await c.get("/customers")).status).toBe(200);
  });

  it("treats a completed password reset as proof of mailbox ownership", async () => {
    const h = new Harness({}, { REQUIRE_EMAIL_VERIFICATION: "true" });
    await h.register("Reset Co", "tour_operator", "r@co.example");
    await h.client().post("/auth/forgot-password", { email: "r@co.example" });
    const token = await tokenFor(h, "Reset your", "r@co.example");
    await h.client().post("/auth/reset-password", { token, password: "Brand-New-Pass9" });
    const c = h.client();
    await c.post("/auth/login", { email: "r@co.example", password: "Brand-New-Pass9" });
    expect((await c.get("/auth/me")).body.data.user.emailVerified).toBe(true);
    expect((await c.get("/customers")).status).toBe(200);
  });
});
