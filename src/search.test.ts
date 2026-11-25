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
  { level: "A1", unit: "greetings", guide: guide(
    [{ word: "hola", translation: "hello", example: "Hola, Ana.", example_translation: "Hello, Ana." }, empty("adiós")],
    [{ pattern: "¡Hola! ¿Qué tal?", explanation: "A casual way to say hello.", example: "¡Hola! ¿Qué tal?" }],
  ) },
  { level: "A1", unit: "travel", guide: guide([{ word: "el tren", translation: "the train", example: "El tren llega a las ocho.", example_translation: "The train arrives at eight." }]) },
];

test("search finds unit and lesson titles and links them to their unit", () => {
  const hits = searchCourse(course, "introduc");
  assert.deepEqual(hits.map((h) => [h.level, h.unitId, h.kind, h.text]), [
    ["A1", "greetings", "unit", "Greetings & Introductions"],
    ["A1", "greetings", "step", "Introduce Yourself"],
  ]);
});

test("a query in the learner's language finds a translated unit or lesson title", () => {
  const translations = {
    "Greetings & Introductions": "Saludos e introducciones",
    "Basic Greetings": "Saludos básicos",
  };
  // The row keeps the English title, as the path's header does, and carries the translation under it.
  assert.deepEqual(searchCourse(course, "saludos", [], translations).map((h) => [h.kind, h.text, h.translation]), [
    ["unit", "Greetings & Introductions", "Saludos e introducciones"],
    ["step", "Basic Greetings", "Saludos básicos"],
  ]);
  // The English title still matches, and only the translated titles get a subtitle to show.
  assert.deepEqual(searchCourse(course, "introduc", [], translations).map((h) => [h.kind, h.text, h.translation]), [
    ["unit", "Greetings & Introductions", "Saludos e introducciones"],
    ["step", "Introduce Yourself", undefined],
  ]);
  // A translation that repeats the title (a name, "A1 Checkpoint") is not shown twice.
  assert.deepEqual(searchCourse(course, "travel", [], { Travel: " Travel " }).map((h) => [h.text, h.translation]), [
    ["Travel", undefined],
  ]);
});

test("a malformed translation cache does not throw", () => {
  const bad = { "Greetings & Introductions": 42, "Basic Greetings": null } as unknown as Record<string, string>;
  assert.deepEqual(searchCourse(course, "introductions", [], bad).map((h) => [h.kind, h.text, h.translation]), [
    ["unit", "Greetings & Introductions", undefined],
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

test("a unit id used at two levels keeps each level's own guidebook text", () => {
  const repeated = {
    levels: {
      A1: { title: "Beginner", units: [unit("society-and-environment", "Society", [step("society", "Society", ["agua"], [])])] },
      B1: { title: "Intermediate", units: [unit("society-and-environment", "Environment", [step("environment", "Environment", ["bosque"], [])])] },
    },
  } as unknown as Course;
  const books: Guidebook[] = [
    { level: "A1", unit: "society-and-environment", guide: guide([{ word: "agua", translation: "water", example: "", example_translation: "" }]) },
    { level: "B1", unit: "society-and-environment", guide: guide([{ word: "bosque", translation: "forest", example: "", example_translation: "" }]) },
  ];
  // `guide:<level>:<unit>` keys keep the two levels apart (#183).
  assert.deepEqual(searchCourse(repeated, "water", books).map((h) => [h.level, h.unitId, h.kind, h.text]), [
    ["A1", "society-and-environment", "guide", "agua"],
  ]);
  assert.deepEqual(searchCourse(repeated, "forest", books).map((h) => [h.level, h.unitId, h.kind, h.text]), [
    ["B1", "society-and-environment", "guide", "bosque"],
  ]);
  assert.deepEqual(searchCourse(repeated, "society", books).map((h) => [h.level, h.kind, h.text]), [
    ["A1", "unit", "Society"],
    ["A1", "step", "Society"],
  ]);
});

test("a malformed cached guidebook does not throw", () => {
  const bad = [
    { level: "A1", unit: "travel", guide: { vocabulary: "nope", grammar: { pattern: 42 } } },
    { level: "A1", unit: "travel", guide: null },
    { level: "A1", unit: "travel", guide: { vocabulary: [{ word: 7, translation: null }, null], grammar: [] } },
  ] as unknown as Guidebook[];
  assert.deepEqual(searchCourse(course, "train", bad), []);
  assert.deepEqual(searchCourse(course, "tren", bad).map((h) => [h.kind, h.text]), [["vocabulary", "el tren"]]);
});

test("a guidebook hit is a single caption line", () => {
  const long = guide([], [{ pattern: "ser + adjetivo", explanation: "line one\nline two  ".repeat(30), example: "" }]);
  const [hit] = searchCourse(course, "line", [{ level: "A1", unit: "travel", guide: long }]);
  assert.equal(hit.note?.includes("\n"), false);
  assert.ok((hit.note?.length ?? 0) <= 160, `${hit.note?.length} chars`);
  assert.ok(hit.note?.endsWith("…"));
});

test("short queries find nothing", () => {
  assert.deepEqual(searchCourse(course, " a "), []);
  assert.deepEqual(searchCourse(course, ""), []);
});
