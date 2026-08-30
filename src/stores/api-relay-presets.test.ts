import assert from "node:assert/strict";
import test from "node:test";
import type { ApiCapability } from "./api-relay-config";
import { clampManagedTokenPlanRelay, getPresetById, PRESET_RELAY_ENDPOINTS } from "./api-relay-presets.ts";

test("managed Token Plan seed retains its documented multimodal model pools", () => {
  const preset = getPresetById("preset-aliyun-tokenplan");
  assert.ok(preset, "preset-aliyun-tokenplan must exist");
  assert.ok(preset.capabilities?.includes("image"));
  assert.ok(preset.capabilities?.includes("video"));
  assert.ok(preset.capabilities?.includes("audio"));
  assert.deepEqual(preset.imageModels, ["qwen-image-2.0-pro", "qwen-image-2.0", "wan2.7-image-pro", "wan2.7-image"]);
  assert.deepEqual(preset.videoModels, ["happyhorse-1.1-t2v", "happyhorse-1.0-t2v", "happyhorse-1.1-i2v", "happyhorse-1.1-r2v"]);
  assert.deepEqual(preset.audioModels, ["qwen-audio-3.0-tts-plus"]);
  assert.deepEqual(preset.models, [
    "qwen-image-2.0-pro",
    "qwen-image-2.0",
    "wan2.7-image",
    "wan2.7-image-pro",
    "happyhorse-1.1-t2v",
    "happyhorse-1.0-t2v",
    "happyhorse-1.1-i2v",
    "happyhorse-1.1-r2v",
    "qwen-audio-3.0-tts-plus",
  ]);
  assert.match(String(preset.remark), /音频|TTS/);
});

test("Token Plan clamp preserves explicit image/video/audio configuration", () => {
  const relay = {
    id: "preset-aliyun-tokenplan",
    name: "stale",
    apiKey: "sk-user",
    capabilities: ["text", "image", "video", "audio"] as ApiCapability[],
    models: ["qwen-image-2.0", "wan2.7-t2v", "qwen-audio-3.0-tts-plus"],
    textModels: ["qwen-plus"],
    imageModels: ["qwen-image-2.0", "wan2.7-image"],
    videoModels: ["happyhorse-1.1-t2v", "wan2.7-t2v"],
    audioModels: ["qwen-audio-3.0-tts-plus"],
    imageCapabilityProfiles: { "wan2.7-image": { generate: "dashscope-wan-2.7-generate" as const } },
    videoCapabilityProfiles: { "wan2.7-t2v": "dashscope-t2v" as const },
  };
  const clamped = clampManagedTokenPlanRelay(relay, ["qwen-plus", "template-only"]);
  assert.deepEqual(clamped, relay);
});

test("Token Plan clamp does not replace explicit text models with template models", () => {
  const relay = {
    id: "preset-aliyun-tokenplan",
    capabilities: ["text" as const],
    models: ["injected-chat"],
    textModels: ["injected-chat"],
    imageModels: [],
    videoModels: [],
    audioModels: [],
  };
  const clamped = clampManagedTokenPlanRelay(relay, ["qwen-plus"]);
  assert.deepEqual(clamped.textModels, ["injected-chat"]);
  assert.deepEqual(clamped.models, ["injected-chat"]);
});

test("non-managed relays are not rewritten by Token Plan clamp", () => {
  const custom = {
    id: "user-custom-relay",
    capabilities: ["image", "video"] as ApiCapability[],
    imageModels: ["gpt-image-2"],
    videoModels: ["sora-2"],
    audioModels: [] as string[],
    models: ["gpt-image-2"],
    textModels: [] as string[],
  };
  assert.equal(clampManagedTokenPlanRelay(custom), custom);
});

test("unrelated presets keep their image/video catalogs", () => {
  const dashscope = getPresetById("preset-aliyun-dashscope");
  const superxihe = getPresetById("preset-superxihe-image");
  assert.ok(dashscope?.capabilities?.includes("image"));
  assert.ok((dashscope?.imageModels || []).includes("qwen-image-plus"));
  assert.ok((dashscope?.videoModels || []).length > 0);
  assert.deepEqual(superxihe?.capabilities, ["image"]);
  assert.equal(PRESET_RELAY_ENDPOINTS.some((item) => item.id === "preset-openai"), false);
});
