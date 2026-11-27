// PKCE (RFC 7636) for the OpenRouter sign-in (#197). Pure helpers with no app imports, so the tests run in Node.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url without padding, the encoding PKCE asks for. */
export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    // 1 byte → 2 chars, 2 → 3, 3 → 4: the rest of the last group is padding, which base64url leaves out.
    for (let j = 0, chars = Math.min(3, bytes.length - i) + 1; j < chars; j++) out += ALPHABET[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

/** S256 challenge: base64url(SHA-256(verifier)). */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** A fresh verifier (86 chars), its challenge, and a state that ties the callback to this window. */
export async function createPkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const verifier = base64url(random(48)); // 48 bytes → 64 chars of the 43–128 RFC allows
  return { verifier, challenge: await challengeOf(verifier), state: base64url(random(16)) };
}
