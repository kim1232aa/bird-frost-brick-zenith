import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImageStudioGenerateFields,
  buildImageStudioRequest,
  buildImageStudioLoras,
  imageStudioCheckpointError,
  imageStudioParamState,
  imageStudioRefError,
  normalizeCivitaiImageDims,
  resolveImageStudioFamily,
  snapCivitaiImageDim,
  snapImageStudioCount,
} from "./image-studio-page.logic.ts";

const LORAS = [{ resource: "urn:air:sdxl:lora:civitai:1@2", weight: 0.8 }];
const DIMS = { width: 1024, height: 1024 };

test("Civitai adapter wins over seedream/ark name matching", () => {
  assert.equal(resolveImageStudioFamily("preset-civitai::seedream-4.5", "civitai"), "civitai");
  assert.equal(resolveImageStudioFamily("preset-civitai::seedream-5.0-pro", "civitai-orchestration"), "civitai");
  assert.equal(resolveImageStudioFamily("preset-civitai::seedream-4.5"), "civitai");
  assert.equal(resolveImageStudioFamily("preset-fal::seedream-4.5", "fal"), "generic");
  assert.equal(resolveImageStudioFamily("preset-fal::flux-dev", "fal"), "generic");
  assert.equal(resolveImageStudioFamily("preset-volcengine-plan::doubao-seedream-5.0-lite", "ark-plan"), "ark");
  assert.equal(resolveImageStudioFamily("preset-civitai::flux1", "civitai"), "civitai");
  assert.equal(resolveImageStudioFamily("preset-openai::gpt-image-2", "openai-compat"), "gpt");
  assert.equal(resolveImageStudioFamily("preset-openai::chatgpt-image-latest", "openai-compat"), "gpt");
  assert.equal(resolveImageStudioFamily("preset-grok-relay::grok-imagine-image", "xai-imagine"), "grok");
  assert.equal(resolveImageStudioFamily("preset-openai::sdxl", "openai-compat"), "generic");
});

test("LoRA and checkpoint controls follow official engine support, not a regex", () => {
  const flux1 = imageStudioParamState("civitai", "flux1");
  assert.equal(flux1.showLora, true);
  assert.equal(flux1.loraShape, "map");
  assert.equal(flux1.needsCheckpoint, true);
  assert.deepEqual(flux1.quantityOptions, [1, 2, 4, 6, 8, 12]);

  const sdxl = imageStudioParamState("civitai", "sdxl");
  assert.equal(sdxl.needsCheckpoint, true);
  assert.equal(sdxl.showLora, true);

  const krea = imageStudioParamState("civitai", "krea2-turbo");
  assert.equal(krea.showLora, true);
  assert.equal(krea.needsCheckpoint, false);
  assert.equal(krea.quantityMax, 12);

  const flux2dev = imageStudioParamState("civitai", "flux2-dev");
  assert.equal(flux2dev.loraShape, "array");
  assert.equal(flux2dev.needsCheckpoint, false);
  assert.equal(flux2dev.quantityMax, 4);

  const grok = imageStudioParamState("civitai", "civitai-grok");
  assert.equal(grok.showLora, false);
  assert.equal(grok.showNegative, false);
  assert.equal(grok.showSeed, false);
  assert.equal(grok.quantityMax, 4);

  const klein = imageStudioParamState("civitai", "flux2-klein");
  assert.equal(klein.showLora, true);
  assert.equal(klein.showNegative, true);
  assert.equal(klein.needsCheckpoint, false);

  const flux1Neg = imageStudioParamState("civitai", "flux1");
  assert.equal(flux1Neg.showNegative, false);
  const sdxlNeg = imageStudioParamState("civitai", "sdxl");
  assert.equal(sdxlNeg.showNegative, true);
  const kreaNeg = imageStudioParamState("civitai", "krea2-turbo");
  assert.equal(kreaNeg.showNegative, true);

  const qwen = imageStudioParamState("civitai", "qwen-3.0-pro");
  assert.equal(qwen.showLora, false);
  assert.equal(qwen.quantityMax, 6);
  // Official QwenApiImageGenInput has negativePrompt, but the current adapter
  // body for qwen-3.0-pro does not forward it — do not fake-show the field.
  assert.equal(qwen.showNegative, false);

  const seedream = imageStudioParamState("civitai", "seedream-4.5");
  assert.equal(seedream.showLora, false);
  assert.equal(seedream.quantityMax, 12);
});

