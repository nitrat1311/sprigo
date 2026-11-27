import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { runMigrations } from "./migrate.ts";
import { MIGRATIONS } from "./migrations.ts";
import { wrapSqlJs } from "./sqljs.ts";

const SQL = await initSqlJs();

/** Two profiles with one enrollment each and a row in every child table, the way the app writes them. */
async function seeded() {
  const db = wrapSqlJs(new SQL.Database());
  await runMigrations(db, MIGRATIONS);
  for (const p of [1, 2]) {
    const e = p * 10;
    await db.execute("INSERT INTO profiles(id, name, color, ui_lang, native_lang, stats, active_enrollment_id) VALUES ($1, $2, '#000', 'en', 'en', '{}', $3)", [p, `p${p}`, e]);
    await db.execute("INSERT INTO enrollments(id, profile_id, course_iso, level) VALUES ($1, $2, 'en', 'A1')", [e, p]);
    await db.execute("INSERT INTO step_progress(enrollment_id, step_id, state) VALUES ($1, 's', 'done')", [e]);
    await db.execute("INSERT INTO content_cache(enrollment_id, step_id, content) VALUES ($1, 's', '{}')", [e]);
    await db.execute("INSERT INTO mistakes(enrollment_id, item) VALUES ($1, 'x')", [e]);
    await db.execute("INSERT INTO words(enrollment_id, word, translation) VALUES ($1, 'w', 't')", [e]);
    await db.execute("INSERT INTO bookmarks(enrollment_id, kind, ref) VALUES ($1, 'unit', 'A1:greetings')", [e]);
    await db.execute("INSERT INTO unit_notes(enrollment_id, unit_ref, text) VALUES ($1, 'A1:greetings', 'note')", [e]);
    await db.execute("INSERT INTO journal(profile_id, day, text) VALUES ($1, '2026-01-01', 'entry')", [p]);
    await db.execute("INSERT INTO memories(profile_id, kind, text, source) VALUES ($1, 'interest', 'x', 'tutor')", [p]);
    await db.execute("INSERT INTO tutors(id, profile_id, data) VALUES ($1, $2, '{}')", [`custom:${p}`, p]);
    await db.execute(
      "INSERT INTO speech_sessions(profile_id, enrollment_id, mode, utterances, silences, wpm, pause_ratio, long_pauses, level, fillers, words, native_words, speech_ms) VALUES ($1, $2, 'tutor', 1, 0, 90, 0.2, 0, 0.1, 0, 5, 0, 3000)",
      [p, e]);
  }
  return db;
}
const count = async (db: Awaited<ReturnType<typeof seeded>>, table: string) =>
  Number((await db.select<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);

test("a wrapped sql.js database enforces foreign keys, like the desktop sqlx pool", async () => {
  const db = wrapSqlJs(new SQL.Database());
  assert.deepEqual(await db.select("PRAGMA foreign_keys"), [{ foreign_keys: 1 }]);
  await assert.rejects(db.execute("INSERT INTO enrollments(profile_id, course_iso, level) VALUES (99, 'en', 'A1')"), "a row without its parent is rejected");
});

test("deleting a profile row alone cascades to every child row", async () => {
  const db = await seeded();
  await db.execute("DELETE FROM profiles WHERE id = 1");
  assert.deepEqual(await db.select("SELECT id FROM profiles"), [{ id: 2 }]);
  assert.deepEqual(await db.select("SELECT id FROM enrollments"), [{ id: 20 }]);
  for (const t of ["step_progress", "content_cache", "mistakes", "words", "bookmarks", "unit_notes"])
    assert.deepEqual(await db.select(`SELECT enrollment_id FROM ${t}`), [{ enrollment_id: 20 }], t);
  for (const t of ["journal", "memories", "tutors", "speech_sessions"])
    assert.deepEqual(await db.select(`SELECT profile_id FROM ${t}`), [{ profile_id: 2 }], t);
});

test("deleting an enrollment nulls the speech session's enrollment_id and keeps the row", async () => {
  const db = await seeded();
  await db.execute("DELETE FROM enrollments WHERE id = 10");
  assert.equal(await count(db, "enrollments"), 1);
  assert.deepEqual(await db.select("SELECT profile_id, enrollment_id FROM speech_sessions ORDER BY profile_id"), [
    { profile_id: 1, enrollment_id: null },
    { profile_id: 2, enrollment_id: 20 },
  ]);
  for (const t of ["step_progress", "content_cache", "mistakes", "words", "bookmarks", "unit_notes"])
    assert.deepEqual(await db.select(`SELECT enrollment_id FROM ${t}`), [{ enrollment_id: 20 }], t);
});
