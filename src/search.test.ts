// Run: pnpm test  (node --test, native TS type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchCourse, type Guidebook } from "./search.ts";
import type { Course } from "./course.ts";
import type { Guide } from "./lessons.ts";

const step = (id: string, title: string, vocabulary: string[], grammar: string[]) =>
  ({ id, title, vocabulary, grammar: grammar.map((pattern) => ({ pattern })), activities: [{ type: "learn" }] });
const unit = (id: string, title: string, steps: ReturnType<typeof step>[]) => ({ id, title, steps });

const course = {
  name: "Spanish", native_name: "Español", iso: "es",
  levels: {
    A1: { title: "Beginner", units: [
      unit("greetings", "Greetings & Introductions", [
        step("basic-greetings", "Basic Greetings", ["hola", "adiós", "buenos días"], ["¡Hola! ¿Qué tal?"]),
        step("introduce-yourself", "Introduce Yourself", ["llamarse", "hola"], ["Me llamo {name}."]),
      ]),
      unit("travel", "Travel", [
        step("at-the-station", "At the Station", ["el tren", "el billete"], ["¿Dónde está el andén?"]),
      ]),
    ] },
    B1: { title: "Intermediate", units: [
      unit("past", "Past Tenses", [
        step("imperfect", "The Imperfect", ["antes", "siempre"], ["Cuando era niño, jugaba fuera."]),
      ]),
    ] },
  },
} as unknown as Course;

const empty = (word: string): Guide["vocabulary"][number] => ({ word, translation: "", example: "", example_translation: "" });
const guide = (vocabulary: Guide["vocabulary"], grammar: Guide["grammar"] = []): Guide => ({ vocabulary, grammar });
const guidebooks: Guidebook[] = [
  { unit: "greetings", guide: guide(
    [{ word: "hola", translation: "hello", example: "Hola, Ana.", example_translation: "Hello, Ana." }, empty("adiós")],
    [{ pattern: "¡Hola! ¿Qué tal?", explanation: "A casual way to say hello.", example: "¡Hola! ¿Qué tal?" }],
  ) },
  { unit: "travel", guide: guide([{ word: "el tren", translation: "the train", example: "El tren llega a las ocho.", example_translation: "The train arrives at eight." }]) },
];

test("search finds unit and lesson titles and links them to their unit", () => {
  const hits = searchCourse(course, "introduc");
  assert.deepEqual(hits.map((h) => [h.level, h.unitId, h.kind, h.text]), [
    ["A1", "greetings", "unit", "Greetings & Introductions"],
    ["A1", "greetings", "step", "Introduce Yourself"],
  ]);
});

test("vocabulary and grammar match without case or accents", () => {
  const hits = searchCourse(course, "ADIOS");
  assert.deepEqual(hits.map((h) => [h.kind, h.text, h.note]), [["vocabulary", "adiós", undefined]]);
  assert.deepEqual(searchCourse(course, "qué tal").map((h) => [h.kind, h.text]), [["grammar", "¡Hola! ¿Qué tal?"]]);
});

test("a word repeated across steps and units is one hit per unit", () => {
  const words = searchCourse(course, "hola").filter((h) => h.kind === "vocabulary");
  assert.deepEqual(words.map((h) => [h.unitId, h.text]), [["greetings", "hola"]]);
});

test("a guidebook match shows its translation or explanation, and does not repeat a YAML hit", () => {
  assert.deepEqual(searchCourse(course, "hola", guidebooks).map((h) => [h.kind, h.text, h.note]), [
    ["vocabulary", "hola", "hello"], // the word matched; the guidebook adds its translation
    ["grammar", "¡Hola! ¿Qué tal?", "A casual way to say hello."],
  ]);
  assert.deepEqual(searchCourse(course, "hello", guidebooks).map((h) => [h.unitId, h.kind, h.text, h.note]), [
    ["greetings", "guide", "hola", "hello"],
    ["greetings", "guide", "¡Hola! ¿Qué tal?", "A casual way to say hello."],
  ]);
  assert.deepEqual(searchCourse(course, "casual", guidebooks).map((h) => [h.unitId, h.kind, h.text, h.note]), [
    ["greetings", "guide", "¡Hola! ¿Qué tal?", "A casual way to say hello."],
  ]);
  assert.deepEqual(searchCourse(course, "train", guidebooks).map((h) => [h.unitId, h.kind, h.text, h.note]), [
    ["travel", "guide", "el tren", "the train"],
  ]);
});

test("a guidebook hit is a single caption line", () => {
  const long = guide([], [{ pattern: "ser + adjetivo", explanation: "line one\nline two  ".repeat(30), example: "" }]);
  const [hit] = searchCourse(course, "line", [{ unit: "travel", guide: long }]);
  assert.equal(hit.note?.includes("\n"), false);
  assert.ok((hit.note?.length ?? 0) <= 160, `${hit.note?.length} chars`);
  assert.ok(hit.note?.endsWith("…"));
});

test("short queries find nothing", () => {
  assert.deepEqual(searchCourse(course, " a "), []);
  assert.deepEqual(searchCourse(course, ""), []);
});
