import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCourse } from "./course.ts";
import { hasRomanianPractice, romanianPractice, romanianReading } from "./romanianLessons.ts";

const course = parseCourse(readFileSync(new URL("../courses/ro.yml", import.meta.url), "utf8"), "ro.yml");

test("every Romanian A1 and B1 lesson has local examples and answerable practice", () => {
  for (const level of ["A1", "B1"] as const) {
    const levelDef = course.levels[level]!;
    for (const unit of levelDef.units) for (const step of unit.steps) {
      const c = { course, levelDef, level, step, unitTitle: unit.title, native: "ru" };
      assert.ok(hasRomanianPractice(c), step.id);
      const items = romanianPractice(c);
      const examples = new Set(items.flatMap((item) => item.kind === "learn" ? [item.phrase] : []));
      assert.ok(items.some((item) => item.kind === "input" && item.literal && item.answer === item.listen && examples.has(item.answer)), step.id);
      for (const item of items) if (item.kind === "choice") {
        assert.ok(examples.has(item.listen), step.id);
        assert.equal(item.options[item.answer], item.listen);
        assert.equal(new Set(item.options).size, item.options.length);
      }
    }
  }
});

test("the Romanian reading lesson keeps each question with a complete passage", () => {
  const items = romanianReading();
  assert.equal(items.length, 8);
  assert.equal(new Set(items.flatMap((item) => item.kind === "choice" ? [item.context] : [])).size, 3);
  for (const item of items) {
    assert.equal(item.kind, "choice");
    assert.ok(item.context.split(" ").length > 20);
    assert.ok(item.options[item.answer]);
  }
});
