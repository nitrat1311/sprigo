import { test } from "node:test";
import assert from "node:assert/strict";
import { JOURNAL_MAX, NOTE_MAX, cleanEntry, cleanNote, cleanText, isDayKey, snippet } from "./notes.ts";

test("text is trimmed and Windows line endings become \\n", () => {
  assert.equal(cleanText("  hola\r\namigo  \n", 100), "hola\namigo");
  assert.equal(cleanNote("\n\n  mañana  \n"), "mañana");
});

test("text is cut to the limit of its field", () => {
  assert.equal(cleanNote("x".repeat(NOTE_MAX + 50)).length, NOTE_MAX);
  assert.equal(cleanEntry("x".repeat(JOURNAL_MAX + 50)).length, JOURNAL_MAX);
  assert.equal(cleanText("x".repeat(10), 4), "xxxx");
});

test("whitespace only means no note", () => {
  assert.equal(cleanNote(" \n\t "), "");
});

test("a snippet is the first line, cut with an ellipsis", () => {
  assert.equal(snippet("Hola.\nSegunda línea."), "Hola.");
  assert.equal(snippet("  hola  "), "hola");
  assert.equal(snippet("x".repeat(100), 10), `${"x".repeat(9)}…`);
  assert.equal(snippet("x".repeat(10), 10), "x".repeat(10));
});

test("only YYYY-MM-DD is a journal day", () => {
  for (const ok of ["2026-01-05", "2026-12-31"]) assert.ok(isDayKey(ok), ok);
  for (const bad of ["2026-1-5", "05.01.2026", "today", "2026-01-05\n"]) assert.ok(!isDayKey(bad), bad);
});
