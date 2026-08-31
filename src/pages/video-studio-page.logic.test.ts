import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VIDEO_GENERATION_PARAMETER_NAMES,
} from "../services/api/video-model-capabilities.ts";
import {
  buildVideoStudioGenerateFields,
  buildVideoStudioLoras,
  isCivitaiStudioAdapter,
  snapVideoStudioFps,
  videoStudioCivitaiControls,
  videoStudioModeError,
  videoStudioReferenceControls,
} from "./video-studio-page.logic.ts";

const LORAS = [{ resource: "urn:air:hyv1:lora:civitai:1@2", weight: 0.7 }];

test("Civitai video controls are adapter-gated, not model-name-gated", () => {
  const hunyuan = videoStudioCivitaiControls("civitai", "hunyuan", "preset-civitai");
  assert.equal(hunyuan.showLora, true);
  assert.equal(hunyuan.loraShape, "array");
  assert.equal(hunyuan.fpsSpec?.wire, "frameRate");
  assert.deepEqual(hunyuan.fpsOptions, [24, 25, 30]);
  assert.equal(hunyuan.showGenerateAudio, false);

  const ltx = videoStudioCivitaiControls("civitai", "ltx2.3");
  assert.equal(ltx.showLora, true);
  assert.equal(ltx.loraShape, "map");
  assert.equal(ltx.fpsSpec?.wire, "fps");
  assert.deepEqual(ltx.fpsOptions, [16, 24, 30]);
  assert.equal(ltx.showGenerateAudio, true);

  const klingOnCivitai = videoStudioCivitaiControls("civitai", "kling");
  assert.equal(klingOnCivitai.showLora, false);
  assert.equal(klingOnCivitai.fpsSpec, undefined);

  const grok = videoStudioCivitaiControls("xai-imagine", "grok-imagine-video", "preset-grok-relay");
  assert.equal(grok.showLora, false);
  assert.equal(grok.fpsSpec, undefined);
  assert.deepEqual(grok.fpsOptions, []);

  const openai = videoStudioCivitaiControls("openai-compat", "sora-2", "preset-openai");
  assert.equal(openai.showLora, false);
  assert.equal(openai.fpsSpec, undefined);

  const fal = videoStudioCivitaiControls("fal", "ltx2.3", "preset-fal");
  assert.equal(fal.showLora, false);
  assert.equal(fal.fpsSpec, undefined);
});

test("Hunyuan fps snaps to official common values; LTX uses fps chips", () => {
  assert.equal(snapVideoStudioFps("hunyuan", 25), 25);
  assert.equal(snapVideoStudioFps("hunyuan", 24), 24);
  assert.equal(snapVideoStudioFps("hunyuan", 99), 25);
  assert.equal(snapVideoStudioFps("ltx2.3", 16), 16);
  assert.equal(snapVideoStudioFps("ltx2.3", 24), 24);
  assert.equal(snapVideoStudioFps("kling", 24), undefined);
});

test("Hunyuan image-to-video is blocked with an actionable error; LTX i2v is not intercepted", () => {
  assert.match(
    videoStudioModeError({
      adapterType: "civitai",
      providerId: "preset-civitai",
      model: "hunyuan",
      mode: "i2v",
      firstFrame: "data:image/png;base64,abc",
    }),
    /文生视频/,
  );
  assert.equal(
    videoStudioModeError({
      adapterType: "civitai",
      model: "hunyuan",
      mode: "t2v",
    }),
    "",
  );
  assert.equal(
    videoStudioModeError({
      adapterType: "civitai",
      model: "hunyuan",
      mode: "t2v",
      firstFrame: "data:image/png;base64,abc",
    }),
    "",
    "leftover first-frame draft must not intercept Hunyuan text-to-video",
  );
  assert.equal(
    videoStudioModeError({
      adapterType: "civitai",
      model: "ltx2.3",
      mode: "i2v",
      firstFrame: "data:image/png;base64,abc",
    }),
    "",
  );
  assert.equal(
    videoStudioModeError({
      adapterType: "civitai",
      model: "ltx2.3",
      mode: "i2v",
      firstFrame: "data:image/png;base64,abc",
      lastFrame: "data:image/png;base64,def",
    }),
    "",
    "leftover last-frame draft must not intercept LTX image-to-video",
  );
  assert.equal(
    videoStudioModeError({
      adapterType: "civitai",
      model: "ltx2.3",
      mode: "flf",
      firstFrame: "data:image/png;base64,a",
      lastFrame: "data:image/png;base64,b",
    }),
    "",
  );
  assert.equal(
    videoStudioModeError({
      adapterType: "xai-imagine",
      model: "grok-imagine-video",
      mode: "i2v",
      firstFrame: "data:image/png;base64,abc",
    }),
    "",
  );
});

