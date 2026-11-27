import { test } from "node:test";
import assert from "node:assert/strict";
import { base64url, challengeOf, createPkce } from "./pkce.ts";

test("S256 challenge matches RFC 7636 appendix B", async () => {
  assert.equal(await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("base64url drops the padding and uses the URL alphabet", () => {
  assert.equal(base64url(new Uint8Array()), "");
  assert.equal(base64url(new Uint8Array([0xfb, 0xff])), "-_8");
  assert.equal(base64url(new TextEncoder().encode("hello")), "aGVsbG8");
});

test("a fresh verifier is URL-safe and its challenge is a SHA-256 digest", async () => {
  const p = await createPkce();
  assert.match(p.verifier, /^[A-Za-z0-9_-]{64}$/);
  assert.match(p.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.state, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(p.challenge, await challengeOf(p.verifier));
  assert.notEqual(p.verifier, (await createPkce()).verifier);
});
