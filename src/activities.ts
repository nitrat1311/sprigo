// Activity registry (PLAN §3.2): per YAML type, what the AI must write (zod schema + guide) and how it
// maps onto the five lesson renderers. Pure module, tested by src/activities.test.ts.
import { z } from "zod";
import type { Cefr, Course, CourseLevel } from "./course";

export type Item =
  | { kind: "learn"; phrase: string; translation: string; note: string }
  | { kind: "choice"; prompt: string; context: string; big: boolean; listen: string; options: string[]; answer: number }
  | { kind: "bank"; prompt: string; answer: string[]; bank: string[] }
  | { kind: "input"; prompt: string; context: string; listen: string; answer: string; accepted: string[]; cells?: [string, string, string] } // cells: context shown as 3 boxes (conjugation)
  | { kind: "match"; pairs: [string, string][] }
  | { kind: "speak"; phrase: string; translation: string };

const s = z.string();
const options = z.array(s).min(3).max(4);
const idx = z.int().min(0).max(3);

type Def = { guide: string; schema: z.ZodType; toItem: (g: any) => Item | null };

const choice = (guide: string, extra: Record<string, z.ZodType>, map: (g: any) => { context?: string; big?: boolean; listen?: string } | null): Def => ({
  guide,
  schema: z.object({ prompt: s, ...extra, options, answer_index: idx }),
  toItem: (g) => {
    if (g.answer_index >= g.options.length || new Set(g.options.map((o: string) => normalize(o))).size !== g.options.length || givesAway(g.prompt, g.options, g.answer_index)) return null;
    const m = map(g);
    if (!m) return null;
    return { kind: "choice", prompt: g.prompt, context: m.context ?? "", big: !!m.big, listen: m.listen ?? "", ...shuffleAnswer(g.options, g.answer_index) };
  },
});

export const REGISTRY: Partial<Record<string, Def>> = {
  speak: {
    guide: "A short target-language sentence (3–8 words) from this step for the learner to say aloud, plus its translation. Everyday wording, no names or numbers.",
    schema: z.object({ sentence: s, translation: s }),
    toItem: (g) => ({ kind: "speak", phrase: g.sentence, translation: g.translation }),
  },
  learn: {
    guide: "Teach one new word or phrase from the step: the target-language phrase, its translation, and a one-sentence usage note in the native language.",
    schema: z.object({ phrase: s, translation: s, note: s }),
    toItem: (g) => ({ kind: "learn", ...g }),
  },
  word_select: choice("Ask for the target-language word that matches a native-language word (or the reverse). 4 options, one correct.", {}, () => ({})),
  multiple_choice: choice("A multiple-choice question about a word, phrase or translation. 4 options, one correct.", {}, () => ({})),
  reading_choice: choice("Put the complete target-language notice or email in passage. Ask a question in the learner's language that requires reading it, with exactly one correct option.",
    { passage: s }, (g) => g.passage.trim() ? { context: g.passage.trim() } : null),
  image_select: choice("Show one emoji that clearly depicts a vocabulary word; options are target-language words. 4 options, one correct.",
    { emoji: s }, (g) => ({ context: g.emoji, big: true })),
  listen_select: choice("The learner hears `audio_text` (a short target-language word or sentence) and picks what they heard or its meaning. Options must not show audio_text verbatim unless the question is 'which did you hear'.",
    { audio_text: s }, (g) => ({ listen: g.audio_text })),
  fill_blank: choice("A target-language sentence with exactly one blank written as ___; options fill the blank.",
    { sentence_with_blank: s }, (g) => {
      const blanks = g.sentence_with_blank.match(/_+/g);
      return blanks?.length === 1 && blanks[0] === "___" ? { context: g.sentence_with_blank } : null;
    }),
  sentence_complete: choice("The beginning of a target-language sentence; options are possible endings, only one natural and correct.",
    { sentence_start: s }, (g) => ({ context: `${g.sentence_start} …` })),
  error_correct: choice("A target-language sentence containing one typical learner mistake; options are rewrites, exactly one fully correct.",
    { wrong_sentence: s }, (g) => normalize(g.wrong_sentence) !== normalize(g.options[g.answer_index])
      ? { context: g.wrong_sentence } : null),
  dialogue: choice("A short dialogue (2–4 lines, 'Name: text') following the scenario/goal. End before the missing reply. Ask for the next line with one correct option.",
    { dialogue_lines: z.array(s).min(2).max(4) }, (g) => {
      const context = g.dialogue_lines.join("\n");
      return repeatsDialogueAnswer(context, g.options[g.answer_index]) ? null : { context };
    }),
  word_bank: {
    guide: "The learner builds a target-language sentence from word tiles. `answer_words` is the correct sentence split into words (punctuation attached to words), `distractor_words` 2–4 plausible wrong tiles. `prompt` is only the native-language meaning: never write the target sentence in it.",
    schema: z.object({ prompt: s, answer_words: z.array(s).min(2).max(10), distractor_words: z.array(s).min(1).max(4) }),
    toItem: (g) => ({ kind: "bank", prompt: g.prompt, answer: g.answer_words, bank: shuffle([...g.answer_words, ...g.distractor_words]) }),
  },
  translate: {
    guide: "The learner types a translation of `source_sentence` (native → target or target → native). `answer` is the best translation; `accepted_answers` lists other correct variants (may be empty).",
    schema: z.object({ prompt: s, source_sentence: s, answer: s, accepted_answers: z.array(s) }),
    toItem: (g) => ({ kind: "input", prompt: g.prompt, context: g.source_sentence, listen: "", answer: g.answer, accepted: g.accepted_answers }),
  },
  listen_type: {
    guide: "The learner hears `audio_text` (a short target-language sentence) and types it. `accepted_answers` lists acceptable spelling variants (may be empty).",
    schema: z.object({ prompt: s, audio_text: s, accepted_answers: z.array(s) }),
    toItem: (g) => ({ kind: "input", prompt: g.prompt, context: "", listen: g.audio_text, answer: g.audio_text, accepted: g.accepted_answers }),
  },
  match: {
    guide: "4–5 pairs of a target-language word and its native-language translation, all from this step.",
    schema: z.object({ pairs: z.array(z.object({ target: s, native: s })).min(3).max(5) }),
    toItem: (g) => ({ kind: "match", pairs: g.pairs.map((p: any) => [p.target, p.native]) }),
  },
  // speak / story / roleplay / video_call: not generated in v1 (DECISIONS D2, E1) — skipped.
};

