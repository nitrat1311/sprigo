import { test } from "node:test";
import assert from "node:assert/strict";
import { validTranslation } from "./activities.ts";

test("validTranslation rejects an empty or echoed translation", () => {
  assert.equal(validTranslation("Sigur, vă ajut.", ""), false);
  assert.equal(validTranslation("Sigur, vă ajut.", "Sigur, vă ajut."), false);
  assert.equal(validTranslation("Sigur, vă ajut.", "  SIGUR, VĂ AJUT.  "), false);
});

test("validTranslation accepts a real translation", () => {
  assert.equal(validTranslation("Sigur, vă ajut.", "Конечно, помогу."), true);
});

import { isEchoCorrection } from "./activities.ts";

test("isEchoCorrection catches exact and whitespace/unicode echoes", () => {
  assert.equal(isEchoCorrection("Da, am o rezervare.", "Da, am o rezervare."), true);
  assert.equal(isEchoCorrection("Da,  am   o rezervare.", "da, am o rezervare."), true);
  assert.equal(isEchoCorrection("Părintele citește.", "Părintele cite\u015Fte."), true); // legacy cedilla normalizes
});

test("isEchoCorrection preserves genuine corrections", () => {
  assert.equal(isEchoCorrection("Da, am o rezervare pentru un noapte.", "Da, am o rezervare pentru o noapte."), false);
  assert.equal(isEchoCorrection("Rezervare am.", "Am o rezervare."), false);
  assert.equal(isEchoCorrection("anything", ""), false);
});