test("generate payload sends LoRA/FPS only for LTX/Hunyuan on Civitai", () => {
  const hunyuan = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    providerId: "preset-civitai",
    model: "hunyuan",
    mode: "t2v",
    duration: 6,
    ratio: "16:9",
    audio: true,
    fps: 25,
    loras: LORAS,
    isArk: false,
  });
  assert.equal(hunyuan.error, undefined);
  assert.equal(hunyuan.fps, 25);
  assert.deepEqual(hunyuan.loras, { "urn:air:hyv1:lora:civitai:1@2": 0.7 });
  assert.equal(hunyuan.imageUrl, undefined);
  assert.equal(hunyuan.generateAudio, undefined);
  assert.equal(hunyuan.showGenerateAudio, false);
  // Hunyuan live schema accepts 1–30; preserve a valid non-chip value.
  assert.equal(hunyuan.duration, 6);

  const hunyuanLeftoverFrame = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "hunyuan",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    firstFrame: "https://example.test/a.png",
    lastFrame: "https://example.test/b.png",
    audio: false,
    fps: 25,
    loras: LORAS,
    isArk: false,
  });
  assert.equal(hunyuanLeftoverFrame.error, undefined);
  assert.equal(hunyuanLeftoverFrame.imageUrl, undefined);
  assert.equal(hunyuanLeftoverFrame.lastFrameUrl, undefined);
  assert.deepEqual(hunyuanLeftoverFrame.loras, { "urn:air:hyv1:lora:civitai:1@2": 0.7 });

  const hunyuanI2v = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "hunyuan",
    mode: "i2v",
    duration: 5,
    ratio: "16:9",
    firstFrame: "https://example.test/a.png",
    audio: false,
    fps: 24,
    loras: LORAS,
    isArk: false,
  });
  assert.match(String(hunyuanI2v.error), /文生视频/);
  assert.equal(hunyuanI2v.loras, undefined);
  assert.equal(hunyuanI2v.imageUrl, undefined);

  const ltx = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "flf",
    duration: 5,
    ratio: "16:9",
    firstFrame: "https://example.test/first.png",
    lastFrame: "https://example.test/last.png",
    audio: false,
    fps: 16,
    loras: LORAS,
    isArk: false,
  });
  assert.equal(ltx.error, undefined);
  assert.equal(ltx.fps, 16);
  assert.equal(ltx.imageUrl, "https://example.test/first.png");
  assert.equal(ltx.lastFrameUrl, "https://example.test/last.png");
  assert.deepEqual(ltx.loras, { "urn:air:hyv1:lora:civitai:1@2": 0.7 });

  const ltxI2v = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "i2v",
    duration: 5,
    ratio: "16:9",
    firstFrame: "https://example.test/first.png",
    audio: false,
    fps: 24,
    loras: LORAS,
    isArk: false,
  });
  assert.equal(ltxI2v.error, undefined);
  assert.equal(ltxI2v.fps, 24);
  assert.equal(ltxI2v.imageUrl, "https://example.test/first.png");
  assert.equal(ltxI2v.lastFrameUrl, undefined);
  assert.deepEqual(ltxI2v.loras, { "urn:air:hyv1:lora:civitai:1@2": 0.7 });

  const ltxI2vLeftoverLast = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "i2v",
    duration: 5,
    ratio: "16:9",
    firstFrame: "https://example.test/first.png",
    lastFrame: "https://example.test/last.png",
    audio: false,
    fps: 24,
    loras: LORAS,
    isArk: false,
  });
  assert.equal(ltxI2vLeftoverLast.error, undefined);
  assert.equal(ltxI2vLeftoverLast.imageUrl, "https://example.test/first.png");
  assert.equal(ltxI2vLeftoverLast.lastFrameUrl, undefined);
});

