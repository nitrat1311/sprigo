import { test } from "node:test";
import assert from "node:assert/strict";
import { isTutorId, newTutorId, parseTutorPackage, TUTOR_AVATAR_MAX, TUTOR_FACE, TUTOR_JSON_SCHEMA, TUTOR_PERSONA_MAX, TUTOR_SCENE_MAX, characterOf, toCharacter, type CustomTutor } from "./tutors.ts";

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const WEBP = [...Buffer.from("RIFF"), 36, 0, 0, 0, ...Buffer.from("WEBP")];
const png = (bytes = PNG) => `data:image/png;base64,${b64(bytes)}`;
const webp = () => `data:image/webp;base64,${b64(WEBP)}`;

const valid = {
  name: "Ada",
  gender: "f",
  color: "#2f80ed",
  kokoroVoice: "af_bella",
  persona: "A patient neighbour who chats about the day over tea.",
  topics: [{ id: "intro", goal: "introduce yourself" }, { id: "plans", goal: "talk about the weekend" }],
};
const errors = (input: unknown) => {
  const r = parseTutorPackage(input);
  assert.equal(r.ok, false);
  return r.ok ? [] : r.errors;
};

test("a valid package parses, with PNG and WebP images", () => {
  const r = parseTutorPackage({ ...valid, avatar: png(), scene: webp() });
  assert.ok(r.ok);
  assert.deepEqual(r.tutor.topics[0], { id: "intro", goal: "introduce yourself" });
  assert.equal(r.tutor.avatar, png());
  assert.ok(parseTutorPackage(valid).ok, "images are optional");
});

test("trims name and persona", () => {
  const r = parseTutorPackage({ ...valid, name: "  Ada  ", persona: " Hi " });
  assert.ok(r.ok);
  assert.deepEqual([r.tutor.name, r.tutor.persona], ["Ada", "Hi"]);
});

test("SVG avatars are rejected, whatever they claim to be", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`;
  for (const url of [`data:image/svg+xml;base64,${b64([...Buffer.from(svg)])}`, `data:image/svg+xml,${svg}`, `data:image/png;base64,${b64([...Buffer.from(svg)])}`])
    assert.match(errors({ ...valid, avatar: url })[0], /^avatar: /, url);
});

test("a mime type that does not match the bytes is rejected", () => {
  // A real PNG declared as WebP, and a GIF declared as PNG.
  assert.match(errors({ ...valid, avatar: png().replace("image/png", "image/webp") })[0], /says image\/webp but is a image\/png/);
  const gif = `data:image/png;base64,${b64([...Buffer.from("GIF89a"), 1, 2, 3])}`;
  assert.match(errors({ ...valid, avatar: gif })[0], /avatar: is not a PNG or WebP image/);
});

test("images over the cap are rejected before and after decoding", () => {
  assert.match(errors({ ...valid, avatar: png([...PNG, ...new Uint8Array(TUTOR_AVATAR_MAX)]) })[0], /larger than 512 KB/);
  assert.match(errors({ ...valid, scene: png([...PNG, ...new Uint8Array(TUTOR_SCENE_MAX)]) })[0], /larger than 2048 KB/);
  assert.match(errors({ ...valid, avatar: "not a data url" })[0], /must be a base64 PNG or WebP data URL/);
  assert.match(errors({ ...valid, avatar: "data:image/png;base64,@@@" })[0], /is not valid base64/);
});

test("the voice must be a Kokoro id for the tutor's gender", () => {
  for (const kokoroVoice of ["bella", "zx_bella", "af_Bella", "af_", ""]) assert.match(errors({ ...valid, kokoroVoice })[0], /^kokoroVoice: /, kokoroVoice);
  assert.match(errors({ ...valid, kokoroVoice: "am_puck" })[0], /is not a female voice/);
  assert.match(errors({ ...valid, gender: "m", kokoroVoice: "bf_emma" })[0], /is not a male voice/);
});

test("persona, name, color and topics follow their caps", () => {
  assert.match(errors({ ...valid, persona: "x".repeat(TUTOR_PERSONA_MAX + 1) })[0], /persona: /);
  assert.match(errors({ ...valid, name: "x".repeat(41) })[0], /name: /);
  assert.match(errors({ ...valid, color: "var(--green)" })[0], /color: use a hex color/);
  assert.match(errors({ ...valid, topics: [] })[0], /topics: /);
  assert.match(errors({ ...valid, topics: Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, goal: "g" })) })[0], /topics: /);
  assert.match(errors({ ...valid, topics: [{ id: "free", goal: "g" }] })[0], /is reserved for free talk/);
  assert.match(errors({ ...valid, topics: [{ id: "a", goal: "g" }, { id: "a", goal: "h" }] })[0], /topics\.1\.id: is used twice/);
});

test("a missing field reports its path", () => {
  const { persona: _, ...withoutPersona } = valid;
  assert.match(errors(withoutPersona)[0], /^persona: /);
  assert.deepEqual(errors("nope").length, 1);
});

test("the JSON Schema describes the package for the template repo", () => {
  const schema = JSON.stringify(TUTOR_JSON_SCHEMA);
  for (const key of ["name", "gender", "color", "kokoroVoice", "persona", "face", "topics", "avatar", "scene"]) assert.ok(schema.includes(`"${key}"`), key);
  assert.ok(schema.includes('"$schema"'));
});

test("tutor ids are custom-prefixed and never a built-in character id", () => {
  const id = newTutorId();
  assert.ok(isTutorId(id) && id.startsWith("custom:") && id.length > "custom:".length);
  for (const bad of ["", "custom:", "mia"]) assert.equal(isTutorId(bad), false, bad);
});

test("characterOf resolves built-ins, and a saved tutor as a character", () => {
  const ada: CustomTutor = { ...valid, id: "custom:ada" };
  assert.deepEqual(characterOf("custom:ada", [ada]), toCharacter(ada));
  assert.deepEqual(Object.keys(toCharacter(ada)).sort(), ["color", "face", "gender", "kokoroVoice", "name", "persona", "topics"]);
  assert.deepEqual(toCharacter(ada).face, TUTOR_FACE, "an avatar-only tutor gets the neutral face");
  const withImages = toCharacter({ ...ada, avatar: png(), scene: webp() });
  assert.deepEqual([withImages.avatar, withImages.scene], [png(), webp()], "a custom tutor's images travel to the face");
  assert.deepEqual(toCharacter({ ...ada, face: { ...TUTOR_FACE, hair: "bun" } }).face.hair, "bun");
  assert.equal(characterOf("custom:ada"), undefined, "nothing to resolve against");
  assert.equal(characterOf("custom:ada", [{ ...ada, id: "custom:bo" }]), undefined);
  assert.equal(characterOf("mia", [ada])?.name, "Mia", "built-ins never need the list");
  assert.equal(characterOf("mia2", [ada]), undefined);
  assert.equal(characterOf("toString", [ada]), undefined, "only real cast keys");
});
