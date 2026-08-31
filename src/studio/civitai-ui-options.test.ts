import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCivitaiCheckpointAir,
  civitaiCheckpointPlaceholder,
  civitaiImageLoraShape,
  civitaiImageLoraStrengthRange,
  civitaiImageQuantityMax,
  civitaiRequiresCheckpointAir,
  civitaiVideoFpsSpec,
  civitaiVideoLoraShape,
  clampCivitaiVideoFps,
  clampStudioImageQuantity,
  civitaiVideoFpsOptions,
  resolveStudioImageQuantity,
  snapStudioImageQuantity,
  studioImageAdapterFields,
  studioImageQuantityMax,
  studioImageQuantityOptions,
  studioVideoAdapterFields,
  studioVideoGenerateAudio,
  studioVideoLoras,
  studioVideoFps,
  studioVideoSize,
} from "./civitai-ui-options.ts";

test("service IDs resolve the same LoRA shape and quantity as short engine ids", () => {
  assert.equal(civitaiImageLoraShape("image/flux2/klein/editImage/9b"), "map");
  assert.equal(civitaiImageLoraShape("image/flux2/dev/createImage"), "array");
  assert.equal(civitaiImageLoraShape("image/comfy/krea2/turbo/createImage"), "map");
  assert.equal(civitaiImageLoraShape("image/comfy/krea2/edit/editImage"), "map");
  assert.equal(civitaiImageLoraShape("image/fal/krea2/createImage"), undefined);
  assert.equal(civitaiImageLoraShape("image/wan/v2.7/fal/createImage"), "array");
  assert.equal(civitaiImageLoraShape("image/sdcpp/zImage/turbo/createImage"), "map");
  assert.equal(civitaiImageLoraShape("image/sdcpp/zimage/turbo/createimage"), "map");
  assert.equal(civitaiImageLoraShape("image/sdcpp/sdxl/createImage"), "map");
  assert.equal(civitaiImageLoraShape("image/sdcpp/anima/createImage"), "map");
  assert.equal(civitaiImageLoraShape("image/sdcpp/qwen/20b/editImage"), "map");
  assert.equal(civitaiImageQuantityMax("image/comfy/krea2/edit/editImage"), 4);
  assert.equal(civitaiImageQuantityMax("image/comfy/krea2/turbo/createImage"), 12);
  assert.equal(civitaiImageQuantityMax("image/sdcpp/qwen/20b/editImage"), 12);
  assert.equal(civitaiImageQuantityMax("image/qwen/editImage/3.0-pro"), 6);
  assert.equal(civitaiImageQuantityMax("image/flux2/klein/createImage/4b"), 4);
  assert.equal(civitaiImageQuantityMax("image/wan/v2.7/fal/createImage"), 10);
  assert.equal(studioImageQuantityMax("civitai", "image/comfy/krea2/edit/editImage", "edit"), 4);
  assert.equal(studioImageQuantityMax("civitai", "image/comfy/krea2/turbo/createImage"), 12);
  assert.equal(civitaiVideoLoraShape("video/ltx2.3/createVideo"), "map");
  assert.equal(civitaiVideoLoraShape("video/hunyuan/createVideo"), "array");
  assert.equal(civitaiVideoLoraShape("video/wan/v2.2/comfy"), "array");
});

test("sdcpp Flux2 variant service IDs keep the official family-specific LoRA shape and cap", () => {
  const klein = "image/sdcpp/flux2Klein/createVariant/9b";
  const dev = "image/sdcpp/flux2Dev/createVariant";
  assert.equal(civitaiImageLoraShape(klein), "map");
  assert.equal(civitaiImageLoraShape(dev), "array");
  assert.equal(civitaiImageQuantityMax(klein), 4);
  assert.equal(civitaiImageQuantityMax(dev), 4);
  assert.deepEqual(civitaiImageLoraStrengthRange(dev), { min: 0, max: 4 });
});

