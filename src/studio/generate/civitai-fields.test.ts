import assert from "node:assert/strict";
import test from "node:test";
import type { ImageGenInput, VideoCreateInput } from "../adapters/types.ts";
import {
  civitaiImageLoraShape,
  civitaiImageLoraStrengthRange,
  studioImageAdapterFields,
  studioVideoAdapterFields,
} from "../civitai-ui-options.ts";

/** Mirrors generate/image.ts + generate/video.ts adapter payloads without importing aliased modules. */

const imageInputTypeCheck: ImageGenInput = {
  model: "krea2-turbo",
  prompt: "p",
  quantity: 12,
  quality: "std",
  maskUrl: "https://example.test/mask.png",
  checkpointAir: "urn:air:flux1:checkpoint:civitai:1@2",
  loras: { "urn:air:krea2:lora:civitai:1@2": 0.8 },
};
const videoInputTypeCheck: VideoCreateInput = {
  model: "ltx2.3",
  prompt: "p",
  width: 1280,
  height: 720,
  fps: 24,
  generateAudio: false,
  loras: { "urn:air:ltx2.3:lora:civitai:1@2": 0.8 },
};
void imageInputTypeCheck;
void videoInputTypeCheck;

function imageAdapterInput(
  adapter: string,
  model: string,
  input: {
    n?: number;
    quantity?: number;
    loras?: Record<string, number>;
    checkpointAir?: string;
    width?: number;
    height?: number;
    aspectRatio?: string;
    quality?: string;
    maskUrl?: string;
  },
) {
  const civitai = studioImageAdapterFields(adapter, model, input);
  return {
    model,
    prompt: "p",
    aspectRatio: input.aspectRatio,
    width: input.width,
    height: input.height,
    quality: input.quality,
    maskUrl: input.maskUrl,
    n: civitai.n,
    loras: civitai.loras,
    checkpointAir: civitai.checkpointAir,
  };
}

function videoAdapterInput(
  adapter: string,
  model: string,
  input: {
    fps?: number;
    loras?: Record<string, number>;
    generateAudio?: boolean;
    aspectRatio?: string;
    width?: number;
    height?: number;
    duration?: number;
  },
) {
  const civitai = studioVideoAdapterFields(adapter, model, input);
  return Object.assign(
    {
      model,
      prompt: "p",
      duration: input.duration,
      aspectRatio: civitai.aspectRatio,
      generateAudio: civitai.generateAudio,
      fps: civitai.fps,
      loras: civitai.loras,
    },
    typeof civitai.width === "number" && typeof civitai.height === "number"
      ? { width: civitai.width, height: civitai.height }
      : {},
  );
}

test("Civitai image generate payload keeps quantity, LoRA, checkpoint and page size fields", () => {
  const loras = { "urn:air:flux1:lora:civitai:1@2": 0.8 };
  const flux1 = imageAdapterInput("civitai", "flux1", {
    n: 8,
    loras,
    checkpointAir: "urn:air:flux1:checkpoint:civitai:1@2",
    width: 1024,
    height: 1024,
    aspectRatio: "1:1",
    quality: "std",
  });
  assert.equal(flux1.n, 8);
  assert.deepEqual(flux1.loras, loras);
  assert.equal(flux1.checkpointAir, "urn:air:flux1:checkpoint:civitai:1@2");
  assert.equal(flux1.width, 1024);
  assert.equal(flux1.quality, "std");

  const krea = imageAdapterInput("civitai", "krea2-turbo", { n: 12, loras, width: 1280, height: 720 });
  assert.equal(krea.n, 12);
  assert.deepEqual(krea.loras, loras);
});

test("Civitai image quantity alias takes precedence without a second generic clamp", () => {
  const result = imageAdapterInput("civitai", "krea2-turbo", { quantity: 12, n: 1 });
  assert.equal(result.n, 12);
});

test("non-Civitai image generate payload is not rewritten by Civitai caps or dropped fields", () => {
  const loras = { "urn:air:flux1:lora:civitai:1@2": 0.8 };
  const fal = imageAdapterInput("fal", "krea2-turbo", {
    n: 12,
    loras,
    checkpointAir: "urn:air:keep",
    maskUrl: "https://example.test/mask.png",
    quality: "hd",
  });
  assert.equal(fal.n, 12);
  assert.deepEqual(fal.loras, loras);
  assert.equal(fal.checkpointAir, "urn:air:keep");
  assert.equal(fal.maskUrl, "https://example.test/mask.png");
  assert.equal(fal.quality, "hd");

  const gpt = imageAdapterInput("openai-compat", "gpt-image-2", { n: 10, quality: "high" });
  assert.equal(gpt.n, 10);
  assert.equal(gpt.quality, "high");

  const grok = imageAdapterInput("xai-imagine", "grok-imagine-image-2.0", { n: 10 });
  assert.equal(grok.n, 10);
});

