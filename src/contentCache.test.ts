import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { runMigrations } from "./migrate.ts";
import { MIGRATIONS } from "./migrations.ts";
import { wrapSqlJs } from "./sqljs.ts";
import { cachedLessonItems, getCached, putCached } from "./contentCache.ts";
import { practiceId } from "./practice.ts";
import { wordKey } from "./lookup.ts";

const SQL = await initSqlJs();

async function seeded() {
  const db = wrapSqlJs(new SQL.Database());
  await runMigrations(db, MIGRATIONS);
  await db.execute("INSERT INTO profiles(id, name, color, ui_lang, native_lang, stats) VALUES (1, 'p', '#000', 'en', 'en', '{}')");
  await db.execute("INSERT INTO enrollments(id, profile_id, course_iso, level) VALUES (10, 1, 'en', 'B2')");
  return db;
}
const cachedKeys = async (db: Awaited<ReturnType<typeof seeded>>) =>
  (await db.select<{ step_id: string }>("SELECT step_id FROM content_cache WHERE enrollment_id = $1 ORDER BY step_id", [10])).map((r) => r.step_id);

test("the same practice unit and word cached at two levels stay two rows with their own content", async () => {
  const db = await seeded();
  const b2Practice = practiceId("B2", "society-and-environment");
  const c1Practice = practiceId("C1", "society-and-environment");
  const b2Word = wordKey("B2", "Haus", "de");
  const c1Word = wordKey("C1", "Haus", "de");

  await putCached(db, 10, b2Practice, { reading: { title: "B2 text" } });
  await putCached(db, 10, c1Practice, { reading: { title: "C1 text" } });
  await putCached(db, 10, b2Word, { lemma: "das Haus", example: "B2 example" });
  await putCached(db, 10, c1Word, { lemma: "das Haus", example: "C1 example" });

  assert.deepEqual(await getCached(db, 10, b2Practice), { reading: { title: "B2 text" } });
  assert.deepEqual(await getCached(db, 10, c1Practice), { reading: { title: "C1 text" } });
  assert.deepEqual(await getCached(db, 10, b2Word), { lemma: "das Haus", example: "B2 example" });
  assert.deepEqual(await getCached(db, 10, c1Word), { lemma: "das Haus", example: "C1 example" });
  assert.deepEqual(await cachedKeys(db), [b2Word, b2Practice, c1Word, c1Practice].sort());
});

test("cachedLessonItems skips level-scoped practice and word rows, and every other keyed row", async () => {
  const db = await seeded();
  const scored = [{ kind: "learn", term: "Haus" }, { kind: "choice", prompt: "das ___" }];
  await putCached(db, 10, "society-and-environment-1", scored);
  await putCached(db, 10, practiceId("B2", "society-and-environment"), { reading: { title: "B2 text" }, warmup: [] });
  await putCached(db, 10, practiceId("C1", "society-and-environment"), { reading: { title: "C1 text" }, warmup: [] });
  await putCached(db, 10, wordKey("B2", "Haus", "de"), { lemma: "das Haus" });
  await putCached(db, 10, wordKey("C1", "Haus", "de"), { lemma: "das Haus" });
  await putCached(db, 10, "guide:B2:society-and-environment", { vocabulary: [] });
  await putCached(db, 10, "garden:note", { text: "note" });

  assert.equal((await cachedKeys(db)).length, 7);
  assert.deepEqual(await cachedLessonItems(db, 10), [{ kind: "choice", prompt: "das ___" }]);
});