test("unknown and fabricated Civitai services never inherit UI capability", () => {
  assert.equal(civitaiImageQuantityMax("image/unknown/engine/createImage"), null);
  assert.equal(studioImageQuantityMax("civitai", "image/unknown/engine/createImage"), null);
  assert.equal(civitaiImageLoraShape("image/unknown/engine/createImage"), undefined);
  assert.equal(civitaiImageQuantityMax("image/openai/gpt-image-2-2026-04-21/editImage"), null);
  assert.equal(civitaiImageQuantityMax("image/qwen/editImage/not-a-model"), null);
  assert.equal(civitaiImageQuantityMax("image/sdcpp/qwen/20b/notAnOperation"), null);
  assert.equal(civitaiImageQuantityMax("image/sdcpp/zImage/unknown/createImage"), null);
  assert.equal(civitaiImageLoraShape("image/sdcpp/zImage/unknown/createImage"), undefined);
  assert.deepEqual(studioImageQuantityOptions(null), [1, 2, 4, 6, 8, 10]);
});

test("image LoRA is shown only for official map/array engines", () => {
  assert.equal(civitaiImageLoraShape("krea2-turbo"), "map");
  assert.equal(civitaiImageLoraShape("krea2-raw"), "map");
  assert.equal(civitaiImageLoraShape("flux1"), "map");
  assert.equal(civitaiImageLoraShape("z-image-turbo"), "map");
  assert.equal(civitaiImageLoraShape("sdxl"), "map");
  assert.equal(civitaiImageLoraShape("anima"), "map");
  assert.equal(civitaiImageLoraShape("flux2-klein"), "map");
  assert.equal(civitaiImageLoraShape("flux2-dev"), "array");
  assert.equal(civitaiImageLoraShape("flux2-pro"), undefined);
  assert.equal(civitaiImageLoraShape("qwen-3.0-pro"), undefined);
  assert.equal(civitaiImageLoraShape("seedream-4.5"), undefined);
  assert.equal(civitaiImageLoraShape("civitai-grok"), undefined);
  assert.deepEqual(civitaiImageLoraStrengthRange("flux2-dev"), { min: 0, max: 4 });
  assert.equal(civitaiImageLoraStrengthRange("flux2-klein"), undefined);
  assert.equal(civitaiImageLoraStrengthRange("krea2-turbo"), undefined);
  assert.equal(civitaiImageLoraStrengthRange("flux2-pro"), undefined);
});

test("video LoRA is shown only for LTX 2.3 and Hunyuan", () => {
  assert.equal(civitaiVideoLoraShape("ltx2.3"), "map");
  assert.equal(civitaiVideoLoraShape("hunyuan"), "array");
  assert.equal(civitaiVideoLoraShape("kling"), undefined);
  assert.equal(civitaiVideoLoraShape("grok-imagine-video"), undefined);
});

test("quantity maxima match official per-engine caps", () => {
  assert.equal(civitaiImageQuantityMax("krea2-turbo"), 12);
  assert.equal(civitaiImageQuantityMax("z-image-turbo"), 12);
  assert.equal(civitaiImageQuantityMax("flux1"), 12);
  assert.equal(civitaiImageQuantityMax("sdxl"), 12);
  assert.equal(civitaiImageQuantityMax("anima"), 12);
  assert.equal(civitaiImageQuantityMax("seedream-4.5"), 12);
  assert.equal(civitaiImageQuantityMax("seedream-5.0-pro"), 12);
  assert.equal(civitaiImageQuantityMax("qwen-3.0-pro"), 6);
  assert.equal(civitaiImageQuantityMax("civitai-grok"), 4);
  assert.equal(civitaiImageQuantityMax("flux2-klein"), 4);
  assert.equal(civitaiImageQuantityMax("flux2-pro"), 4);
  assert.equal(civitaiImageQuantityMax("flux2-dev"), 4);
});

