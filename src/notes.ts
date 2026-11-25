// Personal notes and journal (#46): the learner's own words, a note per unit and one entry per day.
// Pure, tested by src/notes.test.ts; storage in src/db.ts, the screen in src/screens/Notes.tsx.

export const NOTE_MAX = 2000;
export const JOURNAL_MAX = 4000;

/** Trimmed, `\n` line endings, at most `max` characters. Empty means "nothing written", the row is removed. */
export function cleanText(text: string, max: number) {
  return text.replace(/\r\n?/g, "\n").trim().slice(0, max);
}
export const cleanNote = (text: string) => cleanText(text, NOTE_MAX);
export const cleanEntry = (text: string) => cleanText(text, JOURNAL_MAX);

/** First line of a note, cut to `max` characters for a list row. */
export function snippet(text: string, max = 80) {
  const line = text.trim().split("\n")[0];
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Journal days are the learner's local calendar days, `YYYY-MM-DD` (src/progress.ts `today`). */
export const isDayKey = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);