test("OpenAI official invalid duration stays selected and becomes a page error", () => {
  const openai = buildVideoStudioGenerateFields({
    adapterType: "openai-compat",
    providerId: "preset-openai",
    model: "sora-2",
    mode: "t2v",
    duration: 6,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: LORAS,
    isArk: false,
    host: "https://api.openai.com/v1",
    protocol: "openai-official",
  });
  assert.deepEqual([...openai.durationOptions], [4, 8, 12]);
  assert.equal(openai.duration, 6);
  assert.match(String(openai.error), /4 \/ 8 \/ 12|只接受/);
  assert.equal(openai.fps, undefined);
  assert.equal(openai.loras, undefined);

  const generic = buildVideoStudioGenerateFields({
    adapterType: "xai-imagine",
    model: "grok-imagine-video",
    mode: "t2v",
    duration: 6,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: LORAS,
    isArk: false,
    host: "https://relay.example.com/v1",
  });
  assert.deepEqual([...generic.durationOptions], [4, 5, 6, 8, 10]);
  assert.equal(generic.duration, 6);
  assert.equal(generic.error, undefined);
  assert.equal(generic.fps, undefined);
  assert.equal(generic.loras, undefined);
});

test("Ark and LTX both send generateAudio true/false; Hunyuan omits it", () => {
  const ark = buildVideoStudioGenerateFields({
    adapterType: "ark-plan",
    model: "doubao-seedance-2.0",
    mode: "t2v",
    duration: 8,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: true,
  });
  assert.equal(ark.generateAudio, false);
  assert.equal(ark.showGenerateAudio, true);

  const ltxOn = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: true,
    fps: 24,
    loras: [],
    isArk: false,
  });
  assert.equal(ltxOn.generateAudio, true);
  assert.equal(ltxOn.showGenerateAudio, true);

  const ltxOff = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
  });
  assert.equal(ltxOff.generateAudio, false);

  const hunyuan = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "hunyuan",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: true,
    fps: 25,
    loras: [],
    isArk: false,
  });
  assert.equal(hunyuan.generateAudio, undefined);
  assert.equal(hunyuan.showGenerateAudio, false);
});

test("LTX/Hunyuan duration chips follow live OpenAPI without changing valid non-chip values", () => {
  // Live ComfyLtx23VideoGenInput: integer 3–20 default 5.
  // Recipe text ("only 3 or 20") conflicts; page follows live schema.
  const ltx = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "t2v",
    duration: 6,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
  });
  assert.deepEqual([...ltx.durationOptions], [3, 5, 8, 10, 15, 20]);
  assert.equal(ltx.duration, 6);

  const ltxLong = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "ltx2.3",
    mode: "t2v",
    duration: 20,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
  });
  assert.equal(ltxLong.duration, 20);

  // Live HunyuanVdeoGenInput: integer 1–30 default 5. Chips stay practical.
  const hunyuan = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    model: "hunyuan",
    mode: "t2v",
    duration: 12,
    ratio: "16:9",
    audio: false,
    fps: 25,
    loras: [],
    isArk: false,
  });
  assert.deepEqual([...hunyuan.durationOptions], [3, 5, 8, 10, 15, 20]);
  assert.equal(hunyuan.duration, 12);

  const openai = buildVideoStudioGenerateFields({
    adapterType: "openai-compat",
    providerId: "preset-openai",
    model: "sora-2",
    mode: "t2v",
    duration: 6,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
    host: "https://api.openai.com/v1",
    protocol: "openai-official",
  });
  assert.deepEqual([...openai.durationOptions], [4, 8, 12]);
  assert.equal(openai.duration, 6);
  assert.match(String(openai.error), /4 \/ 8 \/ 12|只接受/);

  const generic = buildVideoStudioGenerateFields({
    adapterType: "xai-imagine",
    model: "grok-imagine-video",
    mode: "t2v",
    duration: 6,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
    host: "https://relay.example.com/v1",
  });
  assert.deepEqual([...generic.durationOptions], [4, 5, 6, 8, 10]);
  assert.equal(generic.duration, 6);
});