test("non-civitai adapters follow published output counts instead of a hard 1-4 cap", () => {
  assert.equal(studioImageQuantityMax("openai-compat", "gpt-image-2"), 10);
  assert.equal(studioImageQuantityMax("xai-imagine", "grok-imagine-image"), 10);
  assert.equal(studioImageQuantityMax("ark-plan", "doubao-seedream-5.0-lite"), null);
  assert.equal(studioImageQuantityMax("fal", "flux-dev"), null);
  assert.equal(resolveStudioImageQuantity("fal", "flux-dev", 12), 12);
  assert.equal(resolveStudioImageQuantity("openai-compat", "gpt-image-2", 10), 10);
  assert.equal(resolveStudioImageQuantity("ark-plan", "doubao-seedream-5.0-lite", 10), 10);
  assert.equal(resolveStudioImageQuantity("civitai", "krea2-turbo", 12), 12);
  assert.equal(resolveStudioImageQuantity("civitai-orchestration", "qwen-3.0-pro", 9), 6);
  assert.equal(resolveStudioImageQuantity("civitai", "civitai-grok", 5), 4);
  assert.equal(clampStudioImageQuantity(0, 12), 1);
  assert.equal(clampStudioImageQuantity(10, null), 10);
});

test("quantity option chips stay inside the engine max", () => {
  assert.deepEqual(studioImageQuantityOptions(4), [1, 2, 4]);
  assert.deepEqual(studioImageQuantityOptions(6), [1, 2, 4, 6]);
  assert.deepEqual(studioImageQuantityOptions(10), [1, 2, 4, 6, 8, 10]);
  assert.deepEqual(studioImageQuantityOptions(12), [1, 2, 4, 6, 8, 12]);
  assert.deepEqual(studioImageQuantityOptions(null), [1, 2, 4, 6, 8, 10]);
  assert.deepEqual(studioImageQuantityOptions(undefined), [1, 2, 4, 6, 8, 10]);
  assert.deepEqual(studioImageQuantityOptions(Number.NaN), [1, 2, 4, 6, 8, 10]);
  assert.equal(snapStudioImageQuantity(12, [1, 2, 4]), 4);
  assert.equal(snapStudioImageQuantity(6, [1, 2, 4, 6]), 6);
  assert.equal(snapStudioImageQuantity(10, [1, 2, 4, 6, 8, 10]), 10);
});

test("Flux1 and SDXL require a user-supplied checkpoint AIR hint, never a fake id", () => {
  assert.equal(civitaiRequiresCheckpointAir("flux1"), true);
  assert.equal(civitaiRequiresCheckpointAir("sdxl"), true);
  assert.equal(civitaiRequiresCheckpointAir("anima"), false);
  assert.equal(civitaiRequiresCheckpointAir("krea2-turbo"), false);
  assert.match(civitaiCheckpointPlaceholder("flux1"), /^urn:air:flux1:checkpoint:/);
  assert.match(civitaiCheckpointPlaceholder("sdxl"), /^urn:air:sdxl:checkpoint:/);
  assert.equal(civitaiCheckpointPlaceholder("flux1").includes("civitai:111"), false);
  assert.throws(() => assertCivitaiCheckpointAir("civitai", "flux1", ""), /AIR|checkpoint/);
  assert.throws(() => assertCivitaiCheckpointAir("civitai-orchestration", "sdxl"), /AIR|checkpoint/);
  assert.equal(assertCivitaiCheckpointAir("civitai", "krea2-turbo", ""), "");
  assert.equal(assertCivitaiCheckpointAir("openai-compat", "flux1", ""), "");
  assert.equal(
    assertCivitaiCheckpointAir("civitai", "flux1", "urn:air:flux1:checkpoint:civitai:1@2"),
    "urn:air:flux1:checkpoint:civitai:1@2",
  );
});

