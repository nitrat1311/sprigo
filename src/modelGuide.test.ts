import { test } from "node:test";
import assert from "node:assert/strict";
import { GOOD_QUALITY, LIVE_SAY_MS, guideFor, modelKey, verdictOf, type Measurement } from "./modelGuide.ts";
import { MEASURED } from "./modelGuideData.ts";

const m = (over: Partial<Measurement> = {}): Measurement => ({
  model: "qwen3:8b", sayMs: 600, replyMs: 2000, quality: 95, cases: 11, hardware: "Test CPU, 16 GB", measured: "2026-11-24", ...over,
});

test("verdict: quick and accurate is good", () => {
  assert.equal(verdictOf(m()), "good");
});

test("verdict: quick but some exercises were wrong is weak", () => {
  assert.equal(verdictOf(m({ quality: GOOD_QUALITY - 1 })), "weak");
});

test("verdict: a late first sentence is slow", () => {
  assert.equal(verdictOf(m({ sayMs: LIVE_SAY_MS + 1 })), "slow");
});

test("verdict: slow and wrong is both", () => {
  assert.equal(verdictOf(m({ sayMs: LIVE_SAY_MS + 1, quality: GOOD_QUALITY - 1 })), "weakSlow");
});

test("verdict: the thresholds themselves still count as good", () => {
  assert.equal(verdictOf(m({ sayMs: LIVE_SAY_MS, quality: GOOD_QUALITY })), "good");
});

test("guideFor finds a name with or without :latest, in any case, but not a different size", () => {
  const rows = [m({ model: "Qwen3.5:4B-mlx" })];
  assert.equal(guideFor("qwen3.5:4b-mlx", rows)?.model, "Qwen3.5:4B-mlx");
  assert.equal(guideFor(" qwen3.5:4b-mlx:latest ", rows)?.model, "Qwen3.5:4B-mlx");
  assert.equal(guideFor("qwen3.5:8b-mlx", rows), null);
});

test("guideFor returns null for a model that was never measured", () => {
  assert.equal(guideFor("mock:latest", [m()]), null);
  assert.equal(guideFor("", [m()]), null);
});

test("the quality bar is calibrated to the bundled measurements", () => {
  const best = MEASURED.find((r) => r.model === "qwen3.5:4b-mlx")!;
  assert.equal(verdictOf(best), "good", "the best measured local model clears the bar");
  const older = MEASURED.find((r) => r.model === "qwen3:8b")!;
  assert.equal(verdictOf(older), "weak", "the eval's weaker pick stays weak");
});

test("the suggested cross-platform tag is not credited with the mlx build's numbers", () => {
  // The measurement was made on qwen3.5:4b-mlx, an Apple-only build; the plain tag is a different build.
  assert.equal(guideFor("qwen3.5:4b", MEASURED), null);
});

test("the bundled measurements name their machine and date and are in range", () => {
  assert.ok(MEASURED.length, "the bundled measurements are present");
  const seen = new Set<string>();
  for (const r of MEASURED) {
    assert.ok(r.model, "a row names its model");
    assert.ok(!seen.has(modelKey(r.model)), `${r.model} appears once`);
    seen.add(modelKey(r.model));
    assert.ok(r.sayMs > 0 && r.replyMs > 0, `${r.model}: positive times`);
    assert.ok(r.quality >= 0 && r.quality <= 100, `${r.model}: quality is a percentage`);
    assert.ok(r.cases > 0, `${r.model}: quality comes from eval cases`);
    assert.ok(r.hardware, `${r.model}: the machine is recorded`);
    assert.match(r.measured, /^\d{4}-\d{2}-\d{2}$/, `${r.model}: the date is recorded`);
    if (r.evaluated) assert.match(r.evaluated, /^\d{4}-\d{2}-\d{2}$/, `${r.model}: the eval date is recorded`);
    assert.equal(guideFor(r.model, MEASURED), r, `${r.model} is found by its own name`);
  }
});