test("blank LoRA rows are not emitted", () => {
  assert.equal(buildVideoStudioLoras(true, [{ resource: "", weight: 1 }]), undefined);
  assert.equal(isCivitaiStudioAdapter("openai-compat", "preset-openai"), false);
  assert.equal(isCivitaiStudioAdapter("openai-compat", "preset-civitai"), false);
  assert.equal(isCivitaiStudioAdapter("fal", "preset-fal"), false);
  assert.equal(isCivitaiStudioAdapter(undefined, "preset-civitai"), true);
});

test("official frame modes are blocked while xAI relay keeps its frame contract", () => {
  const openaiFlf = {
    adapterType: "openai-compat",
    providerId: "preset-openai",
    model: "sora-2",
    mode: "flf" as const,
    firstFrame: "https://example.test/first.png",
    lastFrame: "https://example.test/last.png",
    host: "https://api.openai.com/v1",
    protocol: "openai-official",
  };
  assert.match(videoStudioModeError(openaiFlf), /OpenAI|last_frame|尾帧/iu);

  const openaiI2v = { ...openaiFlf, mode: "i2v" as const };
  assert.match(videoStudioModeError(openaiI2v), /OpenAI|last_frame|尾帧/iu);
  assert.equal(videoStudioModeError({ ...openaiI2v, lastFrame: undefined }), "");

  const xaiOfficialFlf = {
    adapterType: "xai-imagine",
    providerId: "preset-xai-official",
    model: "grok-imagine-video-1.5",
    mode: "flf" as const,
    firstFrame: "https://example.test/first.png",
    lastFrame: "https://example.test/last.png",
    host: "https://api.x.ai/v1",
  };
  assert.match(videoStudioModeError(xaiOfficialFlf), /I2V|R2V|互斥|尾帧/iu);

  const xaiOfficialI2v = { ...xaiOfficialFlf, mode: "i2v" as const };
  assert.match(videoStudioModeError(xaiOfficialI2v), /I2V|R2V|互斥|尾帧/iu);
  assert.equal(videoStudioModeError({ ...xaiOfficialI2v, lastFrame: undefined }), "");

  const xaiRelay = { ...xaiOfficialFlf, providerId: "preset-grok-relay", host: "https://relay.example.com/v1" };
  assert.equal(videoStudioModeError(xaiRelay), "");

  const officialPreview = buildVideoStudioGenerateFields({
    ...openaiFlf,
    duration: 8,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
  });
  assert.equal(officialPreview.referenceControls?.supportsFirstLastFrame, false);

  const relayPreview = buildVideoStudioGenerateFields({
    ...xaiRelay,
    duration: 8,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
  });
  assert.equal(relayPreview.referenceControls?.supportsFirstLastFrame, true);
});

test("configured capability profiles remain authoritative for non-built-in relay models", () => {
  const controls = videoStudioReferenceControls({
    adapterType: "civitai",
    providerId: "custom-civitai",
    model: "custom-first-last",
    host: "https://relay.example.com/v2/consumer",
    videoCapabilityProfiles: { "custom-first-last": "civitai-first-last" },
  });
  assert.equal(controls.supportsFirstFrame, true);
  assert.equal(controls.supportsFirstLastFrame, true);
  assert.equal(controls.flfReason, undefined);
});

