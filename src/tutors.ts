// Custom tutors (#167, milestone 1): the package a learner writes themselves or imports from `sprigo-tutor.json`.
// Pure so it runs under `node --test`; the tutors table is src/migrations.ts v9, reads and writes in src/db.ts.
import { z } from "zod";
import type { FaceSpec } from "./characters.ts";

/** Imported tutors will get no memory writes (milestone 3), so each row remembers where it came from. */
export const TUTOR_SOURCES = ["local", "imported"] as const;
export type TutorSource = (typeof TUTOR_SOURCES)[number];

export const TUTOR_NAME_MAX = 40;
export const TUTOR_PERSONA_MAX = 1500;
export const TUTOR_TOPIC_GOAL_MAX = 200;
export const TUTOR_TOPICS_MAX = 6;
export const TUTOR_AVATAR_MAX = 512 * 1024;
export const TUTOR_SCENE_MAX = 2 * 1024 * 1024;

/** Tutor rows are `custom:<uuid>`, never a built-in CharacterId. Parsing one as a talk id is milestone 2. */
export const TUTOR_ID_PREFIX = "custom:";
export const isTutorId = (id: string) => id.startsWith(TUTOR_ID_PREFIX) && id.length > TUTOR_ID_PREFIX.length;
export const newTutorId = () => `${TUTOR_ID_PREFIX}${crypto.randomUUID()}`;

/** The bust is drawn from a FaceSpec; a tutor with an avatar can leave it out. */
const faceSchema: z.ZodType<FaceSpec> = z.object({
  head: z.enum(["round", "oval", "square"]), ears: z.enum(["small", "big"]), eyes: z.enum(["round", "almond", "sleepy"]),
  brows: z.enum(["flat", "arched", "thick"]), nose: z.enum(["button", "long", "wide"]), mouth: z.enum(["small", "wide", "smile"]),
  hair: z.enum(["short", "bun", "long", "curly", "ponytail", "bald"]), facialHair: z.enum(["none", "beard", "mustache"]),
  outfit: z.enum(["shirt", "chef", "coat", "blazer", "tshirt"]), accessory: z.enum(["none", "glasses", "chefHat", "cap", "earrings"]),
  skin: z.number().int().min(0).max(4), hairColor: z.number().int().min(0).max(5),
});

// ---- Images: a data URL whose bytes really are a PNG or WebP (an imported file can lie about its mime type) ----

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const IMAGES: { mime: string; magic: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", magic: (b) => startsWith(b, PNG) },
  { mime: "image/webp", magic: (b) => b.length >= 12 && startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8) },
];
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Why a data URL is not an image we take, or null when it is a PNG or WebP within `max`. SVG can carry scripts, so it never passes. */
function imageProblem(url: string, max: number): string | null {
  const comma = url.indexOf(",");
  const [mime] = /^data:(image\/[a-z]+);base64$/i.exec(url.slice(0, comma).toLowerCase())?.slice(1) ?? [];
  if (comma < 0 || !mime) return "must be a base64 PNG or WebP data URL";
  const body = url.slice(comma + 1);
  if (!BASE64.test(body)) return "is not valid base64";
  if (body.length > Math.ceil(max / 3) * 4) return `is larger than ${max / 1024} KB`;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0)); } catch { return "is not valid base64"; }
  if (bytes.length > max) return `is larger than ${max / 1024} KB`;
  const format = IMAGES.find((i) => i.magic(bytes));
  if (!format) return "is not a PNG or WebP image";
  return format.mime === mime ? null : `says ${mime} but is a ${format.mime}`;
}

const image = (max: number) => z.string().superRefine((url, ctx) => {
  const problem = imageProblem(url, max);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

// ---- The package ----

const topicSchema = z.object({
  // Topic ids travel in talk ids (`chat:<who>:<topic>`), so no colon and the reserved free-form id.
  id: z.string().regex(/^[a-z][A-Za-z0-9]{0,31}$/, "use letters and digits, starting with a letter").refine((id) => id !== "free", "is reserved for free talk"),
  goal: z.string().trim().min(1).max(TUTOR_TOPIC_GOAL_MAX),
});

const fields = z.object({
  name: z.string().trim().min(1).max(TUTOR_NAME_MAX),
  gender: z.enum(["f", "m"]),
  color: z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "use a hex color like #2f80ed"),
  kokoroVoice: z.string().regex(/^[ab][fm]_[a-z]+$/, "use a Kokoro voice id like af_heart"),
  persona: z.string().trim().min(1).max(TUTOR_PERSONA_MAX),
  face: faceSchema.optional(),
  topics: z.array(topicSchema).min(1).max(TUTOR_TOPICS_MAX),
});

/** Rules JSON Schema cannot state: the voice must match the gender, topic ids are unique. */
function checks(t: z.infer<typeof fields>, ctx: z.RefinementCtx) {
  if (t.kokoroVoice[1] !== t.gender)
    ctx.addIssue({ code: "custom", path: ["kokoroVoice"], message: `is not a ${t.gender === "f" ? "female" : "male"} voice` });
  const ids = new Set<string>();
  for (const [i, topic] of t.topics.entries()) {
    if (ids.has(topic.id)) ctx.addIssue({ code: "custom", path: ["topics", i, "id"], message: "is used twice" });
    ids.add(topic.id);
  }
}

/** The stored part of a tutor: everything except the two images. */
export const tutorProfile = fields.superRefine(checks);
export type TutorProfile = z.infer<typeof tutorProfile>;

/** `sprigo-tutor.json`: a tutor a learner can share, import or write by hand. */
export const tutorPackage = fields.extend({
  avatar: image(TUTOR_AVATAR_MAX).optional(),
  scene: image(TUTOR_SCENE_MAX).optional(),
}).superRefine(checks);
export type TutorPackage = z.infer<typeof tutorPackage>;

export type TutorParse = { ok: true; tutor: TutorPackage } | { ok: false; errors: string[] };

/** Validates an imported or hand-written package; errors read as `persona: …` for the import screen. */
export function parseTutorPackage(input: unknown): TutorParse {
  const r = tutorPackage.safeParse(input);
  if (r.success) return { ok: true, tutor: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.map(String).join(".") || "package"}: ${i.message}`) };
}

/** For the template repo: what a `sprigo-tutor.json` may hold. Cross-field rules (voice, topic ids) are not JSON Schema's to express. */
export const TUTOR_JSON_SCHEMA = z.toJSONSchema(tutorPackage);
