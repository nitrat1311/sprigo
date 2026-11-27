import { describeItem, langEn, normalize, shuffleAnswer, type Item, type LessonContext } from "./activities.ts";
import { z } from "zod";

const LIBRARY = "Începând cu 1 mai, biblioteca va fi deschisă și duminica, de la 10 la 14. Sala de lectură rămâne închisă duminica, dar cărțile pot fi împrumutate de la parter.";
const PARK = "Intrarea în parc este gratuită. Pentru atelierul de grădinărit de sâmbătă trebuie să te înscrii cel târziu joi. Dacă plouă, atelierul se va ține în sala de lângă intrare.";
const EMAIL = "Bună, Irina! Întâlnirea cu organizatorii s-a mutat de la marți la miercuri, la aceeași oră. Dacă nu poți veni, trimite-mi propunerile până miercuri dimineață și le prezint eu. Mulțumesc, Radu";

const READING: [string, string, string, string, string][] = [
  [LIBRARY, "De la ce dată se deschide biblioteca și duminica?", "La 1 mai.", "La 1 iunie.", "După încheierea verii."],
  [LIBRARY, "Ce îi spui unui prieten care vrea doar să împrumute o carte duminică?", "Poate lua cartea de la parter între 10 și 14.", "Trebuie să meargă în sala de lectură.", "Va putea împrumuta cartea abia luni."],
  [PARK, "Ce trebuie să faci înainte de atelier?", "Să te înscrii cel târziu joi.", "Să cumperi un bilet de intrare în parc.", "Să ajungi în parc joi dimineață."],
  [PARK, "Ce se întâmplă dacă plouă?", "Atelierul are loc în interior.", "Atelierul se amână până duminică.", "Atelierul se anulează."],
  [PARK, "Cum îi explici regula unei persoane care vrea doar să se plimbe în parc?", "Poate intra gratuit, fără să se înscrie la atelier.", "Trebuie să se înscrie până joi ca să intre.", "Poate intra doar dacă nu plouă."],
  [EMAIL, "Ce s-a schimbat la întâlnire?", "Ziua, iar ora a rămas aceeași.", "Ora, iar ziua a rămas aceeași.", "Atât ziua, cât și ora."],
  [EMAIL, "Ce trebuie să facă Irina dacă nu poate participa?", "Să-i trimită lui Radu propunerile până miercuri dimineață.", "Să-i trimită organizatorului o cerere de amânare.", "Să aștepte să primească propunerile lui Radu."],
  [EMAIL, "Alege mesajul care redă pe scurt cele două informații importante.", "Ne întâlnim miercuri la ora stabilită. Dacă lipsești, Radu îți poate prezenta propunerile.", "Ne întâlnim la o oră nouă. Radu va trimite propunerile după întâlnire.", "Întâlnirea are loc marți. Irina va prezenta propunerile lui Radu."],
];
const NUMBER_EXAMPLES = new Map([
  ["ro-numere-1-10", ["Am două mere.", "În clasă sunt șapte copii.", "Pe masă sunt zece cărți."]],
  ["ro-numere-11-100", ["Am douăzeci și cinci de lei.", "În sală sunt treizeci de scaune.", "Cartea costă cincizeci de lei."]],
]);

export const ROMANIAN_READING_ID = "ro-b1-integrated-reading";
export const romanianReading = (): Item[] => READING.map(([context, prompt, answer, ...options]) => ({
  kind: "choice", context, prompt, big: false, listen: "", ...shuffleAnswer([answer, ...options], 0),
}));

// Exercises backed by the lesson's own Romanian examples. Skip rules, placeholders and incomplete fragments.
function examples(c: LessonContext) {
  const phrases = [...new Set(c.step.grammar.flatMap(({ pattern }) =>
    /[{}…→/_]/u.test(pattern) ? [] : pattern.match(/[^.!?]+[.!?]+(?:[»”])?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [],
  ))];
  return phrases.length ? phrases : NUMBER_EXAMPLES.get(c.step.id) ?? [];
}

export function hasRomanianPractice(c: LessonContext) {
  return c.course.iso === "ro" && (c.step.id.startsWith("grammar:") ||
    c.levelDef.units.some((u) => u.steps.some(({ id }) => id === c.step.id))) && examples(c).length > 0;
}

export function romanianPractice(c: LessonContext): Item[] {
  const phrases = examples(c);
  const items: Item[] = phrases.map((phrase) => ({ kind: "learn", phrase, translation: "", note: "" }));
  for (const [index, phrase] of phrases.entries()) {
    const alternatives = [...new Map([...phrases, ...c.step.vocabulary].map((value) => [normalize(value, "ro"), value])).entries()]
      .filter(([key]) => key && key !== normalize(phrase, "ro")).map(([, value]) => value);
    if (alternatives.length >= 2)
      items.push({ kind: "choice", prompt: "Ce ai auzit?", context: "", big: false, listen: phrase,
        ...shuffleAnswer([phrase, ...alternatives.slice(0, 3)], 0) });
    if (index === phrases.length - 1 || alternatives.length < 2)
      items.push({ kind: "input", prompt: "Scrie ce auzi.", context: "", listen: phrase, answer: phrase, accepted: [], literal: true });
  }
  return items;
}

export const romanianReviewSchema = z.object({ approved: z.array(z.int().positive()) });
export function romanianReviewPrompt(c: LessonContext, items: Item[]) {
  return [
    `Review these CEFR ${c.level} Romanian exercises for a learner whose language is ${langEn(c.native)}. Return only the numbers you approve.`,
    "Read the entire Romanian passage, sample, dialogue or audio transcript, even if the question can be answered without it.",
    "Approve only if the prompt has enough context, the Romanian has standard words, grammar and diacritics, and the answer and any tutorial notes are correct. For choices, exactly one option must be valid. Wrong distractors are allowed.",
    "Reject article/case mismatches such as «în parcul» without a modifier, incorrect agreement, word-for-word translations and answer leaks. Omit uncertain items.",
    ...items.map((item, index) => `${index + 1}. ${describeItem(item)}`),
  ].join("\n");
}
