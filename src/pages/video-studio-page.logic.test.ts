import assert from "node:assert/strict";
import test from "node:test";
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
  // leftover generic 6s snaps onto Hunyuan live chips (schema 1–30, default 5)
  assert.equal(hunyuan.duration, 5);

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

test("OpenAI official duration options stay 4/8/12 and Civitai does not leak LoRA onto Sora", () => {
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
  assert.equal(openai.duration, 4);
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

test("LTX/Hunyuan duration chips follow live OpenAPI, not OpenAI/generic 4/8/12", () => {
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
  assert.equal(ltx.duration, 5);

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
  assert.equal(hunyuan.duration, 10);

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
  assert.equal(openai.duration, 4);

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

test("xAI 1.5 page exposes generateAudio true/false while official frames stay first-only", () => {
  const officialOn = buildVideoStudioGenerateFields({
    adapterType: "xai-imagine",
    providerId: "preset-xai-official",
    model: "grok-imagine-video-1.5",
    mode: "t2v",
    duration: 8,
    ratio: "16:9",
    audio: true,
    fps: 24,
    loras: [],
    isArk: false,
    host: "https://api.x.ai/v1",
  });
  assert.equal(officialOn.showGenerateAudio, true);
  assert.equal(officialOn.generateAudio, true);
  assert.equal(officialOn.referenceControls?.supportsFirstLastFrame, false);
  assert.equal(officialOn.referenceControls?.supportsLastFrameInI2v, false);

  const officialOff = buildVideoStudioGenerateFields({
    ...officialOn,
    adapterType: "xai-imagine",
    providerId: "preset-xai-official",
    model: "grok-imagine-video-1.5",
    mode: "t2v",
    duration: 8,
    ratio: "16:9",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
    host: "https://api.x.ai/v1",
  });
  assert.equal(officialOff.generateAudio, false);

  const relay = buildVideoStudioGenerateFields({
    adapterType: "xai-imagine",
    providerId: "preset-grok-relay",
    model: "grok-imagine-video-1.5",
    mode: "flf",
    duration: 8,
    ratio: "16:9",
    firstFrame: "https://example.test/first.png",
    lastFrame: "https://example.test/last.png",
    audio: false,
    fps: 24,
    loras: [],
    isArk: false,
    host: "https://relay.example.com/v1",
  });
  assert.equal(relay.referenceControls?.supportsFirstLastFrame, true);
  assert.equal(relay.lastFrameUrl, "https://example.test/last.png");
});