export function repeatsDialogueAnswer(context: string, answer: string) {
  const normalized = normalize(answer);
  return !!normalized && context.split("\n").some((line) =>
    normalize(line.replace(/^[^:]*:\s*/, "")) === normalized);
}

export const DEFAULT_COUNT = 2; // DECISIONS B6: used when the YAML activity has no `count`

export type LessonActivity = { key: string; type: string; count: number; hints: Record<string, unknown> };
/** The step's activities that v1 can generate, each keyed a0, a1… for the lesson schema. */
export function plannedActivities(activities: { type: string; count?: number }[]): LessonActivity[] {
  return activities.filter((a) => REGISTRY[a.type]).map(({ type, count, ...hints }, i) => ({ key: `a${i}`, type, count: count ?? DEFAULT_COUNT, hints }));
}

/** One object with a field per activity: strict-mode friendly (no unions) and keeps the YAML order. */
export const lessonSchema = (acts: LessonActivity[]) =>
  z.object(Object.fromEntries(acts.map((a) => [a.key, z.array(REGISTRY[a.type]!.schema).min(1).max(a.count)])));

/** `langs`: the course and native languages, whose alphabets the items may use besides Latin. */
export function toItems(acts: LessonActivity[], out: Record<string, unknown[]>, langs: string[]): Item[] {
  const stray = strayScript(langs);
  return acts.flatMap((a) => (out[a.key] ?? []).filter((g) => !stray(g)).map((g) => {
    const item = REGISTRY[a.type]!.toItem(g);
    // Score alternate Romanian translations through contextual judging, not the model's unverified list.
    return a.type === "translate" && langs[0] === "ro" && item?.kind === "input" ? { ...item, accepted: [] } : item;
  }).filter((x): x is Item => !!x));
}

// Small models now and then slip a word of another alphabet into a sentence ("Tíz perccel後に", "емiatt").
const SCRIPTS: Record<string, string[]> = { Jpan: ["Hani", "Hira", "Kana"], Kore: ["Hang", "Hani"], Hans: ["Hani"], Hant: ["Hani"] };
/** Whether a generated item has a letter outside Latin and the alphabets of `langs`. */
export function strayScript(langs: string[]): (g: unknown) => boolean {
  const scripts = ["Latn", "Zyyy", "Zinh", ...langs.flatMap((l) => { const sc = new Intl.Locale(l).maximize().script ?? "Latn"; return SCRIPTS[sc] ?? [sc]; })];
  const re = new RegExp(`[^\\P{L}${scripts.map((sc) => `\\p{Script=${sc}}`).join("")}]`, "u");
  return (g) => re.test(JSON.stringify(g));
}