test("Civitai LTX generate payload sends explicit generateAudio and aspectRatio as width/height", () => {
  const loras = { "urn:air:ltx:lora:civitai:1@2": 0.9 };
  const off = videoAdapterInput("civitai", "ltx2.3", {
    fps: 16,
    loras,
    generateAudio: false,
    aspectRatio: "9:16",
    duration: 5,
  });
  assert.equal(off.generateAudio, false);
  assert.equal(off.fps, 16);
  assert.equal(off.aspectRatio, "9:16");
  assert.equal(off.width, 720);
  assert.equal(off.height, 1280);
  assert.deepEqual(off.loras, loras);

  const on = videoAdapterInput("civitai", "ltx2.3", { generateAudio: true, aspectRatio: "16:9" });
  assert.equal(on.generateAudio, true);
  assert.equal(on.width, 1280);
  assert.equal(on.height, 720);
});

test("Civitai Hunyuan maps aspectRatio to official size and omits generateAudio", () => {
  const body = videoAdapterInput("civitai", "hunyuan", {
    fps: 25,
    generateAudio: true,
    aspectRatio: "16:9",
    loras: { "urn:air:hyv1:lora:civitai:1@2": 0.7 },
  });
  assert.equal(body.generateAudio, undefined);
  assert.equal(body.fps, 25);
  assert.equal(body.width, 1280);
  assert.equal(body.height, 720);
  assert.deepEqual(body.loras, { "urn:air:hyv1:lora:civitai:1@2": 0.7 });
});

test("non-Civitai video generate payload keeps fps/LoRA/audio and is not given Civitai width/height", () => {
  const loras = { extra: 1 };
  const ark = videoAdapterInput("ark-plan", "doubao-seedance-2.0", {
    fps: 24,
    loras,
    generateAudio: false,
    aspectRatio: "16:9",
    width: 640,
    height: 360,
  });
  assert.equal(ark.fps, 24);
  assert.equal(ark.generateAudio, false);
  assert.deepEqual(ark.loras, loras);
  assert.equal(ark.aspectRatio, "16:9");
  assert.equal(ark.width, 640);
  assert.equal(ark.height, 360);

  const fal = videoAdapterInput("fal", "ltx2.3", {
    fps: 99,
    loras,
    generateAudio: true,
    aspectRatio: "9:16",
  });
  assert.equal(fal.fps, 99);
  assert.equal(fal.generateAudio, true);
  assert.deepEqual(fal.loras, loras);
  assert.equal("width" in fal, false);
});

test("Civitai generate path only exposes official LoRA strength, never clipStrength/weight", () => {
  assert.equal(civitaiImageLoraShape("flux2-dev"), "array");
  assert.deepEqual(civitaiImageLoraStrengthRange("flux2-dev"), { min: 0, max: 4 });
  assert.equal(civitaiImageLoraStrengthRange("krea2-turbo"), undefined);
  const payload = imageAdapterInput("civitai", "flux2-dev", {
    loras: { "urn:air:flux2:lora:civitai:1@2": 0.8 },
  });
  assert.deepEqual(payload.loras, { "urn:air:flux2:lora:civitai:1@2": 0.8 });
  assert.equal("clipStrength" in (payload.loras as object), false);
  assert.equal("weight" in (payload.loras as object), false);
});

test("only verified Civitai aspect ratios produce adapter dimensions", () => {
  assert.deepEqual(studioVideoAdapterFields("civitai", "ltx2.3", { aspectRatio: "4:3" }), {
    fps: undefined,
    loras: undefined,
    generateAudio: undefined,
    aspectRatio: "4:3",
  });
  assert.deepEqual(studioVideoAdapterFields("civitai-orchestration", "hunyuan", { aspectRatio: "21:9" }), {
    fps: undefined,
    loras: undefined,
    generateAudio: undefined,
    aspectRatio: "21:9",
  });
  assert.equal(studioVideoAdapterFields("ark-plan", "ltx2.3", { aspectRatio: "4:3" }).aspectRatio, "4:3");
});
