import assert from "node:assert/strict";
import { test } from "node:test";
import { speechScore } from "./activities.ts";
import { repairRomanian, repairRomanianExplanation, romanianContrast, romanianMistakeContrast, romanianWritingFixes } from "./romanianPractice.ts";

test("a short Romanian answer with a changed verb or destination is wrong", () => {
  assert.equal(speechScore("Merg mâine la gară.", "Plec mâine la gară.", "ro"), 0);
  assert.equal(speechScore("Am ajuns la Brașov.", "Am ajuns la Sibiu.", "ro"), 0);
});

test("Romanian contrast practice uses a fresh sentence about the missed construction", () => {
  const index = romanianMistakeContrast({ kind: "input", prompt: "Translate", context: "", listen: "", answer: "Trenul plecase deja.", accepted: [] });
  assert.equal(index, 0);
  const exercise = romanianContrast(index);
  assert.equal(exercise.kind, "choice");
  assert.equal(exercise.options[exercise.answer], "plecase");
  assert.match(exercise.context, /cabinet/);
});

test("Romanian feedback repairs the audited examples and keeps modified noun phrases intact", () => {
  assert.equal(repairRomanian("Trenul plecasa deja. Ce doriți să beați?"), "Trenul plecase deja. Ce doriți să beți?");
  assert.match(repairRomanianExplanation("Eu vreau. (Окончание -o.)", "ru"), /форма «vreau»/);
  assert.equal(romanianWritingFixes("Am discutat despre documentele.", "ru")[0]?.corrected, "despre documente");
  assert.deepEqual(romanianWritingFixes("Am discutat despre documentele primite.", "ru"), []);
});