// ---- Prompts ----

export type LessonContext = { course: Course; level: Cefr; levelDef: CourseLevel; unitTitle: string; step: CourseLevel["units"][number]["steps"][number]; native: string };
export const langEn = (iso: string) => new Intl.DisplayNames(["en"], { type: "language" }).of(iso) ?? iso;

export function systemPrompt(c: Pick<LessonContext, "course" | "level" | "native">) {
  return [
    `You write exercises for a language-learning app. The learner is a native ${langEn(c.native)} speaker learning ${c.course.name} at CEFR level ${c.level}.`,
    `Target-language text must be natural and suit ${c.level}. Every instruction ("prompt"), translation, note and explanation is written in ${langEn(c.native)}.`,
    "Practice the step's vocabulary and grammar. Choice questions have exactly one correct option. Do not repeat the same sentence across exercises.",
    ...(c.course.iso === "ro" ? ["Use standard Romanian with ă, â, î, ș and ț. Check agreement, clitics and verb forms. Before returning any item, verify the prompt, the marked answer, and every accepted variant against the source meaning. Use distinct distractors that differ in meaning or grammatical fit. Acknowledge uncertainty rather than invent a rule or word."] : []),
    "Respond only with JSON matching the schema.",
  ].join("\n");
}

/** One line per past mistake for the prompt (PLAN §3.3); learn/match items carry no single answer. */
export function mistakeLine(it: Item): string | null {
  if (it.kind === "choice") return `${it.prompt} → ${it.options[it.answer]}`;
  if (it.kind === "input") return `${it.prompt} → ${it.answer}`;
  if (it.kind === "bank") return `${it.prompt} → ${it.answer.join(" ")}`;
  if (it.kind === "speak") return `Say aloud → ${it.phrase}`;
  return null;
}

export function lessonPrompt(c: LessonContext, acts: LessonActivity[], mistakes: string[] = [], about: string[] = []) {
  const st = c.step;
  return [
    `Unit: ${c.unitTitle}`, `Step: ${st.title}${st.description ? ` — ${st.description}` : ""}`,
    st.vocabulary.length ? `Vocabulary: ${st.vocabulary.join(", ")}` : "",
    st.grammar.length ? `Grammar patterns: ${st.grammar.map((g) => g.pattern).join(" | ")}` : "",
    "", "Write these exercise groups (field name → exactly N items):",
    ...acts.map((a) => `- ${a.key}: ${a.count} × ${a.type}. ${REGISTRY[a.type]!.guide}${Object.keys(a.hints).length ? ` Hints: ${JSON.stringify(a.hints)}` : ""}`),
    mistakes.length ? `\nThe learner recently got these wrong (exercise → correct answer):\n${mistakes.map((m) => `- ${m}`).join("\n")}\n` +
      "Where it fits this step's topic, reuse 1–2 of these words or patterns in new exercises. Do not copy them, and stay on the step's topic." : "",
    about.length ? `\nAbout the learner: ${about.join(" ")}\nWhere it fits naturally, set a few example sentences in their world (their interests, plans, life). Stay on the step's topic and vocabulary.` : "",
  ].filter((l) => l !== "").join("\n");
}

// ---- Second look: local models now and then write a broken exercise ("Örülök nek", a question with no right option) ----
// Two checks, measured on 466 Hungarian exercises against human-grade judges: a verdict per exercise, reasoned before it is
// given (a lesson-wide list of errors dropped as many good exercises as bad ones), and choice questions solved without the key.

export const reviewSystem = "You check exercises in a language-learning app.\nRespond only with JSON matching the schema.";
export const checkSchema = z.object({ checks: z.array(z.object({ exercise: z.int(), check: s, ok: z.boolean() })) });
export const solveSchema = z.object({ answers: z.array(z.object({ question: z.int(), reasoning: s, right: z.array(z.int()) })) });
export const solveSystem = (course: string) => `You are a native ${course} teacher solving exercises from a language-learning app.\nRespond only with JSON matching the schema.`;

type Reviewed = Pick<LessonContext, "course" | "level" | "native"> & { step: { title: string; description?: string } };

