// A size warning is only a fallback for models nobody measured. The 2026-10-01 eval saw gemma4:e2b and qwen3.5:4b
// write wrong answer keys, but the 2026-11-24 calibration found size alone does not decide it (qwen3:8b 48%,
// qwen3.5:4b-mlx 69%), and the suggested model is a 4B one. So only models under the suggested size warn.
// Pure for node --test (src/modelSize.test.ts).

export const SMALL_MODEL_B = 4;

/** Billions of parameters read from a model name ("qwen3.5:4b-mlx" → 4, "gemma4:e2b" → 2), or null when the name has none.
 *  ponytail: name only; Ollama's /api/show parameter_size if unnamed sizes ("nimble:latest") need covering. */
export function modelSizeB(name: string): number | null {
  const m = /(?:^|[:\-_ /])e?(\d+(?:\.\d+)?)b(?![a-z0-9])/i.exec(name);
  return m ? Number(m[1]) : null;
}

/** A model running on this machine that is known to be under 4B. Cloud models (Ollama's `…cloud`) are never small. */
export const isSmallModel = (name: string) => {
  const b = /cloud$/.test(name) ? null : modelSizeB(name);
  return b !== null && b < SMALL_MODEL_B;
};
