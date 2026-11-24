import { test } from "node:test";
import assert from "node:assert/strict";
import { VAD_IDLE, concat, cutTo, loudness, mouthBright, mouthLevel, remember, resample, rms, vadStep, zcr, type VadEvent } from "./audio.ts";

test("resample keeps duration and interpolates", () => {
  const one = new Float32Array(48000).map((_, i) => i / 48000);
  const out = resample(one, 48000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[8000] - 0.5) < 1e-3);
  assert.equal(resample(one, 16000), one);
});

test("remember keeps the newest entries", () => {
  const m = new Map<string, number>();
  remember(m, "a", 1, 2); remember(m, "b", 2, 2); remember(m, "a", 3, 2); remember(m, "c", 4, 2);
  assert.deepEqual([...m], [["a", 3], ["c", 4]]);
});

test("mouthLevel opens on loud speech, closes in silence, opens faster than it closes", () => {
  let v = 0;
  for (let i = 0; i < 18; i++) v = mouthLevel(v, 0.3, 1 / 60); // 0.3 s loud
  assert.ok(v > 0.95, `open ${v}`);
  for (let i = 0; i < 60; i++) v = mouthLevel(v, 0, 1 / 60); // 1 s silence
  assert.ok(v < 0.01, `closed ${v}`);
  assert.equal(mouthLevel(0.4, 0.01, 0), 0.4); // no time, no change
  const opened = mouthLevel(0, 1, 0.05), closed = 1 - mouthLevel(1, 0, 0.05);
  assert.ok(opened > closed, `${opened} vs ${closed}`);
});

test("mouth shape: hissy frames go wide, low hums go round", () => {
  const tone = (period: number) => new Float32Array(1024).map((_, i) => Math.sin((2 * Math.PI * i) / period));
  const hiss = zcr(tone(8)), hum = zcr(tone(200)); // 0.25 vs 0.01 crossings per sample
  let wide = 0, round = 1;
  for (let i = 0; i < 30; i++) { wide = mouthBright(wide, hiss, 1 / 60); round = mouthBright(round, hum, 1 / 60); }
  assert.ok(wide > 0.95 && round < 0.05, `${wide} ${round}`);
});

/** Feeds 50 ms frames of the given loudness through the detector and lists the events. */
const vad = (frames: number[]) => {
  let v = VAD_IDLE, e: VadEvent;
  const out: string[] = [];
  for (const r of frames) { [v, e] = vadStep(v, r, 50); if (e) out.push(e); }
  return out;
};
const loud = (n: number) => Array(n).fill(0.1), quiet = (n: number) => Array(n).fill(0);

test("vadStep ignores short noise, starts after 150 ms of sound and ends after 0.8 s of quiet", () => {
  assert.deepEqual(vad([0.1, 0, 0.1, 0]), []);
  assert.deepEqual(vad([...loud(3), ...quiet(15)]), ["start"]); // 750 ms quiet: still one utterance
  assert.deepEqual(vad([...loud(3), ...quiet(16)]), ["start", "end"]);
});

test("vadStep: a short pause does not split an utterance, 15 s is the cap", () => {
  assert.deepEqual(vad([...loud(3), ...quiet(10), ...loud(3), ...quiet(16)]), ["start", "end"]); // 500 ms pause
  assert.deepEqual(vad(loud(300)), ["start", "end"]);
});

test("rms and concat", () => {
  assert.equal(rms(Float32Array.of(0.5, -0.5)), 0.5);
  assert.equal(rms(new Float32Array(0)), 0);
  assert.deepEqual([...concat([Float32Array.of(1, 2), Float32Array.of(3)])], [1, 2, 3]);
});

test("cutTo keeps the speech plus its margins, inside the take, and fades both cuts", () => {
  const x = new Float32Array(5000).fill(0.5); // 5 s at 1 kHz
  const y = cutTo(x, 1000, [2, 3]);
  assert.equal(y.length, 1450); // 1.85 s .. 3.3 s
  assert.equal(y[0], 0);
  assert.ok(Math.abs(y[y.length - 1]) < 0.06);
  assert.equal(y[700], 0.5);
  assert.equal(cutTo(x, 1000, [0.05, 4.9]).length, 5000); // margins clipped to the take
  assert.equal(cutTo(x, 1000, null).length, 5000); // nothing detected: the whole take
  assert.equal(cutTo(new Float32Array(0), 1000, null).length, 0);
});

const toneFor = (s: number, amp: number, rate = 1000) => Float32Array.from({ length: Math.round(s * rate) }, (_, i) => amp * Math.sin(i / 3));
const peakOf = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test("loudness brings quiet and loud speech to the same level, caps the boost, never clips", () => {
  const quiet = loudness(toneFor(1, 0.05), 1000), loud = loudness(toneFor(1, 0.8), 1000);
  assert.ok(Math.abs(rms(quiet) - rms(loud)) < 0.01);
  assert.ok(Math.abs(rms(loud) - 0.1) < 0.01);
  const faint = loudness(toneFor(1, 0.001), 1000); // ×10 at most: still quiet
  assert.ok(peakOf(faint) < 0.011);
  const click = concat([toneFor(1, 0.01), Float32Array.of(0.5)]); // one loud click: the peak limit wins over the target
  assert.ok(peakOf(loudness(click, 1000)) <= 0.89 + 1e-6);
  assert.deepEqual([...loudness(new Float32Array(10), 1000)], new Array(10).fill(0)); // silence stays silence
});

test("loudness measures the speech, not the silence around it", () => {
  const x = concat([new Float32Array(2000), toneFor(0.5, 0.02), new Float32Array(2000)]);
  const speech = loudness(x, 1000).subarray(2000, 2500);
  assert.ok(Math.abs(rms(speech) - 0.1) < 0.01);
});