const asked = (it: { prompt: string; context: string; listen: string }) => [it.prompt, it.context, it.listen && `(audio: ${it.listen})`].filter(Boolean).join(" ");
/** One exercise in one line, with its answer. */
export function describeItem(it: Item): string {
  switch (it.kind) {
    case "learn": return `Teaches: ${it.phrase} = ${it.translation}. Note: ${it.note}`;
    case "speak": return `Say aloud: ${it.phrase} = ${it.translation}`;
    case "match": return `Match the pairs: ${it.pairs.map(([a, b]) => `${a} = ${b}`).join("; ")}`;
    case "choice": return `${asked(it)} Options: ${it.options.map((o, i) => (i === it.answer ? `${o} (correct)` : o)).join(" | ")}`;
    case "input": return `${asked(it)} Answer: ${[it.answer, ...it.accepted].join(" / ")}`;
    case "bank": {
      const wrong = [...it.bank];
      for (const w of it.answer) if (wrong.includes(w)) wrong.splice(wrong.indexOf(w), 1);
      return `Build from word tiles: ${it.prompt} Answer: ${it.answer.join(" ")} (wrong tiles: ${wrong.join(", ")})`;
    }
  }
}

/** `text`: the reading some questions are about, if any. */
export function checkPrompt(c: Reviewed, items: Item[], text = "") {
  const lang = c.course.name, native = langEn(c.native);
  return [
    `Step: ${c.step.title}${c.step.description ? ` — ${c.step.description}` : ""}`,
    ...(text ? [`Some questions are about this text: ${text}`] : []),
    `Check these exercises for a native ${native} speaker learning ${lang} at CEFR level ${c.level}, as a native ${lang} teacher would.`,
    `Go through every exercise in order. \`check\`: one short sentence verifying its answer and its ${lang}. \`ok\`: false if it has a real error:`,
    "- the answer marked correct is wrong, or another option also fits: check every option against the sentence and the instruction;",
    "- the answer, a teaching card, a pair or a sentence the learner reads or hears as correct has a word that does not exist, a word ending split off as its own word, a grammar mistake or wording no native speaker would use;",
    "- a translation, pair or grammar note is wrong;",
    `- an instruction is not in ${native}, or the exercise makes no sense.`,
    "Wrong options and wrong tiles are meant to be wrong: never count an exercise as wrong only because a wrong option is wrong.",
    "An exercise that is correct is ok, even if you would word it differently.",
    "",
    ...items.map((it, i) => `${i + 1}. ${describeItem(it)}`),
  ].join("\n");
}

/** The choice questions, numbered as in the lesson and without their key; "" when there are none. */
export function solvePrompt(c: Reviewed, items: Item[], text = "") {
  const qs = items.flatMap((it, i) => (it.kind === "choice" ? [`Question ${i + 1}: ${asked(it)}\n${it.options.map((o, k) => `  ${k + 1}) ${o}`).join("\n")}`] : []));
  return qs.length ? [
    ...(text ? [`Some questions are about this text: ${text}`] : []),
    `The learner's language is ${langEn(c.native)}. For each question, check every option on its own against the question: \`reasoning\` in one short sentence, then \`right\`: the numbers of all options that are a correct answer (none, one or several).`,
    "", ...qs,
  ].join("\n") : "";
}

/** Indexes of the exercises the checks call wrong: a failed check, or a question whose right options are not just its key. */
export function rejected(items: Item[], checked: z.infer<typeof checkSchema> | null, solved: z.infer<typeof solveSchema> | null): Set<number> {
  const bad = new Set((checked?.checks ?? []).filter((x) => !x.ok).map((x) => x.exercise - 1));
  for (const a of solved?.answers ?? []) {
    const it = items[a.question - 1], right = new Set(a.right);
    if (it?.kind === "choice" && (right.size !== 1 || !right.has(it.answer + 1))) bad.add(a.question - 1);
  }
  return bad;
}

// ---- Answer checking (DECISIONS C4: normalized string match first, AI only if that fails) ----

/** `lang`: the course language, so Turkish İ/I lower to i/ı (#96). Without it the system locale decides; the
 *  stray dot (U+0307) "İ" leaves outside Turkish is dropped so it still matches "i". */