test("Studio generation fields keep capability-supported Civitai parameters and reject stale unsupported values", () => {
  const ltx = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    providerId: "preset-civitai",
    model: "ltx2.3",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
    negativePrompt: "blur",
    seed: 17,
    steps: 32,
    guidance: 5.5,
    modelVariant: "22b-dev",
    width: 1280,
    height: 720,
  });
  assert.equal(ltx.error, undefined);
  assert.equal(ltx.negativePrompt, "blur");
  assert.equal(ltx.seed, 17);
  assert.equal(ltx.steps, 32);
  assert.equal(ltx.guidance, 5.5);
  assert.equal(ltx.modelVariant, "22b-dev");
  assert.equal(ltx.width, 1280);
  assert.equal(ltx.height, 720);

  const hunyuan = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    providerId: "preset-civitai",
    model: "hunyuan",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: false,
    fps: 25,
    loras: [],
    isArk: false,
    negativePrompt: "stale",
  });
  assert.match(String(hunyuan.error), /负面提示词|negativePrompt|不支持/iu);
  assert.equal(hunyuan.negativePrompt, undefined);
});

test("generic compatibility relay keeps non-official video extension values", () => {
  const relay = buildVideoStudioGenerateFields({
    adapterType: "openai-compat",
    providerId: "custom-relay",
    model: "relay-video",
    mode: "t2v",
    duration: 16,
    ratio: "21:9",
    audio: false,
    fps: 48,
    loras: [],
    isArk: false,
    host: "https://relay.example.com/v1",
    resolution: "2k",
    negativePrompt: "blur",
    seed: 9,
    watermark: false,
    promptExpansion: false,
    returnLastFrame: true,
    audioUrl: "https://example.test/audio.mp3",
    width: 2048,
    height: 858,
    steps: 33,
    guidance: 7.5,
    modelVariant: "relay-v2",
  });
  assert.equal(relay.error, undefined);
  assert.equal(relay.duration, 16);
  assert.equal(relay.ratio, "21:9");
  assert.equal(relay.resolution, "2k");
  assert.equal(relay.fps, 48);
  assert.equal(relay.generateAudio, false);
  assert.equal(relay.negativePrompt, "blur");
  assert.equal(relay.seed, 9);
  assert.equal(relay.watermark, false);
  assert.equal(relay.promptExpansion, false);
  assert.equal(relay.returnLastFrame, true);
  assert.equal(relay.audioUrl, "https://example.test/audio.mp3");
  assert.equal(relay.width, 2048);
  assert.equal(relay.height, 858);
  assert.equal(relay.steps, 33);
  assert.equal(relay.guidance, 7.5);
  assert.equal(relay.modelVariant, "relay-v2");
});

