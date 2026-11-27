// Generated content cache over any SqlDb: src/db.ts binds the app's database, the Node tests bind sql.js.
// Split from src/db.ts so the real SQL can be exercised without the browser/Tauri module scope (#192).
import type { SqlDb } from "./migrate";

export async function getCached<T>(d: SqlDb, enrollmentId: number, stepId: string): Promise<T | null> {
  const r = await d.select<{ content: string }>("SELECT content FROM content_cache WHERE enrollment_id = $1 AND step_id = $2", [enrollmentId, stepId]);
  return r[0] ? JSON.parse(r[0].content) : null;
}

export async function putCached(d: SqlDb, enrollmentId: number, stepId: string, content: unknown) {
  await d.execute("INSERT INTO content_cache(enrollment_id, step_id, content) VALUES ($1, $2, $3) ON CONFLICT DO UPDATE SET content = $3, created_at = CURRENT_TIMESTAMP", [enrollmentId, stepId, JSON.stringify(content)]);
}

/** Scored items of every cached step lesson (not legend/story/guide/exam/practice/word keys, which contain ":"), for the timed challenge. */
export async function cachedLessonItems<T extends { kind: string }>(d: SqlDb, enrollmentId: number) {
  const r = await d.select<{ content: string; course_iso: string }>(
    "SELECT content, course_iso FROM content_cache JOIN enrollments ON enrollments.id = enrollment_id WHERE enrollment_id = $1 AND step_id NOT LIKE '%:%'", [enrollmentId]);
  return r.flatMap(({ content, course_iso }) => {
    const items = JSON.parse(content) as (T & { romanianReview?: 1 | "course" })[];
    const review = items[0]?.romanianReview;
    return course_iso !== "ro" || review === 1 || review === "course" ? items : [];
  }).filter((it) => it.kind !== "learn");
}