export const normalize = (t: string, lang?: string) =>
  (lang === "ro" ? t.normalize("NFKC").toLocaleLowerCase(lang).replace(/ş/g, "ș").replace(/ţ/g, "ț") : t.normalize("NFKC").toLocaleLowerCase(lang)).replace(/\u0307/g, "").replace(/[’`]/g, "'").replace(/[\p{P}\p{S}]/gu, (ch) => (ch === "'" ? ch : " ")).replace(/\s+/g, " ").trim();

/** Whether `given` has exactly the words of `answer`, in any order: only then can word tiles in another order be right. */
export const sameWords = (given: string, answer: string, lang?: string) => {
  const words = (s: string) => normalize(s, lang).split(" ").filter(Boolean).sort().join(" ");
  return words(given) === words(answer);
};

/** Shown instead of a word-tile prompt (also for items cached before this fix). Models sometimes write the tile sentence into the prompt ("'They played…' (Dün…)"): cut it out, keep the meaning. */
export function hideAnswer(prompt: string, answer: string) {
  const words = answer.replace(/[.!?…]+$/, "").trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words[0]) return prompt;
  const rest = prompt.replace(new RegExp(`${words.join("\\s+")}[.!?…]*`, "iu"), "")
    .replace(/(["'“”‘’«»])\s*(["'“”‘’«»])/g, "").trim()
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "");
  const m = /^\((.*)\)$/s.exec(rest);
  return m ? m[1].trim() : rest;
}

export const matchesAnswer = (given: string, item: { answer: string; accepted: string[] }, lang?: string) =>
  [item.answer, ...item.accepted].some((a) => normalize(a, lang) === normalize(given, lang));

/** Expected words (normalized) the transcript doesn't contain (order-free, each heard word used once). Shown as "not caught" (#33). */
export function speechMisses(expected: string, heard: string, lang?: string) {
  const want = normalize(expected, lang).split(" ").filter(Boolean);
  // Whisper sometimes writes neighbouring words as one ("jónapot" for "jó napot"): such a word counts as the words it joins.
  const got = normalize(heard, lang).split(" ").flatMap((h) => {
    if (want.includes(h)) return [h];
    for (let i = 0; i < want.length; i++) for (let j = i + 2; j <= Math.min(want.length, i + 3); j++)
      if (want.slice(i, j).join("") === h) return want.slice(i, j);
    return [h];
  });
  return want.filter((w) => { const k = got.indexOf(w); if (k >= 0) got.splice(k, 1); return k < 0; });
}
const ROMANIAN_NUMBERS: Record<string, string> = {
  zero: "0", unu: "1", una: "1", doi: "2", două: "2", trei: "3", patru: "4", cinci: "5", șase: "6", șapte: "7", opt: "8", nouă: "9", zece: "10",
  unsprezece: "11", doisprezece: "12", douăsprezece: "12", treisprezece: "13", paisprezece: "14", cincisprezece: "15",
  șaisprezece: "16", șaptesprezece: "17", optsprezece: "18", nouăsprezece: "19",
  douăzeci: "20", treizeci: "30", patruzeci: "40", cincizeci: "50", șaizeci: "60", șaptezeci: "70", optzeci: "80", nouăzeci: "90",
};
const ROMANIAN_TENS = /(^| )(douăzeci|treizeci|patruzeci|cincizeci|șaizeci|șaptezeci|optzeci|nouăzeci) și (unu|una|doi|două|trei|patru|cinci|șase|șapte|opt|nouă)(?= |$)/gu;

function romanianTranscript(text: string): string[] {
  return normalize(text, "ro")
    .replace(ROMANIAN_TENS, (_, space: string, tens: string, ones: string) => space + (Number(ROMANIAN_NUMBERS[tens]) + Number(ROMANIAN_NUMBERS[ones])))
    .split(" ").filter(Boolean).map((word) => ROMANIAN_NUMBERS[word] ?? word);
}

function romanianSpeechScore(expected: string, heard: string) {
  const want = romanianTranscript(expected), got = romanianTranscript(heard);
  if (!want.length) return 0;
  const critical = (words: string[]) => words.filter((w) => /^(?:\d+|nu|n|nici|niciodată|niciun|nicio|nimeni|nimic)$/.test(w))
    .map((w) => w === "n" ? "nu" : w).join(" ");
  if (critical(want) !== critical(got)) return 0;
  // Use words appearing once in both transcripts to detect reordering even when Whisper missed another word.
  const shared = new Set(want.filter((w) => want.indexOf(w) === want.lastIndexOf(w) && got.includes(w) && got.indexOf(w) === got.lastIndexOf(w)));
  const order = (words: string[]) => words.filter((w) => shared.has(w)).join(" ");
  if (order(want) !== order(got)) return 0;
  return 1 - speechMisses(want.join(" "), got.join(" "), "ro").length / want.length;
}

/** Speaking check: share of the expected words the transcript contains, with Romanian meaning checks. */
export function speechScore(expected: string, heard: string, lang?: string) {
  if (lang === "ro") return romanianSpeechScore(expected, heard);
  const want = normalize(expected, lang).split(" ").filter(Boolean).length;
  return want ? 1 - speechMisses(expected, heard, lang).length / want : 0;
}
export const SPEECH_PASS = 0.75; // ponytail: word overlap, not phoneme scoring; whisper already forgives accents

// ---- Practice built locally from the learner's own words (no AI call) ----

export type PracticeWord = { word: string; translation: string; strength: number };
export const LISTEN_MIN_WORDS = 4;
export const MADNESS_MIN_WORDS = 5;

/** Word Rush: boards of 5 random pairs from the learner's words (words repeat across boards); played against the clock. */
/** Speaking practice: the weakest learned phrases (multi-word first), said aloud. */
export function speakItems(words: PracticeWord[], n = 3): Item[] {
  const multi = (w: PracticeWord) => +(w.word.trim().split(/\s+/).length > 1);
  return [...words].sort((a, b) => multi(b) - multi(a) || a.strength - b.strength).slice(0, n)
    .map((w) => ({ kind: "speak", phrase: w.word, translation: w.translation }));
}

export function madnessItems(words: PracticeWord[], boards = 20): Item[] {
  if (words.length < MADNESS_MIN_WORDS) return [];
  return Array.from({ length: boards }, () => ({
    kind: "match" as const, // ponytail: sort-shuffle, bias is fine for a game
    pairs: [...words].sort(() => Math.random() - 0.5).slice(0, MADNESS_MIN_WORDS).map((w): [string, string] => [w.word, w.translation]),
  }));
}

/** Weakest words first: hear the word, pick it among 3 other known words (from `pool`, by default the same words). */
export function listenItems(words: PracticeWord[], prompt: string, n = 6, pool = words): Item[] {
  if (pool.length < LISTEN_MIN_WORDS) return [];
  const weakest = shuffle(words).sort((a, b) => a.strength - b.strength).slice(0, n);
  return weakest.map((w) => {
    const options = shuffle([w.word, ...shuffle(pool.filter((o) => o.word !== w.word)).slice(0, 3).map((o) => o.word)]);
    return { kind: "choice", prompt, context: "", big: false, listen: w.word, options, answer: options.indexOf(w.word) };
  });
}

/** The question names the correct option and no other ('"evening" means which word?' → evening): nothing left to answer. */
export function givesAway(prompt: string, options: string[], answer: number) {
  const n = (x: string) => normalize(x).replace(/'/g, " ").replace(/\s+/g, " ").trim(); // quotes around the word too
  const p = ` ${n(prompt)} `, has = (o: string) => !!n(o) && p.includes(` ${n(o)} `);
  return has(options[answer]) && !options.some((o, i) => i !== answer && has(o));
}

// ---- helpers ----

export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
// Models tend to put the answer first; shuffle so position carries no hint.
export function shuffleAnswer(opts: string[], answer: number) {
  const options = shuffle(opts);
  return { options, answer: options.indexOf(opts[answer]) };
}

/** A translation is usable when it is non-empty and, unless both languages are the same, not just the reply repeated. */
export function validTranslation(reply: string, translation: string, sameLang = false) {
  const a = reply.trim().toLocaleLowerCase(), b = translation.trim().toLocaleLowerCase();
  return b !== "" && (sameLang || a !== b);
}

/** The corrected sentence alone; the model may add a short explanation after it. */
const correctedSentence = (x: string) => x.split(/[.!?]\s+|\s+[—–-]\s+|\s+\(/)[0];

/** A correction that only repeats the learner's sentence, even with an explanation after it, is not a correction. */
export function isEchoCorrection(original: string, correction: string, lang?: string) {
  const a = normalize(original, lang);
  return a !== "" && normalize(correctedSentence(correction), lang) === a;
}

/** A reply's translation: its own when usable, else a second pass's — kept even when it repeats the reply, as "Taxi" or "No" do. "" when the retry fails. */
export async function translationFor(reply: string, translation: string, retry: () => Promise<string>, sameLang = false) {
  if (validTranslation(reply, translation, sameLang)) return translation.trim();
  try { return (await retry()).trim(); } catch { return ""; }
}
