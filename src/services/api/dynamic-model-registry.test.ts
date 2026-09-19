import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyModelCategory,
  fetchDynamicModelsForProvider,
  generateDefaultParamSchema,
  isCacheExpired,
  isDynamicParamVisible,
  normalizeDynamicParamValue,
  type DynamicModelMeta,
} from "./dynamic-model-registry.ts";

test("classifyModelCategory correctly identifies media types", () => {
  assert.equal(classifyModelCategory("fal-ai/flux/dev", "text-to-image"), "image");
  assert.equal(classifyModelCategory("fal-ai/kling-video/v1.5/pro", "text-to-video"), "video");
  assert.equal(classifyModelCategory("qwen-image-2.0", undefined), "image");
  assert.equal(classifyModelCategory("wan2.1-t2v-turbo", undefined), "video");
  assert.equal(classifyModelCategory("cosyvoice-v1", "text-to-speech"), "audio");
  assert.equal(classifyModelCategory("qwen-plus", undefined), "text");
});

test("generateDefaultParamSchema generates full ComfyUI / Krea2 param schema", () => {
  const schema = generateDefaultParamSchema("krea2-comfyui", "image");
  const keys = schema.map((p) => p.key);
  assert.ok(keys.includes("cfgScale"), "must include cfgScale");
  assert.ok(keys.includes("steps"), "must include steps");
  assert.ok(keys.includes("sampler"), "must include sampler");
  assert.ok(keys.includes("seed"), "must include seed");
  assert.ok(keys.includes("engine"), "must include engine");
  assert.ok(keys.includes("denoise"), "must include denoise");
  assert.ok(keys.includes("scheduler"), "must include scheduler");
});

test("generateDefaultParamSchema generates Flux schema with guidance_scale", () => {
  const schema = generateDefaultParamSchema("fal-ai/flux/dev", "image");
  const keys = schema.map((p) => p.key);
  assert.ok(keys.includes("guidance_scale"), "Flux Dev must have guidance_scale");
  assert.ok(keys.includes("steps"), "must include steps");
  assert.ok(keys.includes("seed"), "must include seed");
});

test("isCacheExpired accurately handles TTL", () => {
  const now = Date.now();
  const validTimestamp = now - 1000 * 60 * 60; // 1 小时前
  const expiredTimestamp = now - 1000 * 60 * 60 * 25; // 25 小时前

  assert.equal(isCacheExpired(validTimestamp, 24 * 60 * 60 * 1000), false);
  assert.equal(isCacheExpired(expiredTimestamp, 24 * 60 * 60 * 1000), true);
});

test("dynamic schemas honor conditions and normalize submitted values", () => {
  const conditional = {
    key: "guidance_scale",
    label: "Guidance",
    type: "number" as const,
    group: "advanced" as const,
    condition: { field: "mode", eq: "dev" },
    min: 0,
    max: 5,
  };
  assert.equal(isDynamicParamVisible(conditional, { mode: "dev" }), true);
  assert.equal(isDynamicParamVisible(conditional, { mode: "schnell" }), false);
  assert.equal(normalizeDynamicParamValue(conditional, 7), 5);
  assert.equal(normalizeDynamicParamValue({ ...conditional, type: "integer" }, 2.8), 3);
});

test("fetchDynamicModelsForProvider parses provider model envelopes without inventing schemas", async () => {
  let writes = 0;
  const cache = {
    async getItem<T>(_key: string) { return null as T | null; },
    async setItem<T>(_key: string, _value: T) { writes += 1; },
  };
  const registry = await fetchDynamicModelsForProvider("fal", {
    cache,
    staleWhileRevalidate: false,
    request: async () => ({ data: [
      { id: "fal-ai/flux-lora", name: "FLUX LoRA", pipeline_tag: "text-to-image", tags: ["lora"] },
      { id: "fal-ai/kling-video", pipeline_tag: "text-to-video" },
    ] }),
  });
  assert.deepEqual(registry.models.map((model) => [model.id, model.category, model.supportsLora]), [
    ["fal-ai/flux-lora", "image", true],
    ["fal-ai/kling-video", "video", false],
  ]);
  assert.equal(registry.models[0]?.paramSchemas.length, 0);
  assert.equal(writes, 1);
});
