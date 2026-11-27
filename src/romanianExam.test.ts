import { test } from "node:test";
import assert from "node:assert/strict";
import { romanianExam } from "./romanianExam.ts";
import { givesAway, REGISTRY, speechScore, toItems } from "./activities.ts";
import { fromTable, LANGS, tensesFor } from "./conjugation.ts";

test("author-written Romanian exams have stable coverage and self-contained choices", () => {
  for (const [level, count] of [["A1", 14], ["B1", 15]] as const) {
    const items = romanianExam(level);
    assert.equal(items.length, count);
    assert.equal(new Set(items.map((i) => i.kind === "choice" && i.prompt)).size, count);
    assert.equal(items.filter((i) => i.kind === "choice" && i.listen).length, 3);
    for (const item of items) {
      if (item.kind !== "choice") throw new Error("Expected a fixed choice");
      assert.ok(item.options[item.answer]);
      assert.equal(new Set(item.options).size, item.options.length);
      assert.equal(givesAway(item.prompt, item.options, item.answer), false);
    }
  }
});

test("Romanian read-aloud scoring preserves negation, number, and word order", () => {
  assert.equal(speechScore("Nu mai pot veni la întâlnire.", "Mai pot veni la întâlnire.", "ro"), 0);
  assert.equal(speechScore("Ana îl sună pe Dan.", "Dan îl sună pe Ana.", "ro"), 0);
  assert.equal(speechScore("Trenul ajunge la șapte.", "Trenul ajunge la 8.", "ro"), 0);
  assert.equal(speechScore("Trenul ajunge la șapte.", "Trenul ajunge la 7.", "ro"), 1);
  assert.equal(speechScore("Autobuzul 27.", "Autobuzul 2 7.", "ro"), 0);
  assert.equal(speechScore("Autobuzul 27.", "Autobuzul douăzeci și șapte.", "ro"), 1);
  assert.ok(speechScore("Dacă vă convine, putem stabili o altă dată.", "Dacă vă convine, putem stabili o data.", "ro") >= 0.75);
});

test("only renderable generated questions and verified translation keys reach Romanian lessons", () => {
  const choices = { prompt: "Как продолжить?", options: ["Vreau apă.", "Vreau lapte.", "Vreau ceai."], answer_index: 0 };
  assert.equal(REGISTRY.dialogue!.toItem({ ...choices, dialogue_lines: ["Ion: Ce vrei?", "Ana: Vreau apă."] }), null);
  assert.equal(REGISTRY.reading_choice!.toItem({ ...choices, passage: "  " }), null);
  assert.equal(REGISTRY.fill_blank!.toItem({ ...choices, sentence_with_blank: "Mi-__ sent ieri." }), null);
  const translations = toItems([{ key: "a0", type: "translate", count: 1, hints: {} }], {
    a0: [{ prompt: "Переведи", source_sentence: "Sunt din România.", answer: "Я из Румынии.", accepted_answers: ["Я из Румынской тысячи."] }],
  }, ["ro", "ru"]);
  assert.equal(translations[0]?.kind, "input");
  assert.deepEqual(translations[0]?.kind === "input" && translations[0].accepted, []);
});

test("all Romanian conjugation prompts use complete checked tables", () => {
  for (const verb of LANGS.ro.verbs) for (const tense of tensesFor("ro", "B1")) {
    assert.equal(LANGS.ro.forms?.[verb][tense].split(", ").length, 6, verb + " " + tense);
  }
  const [future, present] = fromTable("ro", [
    { verb: "studia", tense: "viitor", person: "ei/ele" },
    { verb: "avea", tense: "prezent", person: "el/ea" },
  ], "Type")!;
  assert.ok(future.kind === "input" && future.answer === "vor studia" && future.accepted.includes("o să studieze"));
  assert.ok(present.kind === "input" && present.accepted.includes("ea are"));
});