test("Civitai short catalog engines keep published size so the studio shows aspect chips", () => {
  const krea = imageStudioParamState("civitai", "krea2-turbo");
  assert.equal(krea.showAspect, true);
  assert.equal(krea.showQuality, false);

  const payload = buildImageStudioGenerateFields({
    family: "civitai",
    model: "krea2-turbo",
    mode: "t2i",
    quality: "std",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 1280, height: 720 },
  });
  assert.equal(payload.error, undefined);
  assert.equal(payload.width, 1280);
  assert.equal(payload.height, 720);
  assert.equal(payload.n, 1);

  assert.equal(imageStudioParamState("civitai", "flux2-klein").showAspect, true);
  assert.equal(imageStudioParamState("civitai", "civitai-grok").showAspect, true);
  assert.equal(imageStudioParamState("civitai", "seedream-4.5").showAspect, true);
});

test("Seedream keeps its backend-supported seed control and wire value", () => {
  const seedream = imageStudioParamState("civitai", "seedream-4.5");
  assert.equal(seedream.showSeed, true);

  const payload = buildImageStudioGenerateFields({
    family: "civitai",
    model: "seedream-4.5",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "123",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(payload.seed, 123);
});

test("non-Civitai providers never show Civitai LoRA/checkpoint and follow published output counts", () => {
  const ark = imageStudioParamState("ark", "doubao-seedream-5.0-lite");
  assert.equal(ark.showLora, false);
  assert.equal(ark.needsCheckpoint, false);
  assert.equal(ark.quantityMax, null);
  assert.deepEqual(ark.quantityOptions, [1, 2, 4, 6, 8, 10]);

  const grok = imageStudioParamState("grok", "grok-imagine-image");
  assert.equal(grok.showLora, false);
  assert.equal(grok.quantityMax, 10);
  assert.deepEqual(grok.quantityOptions, [1, 2, 4, 6, 8, 10]);

  const gpt = imageStudioParamState("gpt", "gpt-image-2");
  assert.equal(gpt.quantityMax, 10);
  assert.deepEqual(gpt.quantityOptions, [1, 2, 4, 6, 8, 10]);
  assert.equal(gpt.showLora, false);
  assert.equal(gpt.needsCheckpoint, false);
  assert.equal(gpt.referenceMax, 0);

  const fal = imageStudioParamState("generic", "flux-dev");
  assert.equal(fal.showLora, false);
  assert.equal(fal.needsCheckpoint, false);
  assert.equal(fal.showSeed, false);
  assert.equal(fal.quantityMax, null);
  assert.deepEqual(fal.quantityOptions, [1, 2, 4, 6, 8, 10]);
});

test("GPT Image edit uses official n 1-10 and 16 reference images, not a hard 3-image cap", () => {
  for (const model of ["gpt-image-2", "gpt-image-2-2026-04-21", "chatgpt-image-latest"]) {
    const gpt = imageStudioParamState("gpt", model, "edit");
    assert.equal(gpt.quantityMax, 10, model);
    assert.deepEqual(gpt.quantityOptions, [1, 2, 4, 6, 8, 10]);
    assert.equal(gpt.referenceMin, 1, model);
    assert.equal(gpt.referenceMax, 16, model);
    assert.equal(gpt.referencesSupported, true, model);
    assert.equal(imageStudioRefError("gpt", model, "edit", 16), "");
    assert.match(imageStudioRefError("gpt", model, "edit", 17), /最多 16 张/);
  }

  const generated = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 10,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(generated.error, undefined);
  assert.equal(generated.count, 10);
  assert.equal(generated.n, 10);

  const staleReference = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: ["data:image/png;base64,stale"],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.match(String(staleReference.error), /文生图.*参考图|参考图.*图生图/);

  const references = Array.from({ length: 16 }, (_, index) => `data:image/png;base64,ref${index}`);
  const edited = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "edit",
    quality: "hq",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 10,
    references,
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(edited.error, undefined);
  assert.equal(edited.n, 10);
  assert.equal(edited.imageUrls?.length, 16);
});

test("xAI Imagine keeps the official 3-reference edit cap and n 1-10", () => {
  const grok = imageStudioParamState("grok", "grok-imagine-image-2.0", "edit");
  assert.equal(grok.quantityMax, 10);
  assert.equal(grok.referenceMax, 3);
  assert.equal(imageStudioRefError("grok", "grok-imagine-image-2.0", "edit", 3), "");
  assert.match(imageStudioRefError("grok", "grok-imagine-image-2.0", "edit", 4), /最多 3 张/);

  const generated = buildImageStudioGenerateFields({
    family: "grok",
    model: "grok-imagine-image-2.0",
    mode: "t2i",
    quality: "std",
    aspect: "16:9",
    size: "2k",
    seed: "",
    count: 10,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(generated.n, 10);
  assert.equal(generated.quality, "medium");
  const params = imageStudioParamState("grok", "grok-imagine-image-2.0", "t2i");
  assert.equal(params.showAspect, true);
  assert.equal(params.showQuality, true);
  assert.deepEqual(params.qualityOptions, ["eco", "std"]);
});

test("Grok edit exposes only fields that its JSON edit contract actually forwards", () => {
  const state = imageStudioParamState("grok", "grok-imagine-image-quality", "i2i");
  assert.equal(state.showNegative, false);
  assert.equal(state.showAspect, false);
  assert.equal(state.showQuality, false);

  const payload = buildImageStudioGenerateFields({
    family: "grok",
    model: "grok-imagine-image-quality",
    mode: "i2i",
    quality: "hq",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: ["https://example.test/mug.jpg"],
    loras: [],
    checkpointAir: "",
    negativePrompt: "不要文字",
    dims: { width: 1280, height: 720 },
  });
  assert.equal(payload.size, undefined);
  assert.equal(payload.aspectRatio, undefined);
  assert.equal(payload.width, undefined);
  assert.equal(payload.height, undefined);
  assert.equal(payload.negativePrompt, undefined);
});

test("Agnes and SenseNova send provider-valid image sizes instead of aspect labels", () => {
  const agnes = buildImageStudioGenerateFields({
    family: "agnes",
    model: "agnes-image-2.1-flash",
    mode: "t2i",
    quality: "std",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(agnes.size, "2K");
  assert.equal(agnes.aspectRatio, "16:9");

  const sensenova = buildImageStudioGenerateFields({
    family: "sensenova",
    model: "sensenova-u1-fast",
    mode: "t2i",
    quality: "std",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(sensenova.size, "2752x1536");
  assert.equal(sensenova.aspectRatio, undefined);
});

test("quantity chips snap to the engine max instead of a hard 4", () => {
  assert.equal(snapImageStudioCount(12, [1, 2, 4, 6, 8, 12]), 12);
  assert.equal(snapImageStudioCount(12, [1, 2, 4]), 4);
  assert.equal(snapImageStudioCount(6, [1, 2, 4, 6]), 6);
});

test("checkpoint AIR is required for Flux1/SDXL and never invented", () => {
  assert.match(imageStudioCheckpointError(true, "flux1", ""), /checkpoint AIR/);
  assert.equal(imageStudioCheckpointError(true, "sdxl", "urn:air:sdxl:checkpoint:civitai:1@2"), "");
  assert.equal(imageStudioCheckpointError(false, "krea2-turbo", ""), "");
});

test("Krea reference modes use the edit cap while unsupported models remain blocked", () => {
  assert.equal(imageStudioRefError("civitai", "krea2-turbo", "i2i", 0), "图生图至少上传 1 张参考图");
  assert.equal(imageStudioRefError("civitai", "krea2-turbo", "i2i", 1), "");
  assert.equal(imageStudioRefError("civitai", "krea2-raw", "edit", 2), "");
  assert.match(imageStudioRefError("civitai", "krea2-raw", "edit", 3), /最多 2 张/);
  assert.match(imageStudioRefError("civitai", "z-image-turbo", "edit", 1), /文生图/);
  assert.match(imageStudioRefError("civitai", "anima", "i2i", 1), /文生图|createImage/);
  assert.equal(imageStudioRefError("civitai", "flux2-klein", "i2i", 1), "");
  assert.equal(imageStudioRefError("civitai", "flux2-klein", "i2i", 2), "");
  assert.match(imageStudioRefError("civitai", "flux2-klein", "i2i", 3), /最多 2 张/);
  assert.equal(imageStudioRefError("civitai", "sdxl", "t2i", 0), "");
  assert.equal(imageStudioRefError("civitai", "flux1", "i2i", 0), "图生图至少上传 1 张参考图");
  assert.match(imageStudioRefError("civitai", "flux1", "i2i", 2), /最多 1 张/);
  assert.equal(imageStudioRefError("civitai", "flux2-pro", "i2i", 1), "");
  assert.equal(imageStudioRefError("civitai", "qwen-3.0-pro", "edit", 3), "");
});

test("Krea create and edit modes keep their separate quantity contracts", () => {
  const createState = imageStudioParamState("civitai", "krea2-turbo", "t2i");
  assert.equal(createState.quantityMax, 12);
  assert.deepEqual(createState.quantityOptions, [1, 2, 4, 6, 8, 12]);

  const editState = imageStudioParamState("civitai", "krea2-turbo", "i2i");
  assert.equal(editState.quantityMax, 4);
  assert.deepEqual(editState.quantityOptions, [1, 2, 4]);

  const create = buildImageStudioGenerateFields({
    family: "civitai",
    model: "krea2-turbo",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 12,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(create.error, undefined);
  assert.equal(create.count, 12);
  assert.equal(create.n, 12);
  assert.deepEqual(create.imageUrls, []);

  const i2i = buildImageStudioGenerateFields({
    family: "civitai",
    model: "krea2-turbo",
    mode: "i2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 12,
    references: ["https://example.test/a.png"],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(i2i.error, undefined);
  assert.equal(i2i.count, 4);
  assert.equal(i2i.n, 4);
  assert.deepEqual(i2i.imageUrls, ["https://example.test/a.png"]);

  const edit = buildImageStudioGenerateFields({
    family: "civitai",
    model: "krea2-raw",
    mode: "edit",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 4,
    references: ["https://example.test/a.png", "https://example.test/b.png"],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(edit.error, undefined);
  assert.equal(edit.count, 4);
  assert.deepEqual(edit.imageUrls, ["https://example.test/a.png", "https://example.test/b.png"]);

  const tooManyRefs = buildImageStudioGenerateFields({
    family: "civitai",
    model: "krea2-raw",
    mode: "edit",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 5,
    references: ["https://example.test/a.png", "https://example.test/b.png", "https://example.test/c.png"],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.match(String(tooManyRefs.error), /最多 2 张/);
  assert.equal(tooManyRefs.count, 4);
});

test("generate payload omits LoRA/checkpoint for unsupported engines and includes them when official", () => {
  const flux1 = buildImageStudioGenerateFields({
    family: "civitai",
    model: "flux1",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "7",
    count: 8,
    references: [],
    loras: LORAS,
    checkpointAir: "urn:air:flux1:checkpoint:civitai:1@2",
    negativePrompt: "blurry",
    dims: DIMS,
  });
  assert.equal(flux1.error, undefined);
  assert.equal(flux1.n, 8);
  assert.equal(flux1.checkpointAir, "urn:air:flux1:checkpoint:civitai:1@2");
  assert.deepEqual(flux1.loras, { "urn:air:sdxl:lora:civitai:1@2": 0.8 });
  assert.equal(flux1.seed, 7);
  assert.equal(flux1.width, 1024);
  assert.equal(flux1.negativePrompt, undefined);

  const missingAir = buildImageStudioGenerateFields({
    family: "civitai",
    model: "sdxl",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: LORAS,
    checkpointAir: "  ",
    negativePrompt: "blurry",
    dims: DIMS,
  });
  assert.match(String(missingAir.error), /不会编造 AIR/);
  assert.equal(missingAir.checkpointAir, undefined);
  assert.equal(missingAir.loras, undefined);

  const grokCivitai = buildImageStudioGenerateFields({
    family: "civitai",
    model: "civitai-grok",
    mode: "t2i",
    quality: "std",
    aspect: "16:9",
    size: "2K",
    seed: "3",
    count: 12,
    references: [],
    loras: LORAS,
    checkpointAir: "urn:air:should-not-send",
    negativePrompt: "blurry",
    dims: { width: 1280, height: 720 },
  });
  assert.equal(grokCivitai.loras, undefined);
  assert.equal(grokCivitai.checkpointAir, undefined);
  assert.equal(grokCivitai.negativePrompt, undefined);
  assert.equal(grokCivitai.seed, undefined);
  assert.equal(grokCivitai.n, 4);

  const sdxlNegPayload = buildImageStudioGenerateFields({
    family: "civitai",
    model: "sdxl",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "urn:air:sdxl:checkpoint:civitai:1@2",
    negativePrompt: "worst quality",
    dims: DIMS,
  });
  assert.equal(sdxlNegPayload.negativePrompt, "worst quality");

  const kleinNeg = buildImageStudioGenerateFields({
    family: "civitai",
    model: "flux2-klein",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "11",
    count: 2,
    references: [],
    loras: LORAS,
    checkpointAir: "",
    negativePrompt: "blurry",
    dims: DIMS,
  });
  assert.equal(kleinNeg.error, undefined);
  assert.equal(kleinNeg.negativePrompt, "blurry");
  assert.equal(kleinNeg.checkpointAir, undefined);
  assert.deepEqual(kleinNeg.loras, { "urn:air:sdxl:lora:civitai:1@2": 0.8 });

  const flux2devNoNeg = buildImageStudioGenerateFields({
    family: "civitai",
    model: "flux2-dev",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: LORAS,
    checkpointAir: "",
    negativePrompt: "blurry",
    dims: DIMS,
  });
  assert.equal(flux2devNoNeg.negativePrompt, undefined);
  assert.deepEqual(flux2devNoNeg.loras, { "urn:air:sdxl:lora:civitai:1@2": 0.8 });

  const openai = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "t2i",
    quality: "hq",
    aspect: "1:1",
    size: "2K",
    seed: "9",
    count: 4,
    references: [],
    loras: LORAS,
    checkpointAir: "urn:air:nope",
    negativePrompt: "blurry",
    dims: DIMS,
  });
  assert.equal(openai.loras, undefined);
  assert.equal(openai.checkpointAir, undefined);
  assert.equal(openai.seed, undefined);
  assert.equal(openai.size, "1536x1536");
  assert.equal(openai.width, undefined);

  const qwenNoNeg = buildImageStudioGenerateFields({
    family: "civitai",
    model: "qwen-3.0-pro",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "3",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    negativePrompt: "blurry",
    dims: DIMS,
  });
  assert.equal(qwenNoNeg.negativePrompt, undefined);
  assert.equal(qwenNoNeg.params.showNegative, false);
});

test("empty LoRA rows are dropped so unverified blanks never leave the page", () => {
  assert.equal(buildImageStudioLoras(true, [{ resource: "  ", weight: 1 }]), undefined);
  assert.equal(buildImageStudioLoras(false, LORAS), undefined);
  assert.deepEqual(buildImageStudioLoras(true, LORAS), { "urn:air:sdxl:lora:civitai:1@2": 0.8 });
});

test("Civitai image width/height snap to multiples of 16 inside the live engine range", () => {
  assert.equal(snapCivitaiImageDim(1024, 512, 2048), 1024);
  assert.equal(snapCivitaiImageDim(540, 512, 2048), 544);
  assert.deepEqual(normalizeCivitaiImageDims("flux2-klein", { width: 1280, height: 720 }), { width: 1280, height: 720 });

  const klein = buildImageStudioGenerateFields({
    family: "civitai",
    model: "flux2-klein",
    mode: "t2i",
    quality: "eco",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 960, height: 540 },
  });
  assert.equal(klein.width, 960);
  assert.equal(klein.height, 544);
  assert.equal((klein.width ?? 0) % 16, 0);
  assert.equal((klein.height ?? 0) % 16, 0);

  const flux2Floor = buildImageStudioGenerateFields({
    family: "civitai",
    model: "flux2-pro",
    mode: "t2i",
    quality: "eco",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 500, height: 100 },
  });
  assert.equal(flux2Floor.width, 512);
  assert.equal(flux2Floor.height, 512);

  const flux2Ceil = buildImageStudioGenerateFields({
    family: "civitai",
    model: "flux2-dev",
    mode: "t2i",
    quality: "hq",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 2050, height: 4096 },
  });
  assert.equal(flux2Ceil.width, 2048);
  assert.equal(flux2Ceil.height, 2048);

  const qwen = buildImageStudioGenerateFields({
    family: "civitai",
    model: "qwen-3.0-pro",
    mode: "t2i",
    quality: "std",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 1328, height: 1330 },
  });
  assert.equal(qwen.width, 1328);
  assert.equal(qwen.height, 1328);

  const seedream = buildImageStudioGenerateFields({
    family: "civitai",
    model: "seedream-4.5",
    mode: "t2i",
    quality: "eco",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 200, height: 200 },
  });
  assert.equal(seedream.width, 256);
  assert.equal(seedream.height, 256);

  const krea = buildImageStudioGenerateFields({
    family: "civitai",
    model: "krea2-turbo",
    mode: "t2i",
    quality: "eco",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 50, height: 70 },
  });
  assert.equal(krea.width, 64);
  assert.equal(krea.height, 64);

  const gpt = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "t2i",
    quality: "std",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: { width: 960, height: 540 },
  });
  assert.equal(gpt.width, undefined);
  assert.equal(gpt.height, undefined);
});

test("GPT Image sizes follow each model profile and preserve edit references", () => {
  const gpt2 = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "t2i",
    quality: "hq",
    aspect: "1:1",
    size: "2K",
    seed: "",
    count: 1,
    references: [],
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });
  assert.equal(gpt2.size, "1536x1536");

  for (const model of ["gpt-image-1.5", "gpt-image-1"]) {
    const generated = buildImageStudioGenerateFields({
      family: "gpt",
      model,
      mode: "t2i",
      quality: "hq",
      aspect: "1:1",
      size: "2K",
      seed: "",
      count: 1,
      references: [],
      loras: [],
      checkpointAir: "",
      dims: DIMS,
    });
    assert.equal(generated.size, "1024x1024");

    const references = ["data:image/png;base64,first", "data:image/png;base64,second"];
    const edited = buildImageStudioGenerateFields({
      family: "gpt",
      model,
      mode: "edit",
      quality: "hq",
      aspect: "1:1",
      size: "2K",
      seed: "",
      count: 1,
      references,
      loras: [],
      checkpointAir: "",
      dims: DIMS,
    });
    assert.equal(edited.size, "1024x1024");
    assert.deepEqual(edited.imageUrls, references);

    const landscape = buildImageStudioGenerateFields({
      family: "gpt",
      model,
      mode: "t2i",
      quality: "std",
      aspect: "16:9",
      size: "2K",
      seed: "",
      count: 1,
      references: [],
      loras: [],
      checkpointAir: "",
      dims: DIMS,
    });
    assert.equal(landscape.size, "1536x1024");
  }
});

test("page request mapping forwards GPT quality and every edit reference", () => {
  const references = Array.from({ length: 16 }, (_, index) => `data:image/png;base64,ref${index}`);
  const payload = buildImageStudioGenerateFields({
    family: "gpt",
    model: "gpt-image-2",
    mode: "edit",
    quality: "hq",
    aspect: "16:9",
    size: "2K",
    seed: "",
    count: 10,
    references,
    loras: [],
    checkpointAir: "",
    dims: DIMS,
  });

  assert.deepEqual(buildImageStudioRequest({
    mode: "edit",
    relays: [],
    prompt: "change the lighting",
    providerId: "preset-openai",
    model: "gpt-image-2",
    payload,
    workTitle: "改图",
  }), {
    relays: [],
    prompt: "change the lighting",
    providerId: "preset-openai",
    model: "gpt-image-2",
    size: "1536x864",
    aspectRatio: "16:9",
    width: undefined,
    height: undefined,
    seed: undefined,
    quality: "high",
    imageUrl: references[0],
    imageUrls: references,
    negativePrompt: undefined,
    n: 10,
    operation: "edit",
    loras: undefined,
    checkpointAir: undefined,
    workTitle: "改图",
  });
});

test("GPT Image 2 aliases transmit quality and an aspect-ratio-compatible edit size", () => {
  for (const model of ["gpt-image-2", "gpt-image-2-2026-04-21", "chatgpt-image-latest"]) {
    const edited = buildImageStudioGenerateFields({
      family: "gpt",
      model,
      mode: "edit",
      quality: "hq",
      aspect: "16:9",
      size: "2K",
      seed: "",
      count: 10,
      references: ["data:image/png;base64:first"],
      loras: [],
      checkpointAir: "",
      dims: DIMS,
    });
    assert.equal(edited.error, undefined, model);
    assert.equal(edited.quality, "high", model);
    assert.equal(edited.aspectRatio, "16:9", model);
    assert.equal(edited.size, "1536x864", model);
    assert.equal(edited.n, 10, model);
  }
});
