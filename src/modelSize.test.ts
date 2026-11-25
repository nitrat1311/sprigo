import { test } from "node:test";
import assert from "node:assert/strict";
import { isSmallModel, modelSizeB } from "./modelSize.ts";

test("reads the parameter count from model names", () => {
  assert.equal(modelSizeB("qwen3.5:4b-mlx"), 4);
  assert.equal(modelSizeB("gemma4:e2b-mlx"), 2);
  assert.equal(modelSizeB("qwen3.5:0.8b-mlx"), 0.8);
  assert.equal(modelSizeB("qwen3:8b"), 8);
  assert.equal(modelSizeB("qwen2.5-7b-instruct"), 7); // LM Studio style
  assert.equal(modelSizeB("nimble:latest"), null);
  assert.equal(modelSizeB("glm-5.3-flash:cloud"), null);
});

test("warns only for local models under the suggested 4B", () => {
  assert.equal(isSmallModel("gemma4:e2b-mlx"), true);
  assert.equal(isSmallModel("llama3.2:3b"), true);
  assert.equal(isSmallModel("qwen3.5:0.8b-mlx"), true);
  assert.equal(isSmallModel("qwen3.5:4b"), false); // the suggested model must not trigger the warning
  assert.equal(isSmallModel("qwen3:8b"), false);
  assert.equal(isSmallModel("gemma4:31b-cloud"), false);
  assert.equal(isSmallModel("nimble:latest"), false);
});