test("FPS is only defined for LTX and Hunyuan", () => {
  assert.equal(civitaiVideoFpsSpec("ltx2.3")?.wire, "fps");
  assert.equal(civitaiVideoFpsSpec("ltx2.3")?.defaultFps, 24);
  assert.equal(civitaiVideoFpsSpec("hunyuan")?.wire, "frameRate");
  assert.equal(civitaiVideoFpsSpec("hunyuan")?.defaultFps, 25);
  assert.equal(civitaiVideoFpsSpec("kling"), undefined);
  assert.equal(clampCivitaiVideoFps("ltx2.3", 30), 30);
  assert.equal(clampCivitaiVideoFps("ltx2.3", 99), 60);
  assert.equal(clampCivitaiVideoFps("hunyuan"), 25);
  assert.equal(clampCivitaiVideoFps("hunyuan", 99), 99);
  assert.equal(clampCivitaiVideoFps("kling", 24), undefined);
});

test("video generate path drops LoRA/FPS for unverified Civitai models only", () => {
  const loras = { "urn:air:hyv1:lora:civitai:1@2": 0.7 };
  assert.deepEqual(studioVideoLoras("civitai", "hunyuan", loras), loras);
  assert.deepEqual(studioVideoLoras("civitai-orchestration", "ltx2.3", loras), loras);
  assert.equal(studioVideoLoras("civitai", "kling", loras), undefined);
  assert.equal(studioVideoLoras("civitai", "hunyuan", {}), undefined);
  assert.deepEqual(studioVideoLoras("fal", "ltx2.3", loras), loras);
  assert.deepEqual(studioVideoLoras("openai-compat", "sora-2", loras), loras);
  assert.deepEqual(civitaiVideoFpsOptions("ltx2.3"), [16, 24, 30]);
  assert.deepEqual(civitaiVideoFpsOptions("hunyuan"), [24, 25, 30]);
  assert.deepEqual(civitaiVideoFpsOptions("kling"), []);
});

test("Civitai helpers do not rewrite non-Civitai fps/quantity/checkpoint", () => {
  assert.equal(studioVideoFps("fal", "ltx2.3", 99), 99);
  assert.equal(studioVideoFps("openai-compat", "sora-2", 24), 24);
  assert.equal(studioVideoFps("civitai", "ltx2.3", 99), 60);
  assert.equal(studioVideoFps("civitai", "ltx2.3", 30), 30);
  assert.equal(studioVideoFps("civitai", "hunyuan", 99), 99);
  assert.equal(studioVideoFps("civitai", "kling", 24), 24);
  assert.equal(studioVideoFps("civitai", "ltx2.3"), undefined);
  assert.equal(resolveStudioImageQuantity("fal", "krea2-turbo", 12), 12);
  assert.equal(resolveStudioImageQuantity("openai-compat", "gpt-image-2", 10), 10);
  assert.equal(resolveStudioImageQuantity("civitai", "krea2-turbo", 12), 12);
  assert.equal(assertCivitaiCheckpointAir("openai-compat", "flux1", "urn:air:keep"), "urn:air:keep");
});

test("LTX generateAudio stays explicit true/false; Hunyuan omits the unofficial field", () => {
  assert.equal(studioVideoGenerateAudio("civitai", "ltx2.3", true), true);
  assert.equal(studioVideoGenerateAudio("civitai", "ltx2.3", false), false);
  assert.equal(studioVideoGenerateAudio("civitai-orchestration", "ltx2.3"), undefined);
  assert.equal(studioVideoGenerateAudio("civitai", "hunyuan", false), undefined);
  assert.equal(studioVideoGenerateAudio("civitai", "hunyuan", true), undefined);
  assert.equal(studioVideoGenerateAudio("ark-plan", "seedance", false), false);
  assert.equal(studioVideoGenerateAudio("xai-imagine", "grok-imagine-video", true), true);
});

