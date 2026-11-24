import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHARACTERS, FREE_GOAL, parseTalkId, talkId, type BuiltinId, type CharacterId } from "./characters.ts";
import { ladderDrill, drillId } from "./drills.ts";
import { rehearseId } from "./rehearsal.ts";
import { characterOf, type CustomTutor } from "./tutors.ts";

const load = (l: string) => JSON.parse(readFileSync(new URL(`./locales/${l}.json`, import.meta.url), "utf8"));
const locales = [load("en"), load("tr")];
/** The built-in cast; custom tutors are per profile and only reach parseTalkId through a resolver. */
const ids = Object.keys(CHARACTERS) as BuiltinId[];

test("three women, three men, distinct names and voices", () => {
  assert.equal(ids.length, 6);
  assert.equal(ids.filter((k) => CHARACTERS[k].gender === "f").length, 3);
  const voices = ids.map((k) => CHARACTERS[k].kokoroVoice);
  assert.equal(new Set(voices).size, 6);
  assert.equal(new Set(ids.map((k) => CHARACTERS[k].name)).size, 6);
  for (const k of ids) {
    const { gender, kokoroVoice } = CHARACTERS[k];
    assert.match(kokoroVoice, gender === "f" ? /^[ab]f_/ : /^[ab]m_/, k);
  }
  assert.ok(voices.some((v) => v.startsWith("bf_") || v.startsWith("bm_")));
});

test("4-6 topics each with unique ids and titles in en and tr", () => {
  for (const k of ids) {
    const { topics } = CHARACTERS[k];
    assert.ok(topics.length >= 4 && topics.length <= 6, k);
    assert.equal(new Set(topics.map((x) => x.id)).size, topics.length, k);
    for (const x of topics) {
      assert.notEqual(x.id, "free");
      for (const l of locales) assert.ok(typeof l.roleplay.topics[k]?.[x.id] === "string", `${k}.${x.id}`);
    }
  }
});

test("talk ids round-trip", () => {
  for (const k of ids) for (const x of CHARACTERS[k].topics) for (const voice of [false, true])
    assert.deepEqual(parseTalkId(talkId(voice, k, x.id)), { voice, who: k, topic: x });
  const free = "Çay: şeker mi, limon mu?";
  assert.deepEqual(parseTalkId(talkId(true, "leo", { free })), { voice: true, who: "leo", topic: { goal: `have a natural conversation about: ${free}` } });
});

test("a custom tutor id needs the resolver, and round-trips through it", () => {
  const ada: CustomTutor = {
    id: "custom:ada-1", name: "Ada", gender: "f", color: "#2f80ed", kokoroVoice: "af_bella",
    persona: "A patient neighbour.", topics: [{ id: "intro", goal: "introduce yourself" }],
  };
  const who = ada.id as CharacterId, resolve = (id: CharacterId) => characterOf(id, [ada]);
  assert.deepEqual(parseTalkId(talkId(false, who, "intro"), resolve), { voice: false, who, topic: ada.topics[0] });
  assert.deepEqual(parseTalkId(talkId(true, who, { free: "the weather" }), resolve), { voice: true, who, topic: { goal: `${FREE_GOAL}the weather` } });
  const d = ladderDrill(1, "the weather");
  assert.deepEqual(parseTalkId(drillId(ada.id, d), resolve)?.drill, d);
  const brief = { who: "my neighbour", about: "the bins", formality: "neutral" as const };
  assert.deepEqual(parseTalkId(rehearseId(true, who, brief), resolve), { voice: true, who, topic: { goal: "the bins" }, rehearse: brief });
  assert.equal(parseTalkId(talkId(false, who, "intro")), null, "no resolver = no custom tutor");
  assert.equal(parseTalkId("chat:custom:gone:intro", resolve), null, "a resolver that finds nothing rejects the id");
  assert.equal(parseTalkId(talkId(false, who, "nope"), resolve), null, "a topic the tutor does not have");
});

test("broken talk ids are null", () => {
  for (const bad of ["", "chat", "chat:mia", "chat:mia:nope", "chat:zed:checkIn", "talk:mia:checkIn", "chat:mia:free:", "chat:mia:free:  ", "chat:toString:x"]) assert.equal(parseTalkId(bad), null, bad);
});

test("every character has a valid, distinct face", () => {
  const faces = ids.map((k) => CHARACTERS[k].face);
  for (const [i, f] of faces.entries()) {
    assert.ok(Number.isInteger(f.skin) && f.skin >= 0 && f.skin <= 4, ids[i]);
    assert.ok(Number.isInteger(f.hairColor) && f.hairColor >= 0 && f.hairColor <= 5, ids[i]);
  }
  assert.equal(new Set(faces.map((f) => JSON.stringify(f))).size, faces.length);
});
