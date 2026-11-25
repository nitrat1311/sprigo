// Measured model guidance (#37): instead of hand-written advice, the AI settings show what `pnpm bench`
// (live-lesson latency) and `pnpm eval` (lesson quality) found for a model. The bundled rows live in
// src/modelGuideData.ts, written by `pnpm guide`. Pure for node --test (src/modelGuide.test.ts).

export type Measurement = {
  /** Ollama's model name, e.g. "qwen3:8b". */
  model: string;
  /** Median ms from the request to the first sentence, the part that is spoken first. */
  sayMs: number;
  /** Median ms for the whole reply. */
  replyMs: number;
  /** Share of exercises that passed the eval rules, 0–100. */
  quality: number;
  /** Eval cases behind `quality`; the eval covers every exercise type in 11. */
  cases: number;
  /** The machine it ran on, shown with the numbers so they are not read as universal. */
  hardware: string;
  /** When the bench ran, YYYY-MM-DD. */
  measured: string;
  /** When the eval ran, YYYY-MM-DD; absent from older rows that predate this field. */
  evaluated?: string;
};

/** A first sentence later than this feels laggy live: tutor.ts plays a filler after FILLER_MS (1.5 s). */
export const LIVE_SAY_MS = 1500;
/** Calibrated to the bundled measurements: the best measured local model (qwen3.5:4b-mlx) passed 69%, so a higher bar
 *  would mark every local model weak. qwen3:8b (48%) stays weak, which is what the eval found. */
export const GOOD_QUALITY = 65;

export type Verdict = "good" | "weak" | "slow" | "weakSlow";

/** The issue's three buckets ("good", "fast but weaker", "too slow"), with a model that is both slow and weak. */
export const verdictOf = (m: Pick<Measurement, "sayMs" | "quality">): Verdict => {
  const slow = m.sayMs > LIVE_SAY_MS, weak = m.quality < GOOD_QUALITY;
  return slow ? (weak ? "weakSlow" : "slow") : weak ? "weak" : "good";
};

// Ollama may list a model as "name:latest"; the user may type either form, in any case.
export const modelKey = (name: string) => name.trim().toLowerCase().replace(/:latest$/, "");

/** The measurement for a model name, if one was made; null means "not measured", never "bad". */
export function guideFor(model: string, rows: Measurement[]): Measurement | null {
  const k = modelKey(model);
  return k ? rows.find((r) => modelKey(r.model) === k) ?? null : null;
}