test("Civitai video aspectRatio maps to official width/height; other adapters keep the ratio only", () => {
  assert.deepEqual(studioVideoSize("civitai", "ltx2.3", "16:9"), { width: 1280, height: 720 });
  assert.deepEqual(studioVideoSize("civitai", "ltx2.3", "9:16"), { width: 720, height: 1280 });
  assert.deepEqual(studioVideoSize("civitai", "ltx2.3", "1:1"), { width: 1024, height: 1024 });
  assert.deepEqual(studioVideoSize("civitai", "hunyuan", "16:9"), { width: 1280, height: 720 });
  assert.deepEqual(studioVideoSize("civitai", "hunyuan", "9:16"), { width: 480, height: 854 });
  assert.deepEqual(studioVideoSize("civitai", "hunyuan", "1:1"), { width: 480, height: 480 });
  assert.deepEqual(studioVideoSize("civitai", "kling", "16:9"), {});
  assert.deepEqual(studioVideoSize("fal", "ltx2.3", "16:9"), {});
  assert.deepEqual(studioVideoSize("civitai", "ltx2.3", "21:9"), {});
});

test("studio video adapter fields pass page values through without a second generic clamp", () => {
  const loras = { "urn:air:hyv1:lora:civitai:1@2": 0.7 };
  const ltx = studioVideoAdapterFields("civitai", "ltx2.3", {
    fps: 16,
    loras,
    generateAudio: false,
    aspectRatio: "9:16",
  });
  assert.equal(ltx.fps, 16);
  assert.equal(ltx.generateAudio, false);
  assert.equal(ltx.aspectRatio, "9:16");
  assert.equal(ltx.width, 720);
  assert.equal(ltx.height, 1280);
  assert.deepEqual(ltx.loras, loras);

  const hunyuan = studioVideoAdapterFields("civitai", "hunyuan", {
    fps: 25,
    loras,
    generateAudio: true,
    aspectRatio: "16:9",
  });
  assert.equal(hunyuan.fps, 25);
  assert.equal(hunyuan.generateAudio, undefined);
  assert.equal(hunyuan.width, 1280);
  assert.equal(hunyuan.height, 720);
  assert.deepEqual(hunyuan.loras, loras);

  const ark = studioVideoAdapterFields("ark-plan", "doubao-seedance-2.0", {
    fps: 24,
    loras,
    generateAudio: false,
    aspectRatio: "16:9",
  });
  assert.equal(ark.fps, 24);
  assert.equal(ark.generateAudio, false);
  assert.deepEqual(ark.loras, loras);
  assert.equal(ark.aspectRatio, "16:9");
  assert.equal("width" in ark && ark.width !== undefined, false);
  assert.equal("height" in ark && ark.height !== undefined, false);
});

test("image generate path keeps Civitai quantity/checkpoint/LoRA and does not rewrite other adapters", () => {
  const loras = { "urn:air:flux1:lora:civitai:1@2": 0.8 };
  const civitai = studioImageAdapterFields("civitai", "krea2-turbo", { n: 12, loras, checkpointAir: "" });
  assert.equal(civitai.n, 12);
  assert.deepEqual(civitai.loras, loras);
  assert.equal(civitai.checkpointAir, undefined);

  const flux1 = studioImageAdapterFields("civitai", "flux1", {
    n: 8,
    loras,
    checkpointAir: "urn:air:flux1:checkpoint:civitai:1@2",
  });
  assert.equal(flux1.n, 8);
  assert.equal(flux1.checkpointAir, "urn:air:flux1:checkpoint:civitai:1@2");
  assert.deepEqual(flux1.loras, loras);
  assert.throws(() => studioImageAdapterFields("civitai", "flux1", { n: 1 }), /AIR|checkpoint/);

  const fal = studioImageAdapterFields("fal", "krea2-turbo", { n: 12, loras, checkpointAir: "urn:air:keep" });
  assert.equal(fal.n, 12);
  assert.deepEqual(fal.loras, loras);
  assert.equal(fal.checkpointAir, "urn:air:keep");

  const gpt = studioImageAdapterFields("openai-compat", "gpt-image-2", { n: 10, loras });
  assert.equal(gpt.n, 10);
  assert.deepEqual(gpt.loras, loras);
});
