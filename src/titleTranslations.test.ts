// Run: pnpm test  (node --test, native TS type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingTitles } from "./titleTranslations.ts";

test("asks only for titles without a cached translation", () => {
  const cache = { "At the café": "Kafede", Checkpoint: "" };
  assert.deepEqual(missingTitles(["At the café", "Buying tickets", "Checkpoint"], cache), ["Buying tickets", "Checkpoint"]);
});

test("drops blanks and duplicates, keeps the course's order", () => {
  assert.deepEqual(missingTitles([" Greetings ", "Greetings", "", "  ", "Numbers"], {}), ["Greetings", "Numbers"]);
});

test("nothing to ask when every title is cached", () => {
  assert.deepEqual(missingTitles(["Numbers", "Numbers"], { Numbers: "Sayılar" }), []);
  assert.deepEqual(missingTitles([], {}), []);
});

test("a non-string cache value counts as untranslated", () => {
  assert.deepEqual(missingTitles(["Numbers"], { Numbers: null as unknown as string }), ["Numbers"]);
});
