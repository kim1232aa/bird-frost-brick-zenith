import assert from "node:assert/strict";
import test from "node:test";
import { PROTOCOL_PRESETS, protocolById } from "./protocols.ts";

test("generic openai-compat defaults to a neutral compatibility host, not api.openai.com", () => {
  const preset = PROTOCOL_PRESETS.find((item) => item.id === "openai-compat");
  assert.ok(preset, "openai-compat protocol preset must exist");
  assert.equal(preset.defaultBaseUrl, "https://api.example.com/v1");
  assert.equal(/api\.openai\.com/i.test(preset.defaultBaseUrl), false);
  assert.equal(preset.authScheme, "Bearer");
  assert.equal(preset.endpoints.chat, "/chat/completions");
  assert.equal(preset.endpoints.images, "/images/generations");
  assert.equal(preset.endpoints.videosCreate, "/videos/generations");
  assert.equal(preset.endpoints.videosPoll, "/videos/{id}");
});

test("protocolById openai-compat is the generic compatibility template", () => {
  const preset = protocolById("openai-compat");
  assert.equal(preset.id, "openai-compat");
  assert.equal(preset.defaultBaseUrl, "https://api.example.com/v1");
});

test("other protocol presets keep their documented hosts and DashScope audio endpoint", () => {
  assert.equal(protocolById("xai-imagine").defaultBaseUrl, "https://api.x.ai/v1");
  const dashscope = protocolById("dashscope");
  assert.equal(dashscope.defaultBaseUrl, "https://dashscope.aliyuncs.com");
  assert.equal(dashscope.endpoints.audio, "/api/v1/services/audio/tts/SpeechSynthesizer");
});

test("Agnes protocol defaults to the official apihub gateway", () => {
  const preset = protocolById("agnes");
  assert.equal(preset.defaultBaseUrl, "https://apihub.agnes-ai.com/v1");
});

test("Civitai protocol uses the generic workflows endpoint", () => {
  const preset = protocolById("civitai");
  assert.equal(preset.defaultBaseUrl, "https://orchestration.civitai.com/v2/consumer");
  assert.equal(preset.endpoints.images, "/workflows");
  assert.equal(preset.endpoints.videosCreate, "/workflows");
  assert.equal(preset.endpoints.videosPoll, "/workflows/{id}");
  assert.equal(preset.endpoints.test, "/workflows");
  assert.equal(/recipes|\/imageGen|\/videoGen/i.test(JSON.stringify(preset)), false);
});

test("OpenAI official protocol is explicit instead of reusing compatibility semantics", () => {
  const preset = protocolById("openai-official");
  assert.equal(preset.id, "openai-official");
  assert.equal(preset.defaultBaseUrl, "https://api.openai.com/v1");
  assert.equal(preset.authScheme, "Bearer");
  assert.equal(preset.endpoints.images, "/images/generations");
  assert.equal(preset.endpoints.videosCreate, "/videos");
  assert.equal(preset.endpoints.videosPoll, "/videos/{id}");
  assert.deepEqual(preset.exampleModels, ["gpt-image-2", "sora-2"]);
});

test("Fal protocol exposes only its image contract", () => {
  const preset = protocolById("fal");
  assert.equal(preset.endpoints.images, "/fal-ai/flux/dev");
  assert.equal("videosCreate" in preset.endpoints, false);
  assert.equal("videosPoll" in preset.endpoints, false);
});