test("VideoStudioPage exposes capability-supported fields and forwards the generate payload", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "video-studio-page.tsx"), "utf8");
  assert.match(source, /parameterDescriptors/);
  assert.match(source, /createStudioVideo\(\{/);
  for (const field of [
    "resolution: payload.resolution",
    "negativePrompt: payload.negativePrompt",
    "seed: payload.seed",
    "watermark: payload.watermark",
    "promptExpansion: payload.promptExpansion",
    "returnLastFrame: payload.returnLastFrame",
    "audioUrl: payload.audioUrl",
    "width: payload.width",
    "height: payload.height",
    "steps: payload.steps",
    "guidance: payload.guidance",
    "modelVariant: payload.modelVariant",
    "frames: payload.frames",
    "audioMode: payload.audioMode",
    "quantity: payload.quantity",
    "mode: payload.generationMode",
    "frameGuideStrength: payload.frameGuideStrength",
    "safetyChecker: payload.safetyChecker",
    "shift: payload.shift",
    "turbo: payload.turbo",
    "sampler: payload.sampler",
    "scheduler: payload.scheduler",
    "usePro: payload.usePro",
    "aspectRatio: payload.ratio",
    "generateAudio: payload.generateAudio",
    "fps: payload.fps",
    "loras: payload.loras",
  ]) {
    assert.match(source, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /showResolution/);
  assert.match(source, /showDimensions/);
  assert.match(source, /showNegativePrompt/);
  assert.match(source, /showSeed/);
  assert.match(source, /showWatermark/);
  assert.match(source, /showPromptExpansion/);
  assert.match(source, /showReturnLastFrame/);
  assert.match(source, /showAudioUrl/);
  assert.match(source, /showFrames/);
  assert.match(source, /showQuantity/);
  assert.match(source, /showGenerationMode/);
  assert.match(source, /showAudioMode/);
  assert.match(source, /showFrameGuideStrength/);
  assert.match(source, /showSafetyChecker/);
  assert.match(source, /showShift/);
  assert.match(source, /showTurbo/);
  assert.match(source, /不会静默丢弃/);
  assert.doesNotMatch(source, /\["16:9", "9:16", "1:1"\]\.map/);
  assert.match(source, /leftoverFields/);
  assert.match(source, /VIDEO_GENERATION_PARAMETER_NAMES/);
  assert.match(source, /\.map\(\(name\) => descriptorNamed\(parameterDescriptors, name\)\)/);
  assert.ok(VIDEO_GENERATION_PARAMETER_NAMES.length > 0);
});

test("xAI official descriptors expose duration, aspect ratio, and resolution without fabricating extra fields", () => {
  const official = buildVideoStudioGenerateFields({
    adapterType: "xai-imagine",
    providerId: "preset-xai-official",
    model: "grok-imagine-video-1.5",
    mode: "t2v",
    duration: 10,
    ratio: "16:9",
    resolution: "720p",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
    host: "https://api.x.ai/v1",
  });
  assert.equal(official.error, undefined);
  const names = Object.fromEntries(official.parameterDescriptors.map((item) => [item.name, item]));
  assert.equal(names.duration.status, "supported");
  assert.equal(names.aspectRatio.status, "supported");
  assert.equal(names.resolution.status, "supported");
  assert.equal(names.audio.status, "supported");
  assert.equal(names.watermark.status, "unsupported");
  assert.equal(official.resolution, "720p");
  assert.equal(official.generateAudio, false);

  const r2vCap = names.resolution.enumValues || [];
  assert.ok(r2vCap.includes("720p"));
  assert.ok(r2vCap.includes("1080p"));
});

test("Agnes frames and Civitai leftover fields validate through generate payload instead of leftover intercept", () => {
  const agnes = buildVideoStudioGenerateFields({
    adapterType: "agnes",
    providerId: "preset-agnes",
    model: "agnes-video-v2.0",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: false,
    fps: 24,
    frames: 121,
    loras: [],
    isArk: false,
    host: "https://apihub.agnes-ai.com/v1",
  });
  assert.equal(agnes.error, undefined);
  assert.equal(agnes.frames, 121);
  assert.equal(agnes.fps, 24);

  const ltx = buildVideoStudioGenerateFields({
    adapterType: "civitai",
    providerId: "preset-civitai",
    model: "ltx2.3",
    mode: "flf",
    duration: 5,
    ratio: "16:9",
    firstFrame: "https://example.test/first.png",
    lastFrame: "https://example.test/last.png",
    audio: false,
    fps: 24,
    quantity: 3,
    frameGuideStrength: 0.8,
    loras: [],
    isArk: false,
  });
  assert.equal(ltx.error, undefined);
  assert.equal(ltx.quantity, 3);
  assert.equal(ltx.frameGuideStrength, 0.8);

  const dashscope = buildVideoStudioGenerateFields({
    adapterType: "dashscope",
    providerId: "preset-aliyun-dashscope",
    model: "wan2.7-videoedit",
    mode: "t2v",
    duration: 5,
    ratio: "16:9",
    audio: false,
    fps: 24,
    audioMode: "origin",
    loras: [],
    isArk: false,
    host: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });
  assert.equal(dashscope.error, undefined);
  assert.equal(dashscope.audioMode, "origin");
});
