// Lesson search (#44): unit and lesson titles, vocabulary and grammar straight from the course YAML,
// plus the guidebook text already written for it. Pure module (no Vite/Tauri imports), so
// `node --test` runs src/search.test.ts directly.
import { levelsOf, type Cefr, type Course } from "./course.ts";
import type { Guide } from "./lessons.ts";

export type SearchKind = "unit" | "step" | "vocabulary" | "grammar" | "guide";
export type SearchHit = {
  level: Cefr;
  unitId: string;
  unitTitle: string;
  kind: SearchKind;
  /** The title, word or pattern the result is about; a guidebook hit names the entry it explains. */
  text: string;
  /** The guidebook line that matched, when there is one. */
  note?: string;
};

/** A cached guidebook and the unit it was written for (`guide:<unit>` keys). */
export type Guidebook = { unit: string; guide: Guide };

/** Case and accents fold, so "adios" finds "adiós". */
const fold = (s: string) => s.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const NOTE_MAX = 160;
/** One line, so a guidebook explanation stays a caption rather than a paragraph. */
function snippet(s: string) {
  const text = s.replace(/\s+/g, " ").trim();
  return text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 1).trimEnd()}…` : text;
}

/** Hits in course order; one per kind and text per unit. Queries shorter than two letters find nothing. */
export function searchCourse(course: Course, query: string, guidebooks: Guidebook[] = []): SearchHit[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const hit = (s: string) => fold(s).includes(needle);
  const hits: SearchHit[] = [];
  for (const level of levelsOf(course)) {
    for (const unit of course.levels[level]!.units) {
      const guides = guidebooks.filter((g) => g.unit === unit.id).map((g) => g.guide);
      // A guidebook repeats the YAML lists and adds a translation or explanation to each entry.
      const words = new Map(guides.flatMap((g) => g.vocabulary).map((v) => [fold(v.word), v]));
      const patterns = new Map(guides.flatMap((g) => g.grammar).map((g) => [fold(g.pattern), g]));
      const seen = new Set<string>();
      const add = (kind: SearchKind, text: string, note?: string) => {
        const key = `${kind}:${fold(text)}`;
        if (seen.has(key)) return;
        seen.add(key);
        hits.push({ level, unitId: unit.id, unitTitle: unit.title, kind, text, ...(note?.trim() ? { note: snippet(note) } : {}) });
      };
      if (hit(unit.title)) add("unit", unit.title);
      for (const step of unit.steps) if (hit(step.title)) add("step", step.title);
      for (const word of new Set(unit.steps.flatMap((s) => s.vocabulary)))
        if (hit(word)) add("vocabulary", word, words.get(fold(word))?.translation);
      for (const pattern of new Set(unit.steps.flatMap((s) => s.grammar.map((g) => g.pattern))))
        if (hit(pattern)) add("grammar", pattern, patterns.get(fold(pattern))?.explanation);
      // Guidebook text a YAML word or pattern did not already cover: its translation, example or explanation.
      for (const entry of words.values()) {
        if (seen.has(`vocabulary:${fold(entry.word)}`)) continue;
        const matched = [entry.word, entry.translation, entry.example, entry.example_translation].find(hit);
        if (matched) add("guide", entry.word, matched === entry.word ? "" : matched);
      }
      for (const entry of patterns.values()) {
        if (seen.has(`grammar:${fold(entry.pattern)}`)) continue;
        const matched = [entry.pattern, entry.explanation, entry.example].find(hit);
        if (matched) add("guide", entry.pattern, matched === entry.pattern ? "" : matched);
      }
    }
  }
  return hits;
}
