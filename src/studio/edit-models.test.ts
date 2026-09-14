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

test("contract-supported edit models are no longer hidden by the legacy regex", () => {
  const civitai = { adapterType: "civitai", name: "Civitai" };
  const ark = { adapterType: "ark", name: "Ark" };
  const dashscope = { adapterType: "dashscope", name: "DashScope" };
  const fal = { adapterType: "fal", name: "Fal.ai" };
  // 旧正则全都不认识这些，合同驱动后必须可见
  assert.equal(isEditModel("krea2-turbo", civitai), true);
  assert.equal(isEditModel("doubao-seedream-4-5-251128", ark), true);
  assert.equal(isEditModel("qwen-image-2.5-pro", dashscope), true);
  assert.equal(isEditModel("nano-banana", fal), true);
  assert.equal(isEditModel("flux-2-pro", fal), true);
});

test("provider-scoped unsupported verdict hides genuinely t2i-only models from edit", () => {
  const fal = { adapterType: "fal", name: "Fal.ai" };
  assert.equal(isEditModel("flux-schnell", fal), false);
  // …但这些模型在文生图里不能被误伤
  assert.equal(isEditOnlyModel("flux-schnell", fal), false);
  assert.equal(isEditOnlyModel("nano-banana", fal), false);
});

test("without provider context the legacy matcher still decides", () => {
  assert.equal(isEditModel("civitai-grok"), true);
  assert.equal(isEditModel("agnes-image"), true);
  assert.equal(isEditModel("some-random-model"), false);
});
