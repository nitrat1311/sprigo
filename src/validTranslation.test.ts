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
