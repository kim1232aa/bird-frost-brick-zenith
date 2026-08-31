import assert from "node:assert/strict";
import test from "node:test";
import { defaultEditKey, isEditModel, isEditOnlyModel } from "./edit-models.ts";

test("GPT Image 2 snapshot and ChatGPT image alias are available in edit mode", () => {
  for (const model of ["gpt-image-2", "gpt-image-2-2026-04-21", "chatgpt-image-latest"]) {
    assert.equal(isEditModel(model), true, model);
    assert.equal(isEditOnlyModel(model), false, model);
  }
});

test("edit picker prefers a GPT Image alias when it is the configured option", () => {
  const alias = "preset-openai::chatgpt-image-latest";
  assert.equal(defaultEditKey(["preset-fal::flux-dev", alias]), alias);
});

test("edit picker prefers GPT Image 2 over Grok Imagine when both are wired", () => {
  assert.equal(
    defaultEditKey([
      "preset-grok-relay::grok-imagine-image-quality",
      "preset-grok-relay::grok-imagine-image",
      "preset-openai::gpt-image-2",
    ]),
    "preset-openai::gpt-image-2",
  );
});
