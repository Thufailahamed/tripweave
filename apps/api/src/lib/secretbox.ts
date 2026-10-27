/** AES-256-GCM encryption for secrets stored in D1 (currently TOTP seeds). The key is a Worker secret, never in the database. */

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(keyMaterial: string): Promise<CryptoKey> {
  if (keyMaterial.length < 16) throw new Error("Encryption key must be at least 16 characters");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`tripweave:secretbox:${keyMaterial}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Output format: v1.<iv>.<ciphertext+tag>, both base64. A fresh random IV is used for every call. */
export async function sealSecret(plaintext: string, keyMaterial: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(keyMaterial), enc.encode(plaintext)));
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

/** Throws when the key is wrong or the value was tampered with. */
export async function openSecret(sealed: string, keyMaterial: string): Promise<string> {
  const [version, iv, ct] = sealed.split(".");
  if (version !== "v1" || !iv || !ct) throw new Error("Unsupported secret format");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await importKey(keyMaterial), fromB64(ct)));
}
