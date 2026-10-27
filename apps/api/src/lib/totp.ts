import { sha256Hex, timingSafeEqual } from "./crypto";

/** RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30 s steps) on WebCrypto. */

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** 160-bit secret, as recommended by RFC 4226. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  new DataView(msg.buffer).setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[19]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

export async function totpCode(secretBase32: string, nowMs: number): Promise<string> {
  return hotp(base32Decode(secretBase32), totpStep(nowMs));
}

/**
 * Checks a code against the current step and `window` steps either side (clock drift). Returns the
 * matching step, or null. Every candidate is compared so timing does not reveal which one matched.
 */
export async function verifyTotp(secretBase32: string, code: string, nowMs: number, window = 1): Promise<number | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let step = current - window; step <= current + window; step++) {
    if (timingSafeEqual(await hotp(secret, step), clean) && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/* ---------- recovery codes ---------- */

// No 0/O/1/I so codes survive being read aloud or copied by hand.
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ten single-use codes, formatted XXXXX-XXXXX (about 50 bits each). Shown once; only hashes are stored. */
export async function generateRecoveryCodes(count = 10): Promise<{ codes: string[]; hashes: string[] }> {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
    codes.push(`${chars.slice(0, 5)}-${chars.slice(5)}`);
  }
  return { codes, hashes: await Promise.all(codes.map(hashRecoveryCode)) };
}

export const normaliseRecoveryCode = (input: string) => input.replace(/[\s-]/g, "").toUpperCase();
export const hashRecoveryCode = (input: string) => sha256Hex(`recovery:${normaliseRecoveryCode(input)}`);
