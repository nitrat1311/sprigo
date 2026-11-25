// B: unit and step titles stay English (the course's meta language); the learner's native language is shown under
// them. Translations are asked for lazily, one batched call per level, and cached in device_settings by
// (course, native language): they are the same for every profile on the device.
// The AI and database modules are imported lazily so src/titleTranslations.test.ts runs in node without them.
import { z } from "zod";

/** Titles that are not blank and have no cached translation yet: first-seen order, no duplicates. */
export function missingTitles(titles: string[], cache: Record<string, string>): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (const title of titles) {
    const t = title.trim();
    const hit = cache[title];
    if (!t || seen.has(t) || (typeof hit === "string" && hit.trim())) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** `title-translations.<course iso>.<native iso>` holds a JSON object: English title → translation. */
const cacheKey = (iso: string, native: string) => `title-translations.${iso}.${native}`;

/** The cached translations for a course into one native language; `{}` when there are none or the row is unreadable. */
export async function cachedTitleTranslations(iso: string, native: string): Promise<Record<string, string>> {
  try {
    const { getSetting } = await import("./db");
    const raw = await getSetting(cacheKey(iso, native));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch (e) {
    console.debug("title translations: could not read the cache", e);
    return {};
  }
}

// One pair per title: a JSON object keyed by arbitrary titles is rejected by OpenAI's strict structured output.
const replySchema = z.array(z.object({ title: z.string(), translation: z.string() }));

const inflight = new Map<string, Promise<Record<string, string>>>();

/** Translates `titles` in ONE AI call and caches the answers; never throws, so a failure only leaves English. */
export function translateTitles(course: { iso: string; name: string }, native: string, titles: string[]): Promise<Record<string, string>> {
  const ask = missingTitles(titles, {});
  if (!ask.length) return Promise.resolve({});
  const k = `${cacheKey(course.iso, native)}:${ask.join("\n")}`;
  let p = inflight.get(k);
  if (!p) {
    p = run(course, native, ask).finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

async function run(course: { iso: string; name: string }, native: string, titles: string[]): Promise<Record<string, string>> {
  try {
    const { generate } = await import("./ai");
    const { langEn } = await import("./activities");
    const system = [
      `You translate unit and lesson titles of a ${course.name} language course into ${langEn(native)}.`,
      "Keep each translation short (1–5 words) and natural for a course syllabus; keep proper nouns as they are.",
      "One entry per title: `title` exactly as written, `translation` in the native language. No explanations, quotes or numbering.",
    ].join(" ");
    const prompt = titles.map((t) => `- ${t}`).join("\n");
    // Background work: one try, no provider switch (a missing subtitle is not worth telling the learner about).
    const rows = await generate(replySchema, system, prompt, "title", undefined, undefined, 60);
    const want = new Set(titles), add: Record<string, string> = {};
    for (const r of rows) if (want.has(r.title) && r.translation.trim()) add[r.title] = r.translation.trim();
    if (Object.keys(add).length) await persist(cacheKey(course.iso, native), add);
    return add;
  } catch (e) {
    console.debug("title translations: the AI call failed", e);
    return {};
  }
}

// Two levels of the same course can finish together; the write reads the row again so neither batch loses the other.
let writes: Promise<unknown> = Promise.resolve();
function persist(key: string, add: Record<string, string>): Promise<void> {
  const p = writes.then(async () => {
    const { getSetting, setSetting } = await import("./db");
    const raw = await getSetting(key);
    const cur = raw ? JSON.parse(raw) as Record<string, string> : {};
    await setSetting(key, JSON.stringify({ ...cur, ...add }));
  });
  writes = p.catch(() => {});
  return p;
}
