import { test } from "node:test";
import assert from "node:assert/strict";
import { fromGuides, tokens, wordKey } from "./lookup.ts";

test("tokens keep every character and mark only words", () => {
  const t = tokens("¿Dónde está el baño?", "es");
  assert.equal(t.map((x) => x.text).join(""), "¿Dónde está el baño?");
  assert.deepEqual(t.filter((x) => x.word).map((x) => x.text), ["Dónde", "está", "el", "baño"]);
  assert.deepEqual(tokens("l'école", "fr").filter((x) => x.word).map((x) => x.text).join("|").includes("école"), true);
});

test("cache key ignores case, per the course's language", () => {
  assert.equal(wordKey("B2", "İstanbul", "tr"), wordKey("B2", "istanbul", "tr"));
  assert.equal(wordKey("B2", "Haus", "de"), "word:B2:haus");
});

test("cache key carries the level, so an example matches the learner's level (#192)", () => {
  assert.notEqual(wordKey("B2", "Haus", "de"), wordKey("C1", "Haus", "de"));
  assert.equal(wordKey("C1", "Haus", "de"), "word:C1:haus");
  assert.notEqual(wordKey("B2", "Haus", "de"), "word:haus"); // pre-1.15 key: ignored, so it regenerates
});

test("guidebook entries answer first, ignoring case", () => {
  const g = [{ vocabulary: [{ word: "Haus", translation: "house", example: "Das Haus ist groß.", example_translation: "The house is big." }] }];
  assert.equal(fromGuides(g, "haus", "de")?.translation, "house");
  assert.equal(fromGuides(g, "Hund", "de"), null);
});
