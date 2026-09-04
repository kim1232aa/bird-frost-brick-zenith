import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConfiguredVideoCapabilityProfileCompatibility,
  nativeVideoAdapterType,
  nativeVideoSubmissionAdapterType,
  resolveVideoModelCapability,
  validateVideoGenerationParameters,
  videoCapabilityProfileCompatibility,
} from "./video-model-capabilities.ts";

const officialProvider = {
  id: "preset-xai-official",
  adapterType: "xai-imagine",
  baseUrl: "https://api.x.ai/v1",
  videoCapabilityProfiles: { "grok-imagine-video-1.5": "xai-imagine-video" },
};
const relayProvider = {
  id: "preset-grok-relay",
  adapterType: "xai-imagine",
  baseUrl: "https://relay.example.com/v1",
  videoCapabilityProfiles: { "grok-imagine-video-1.5": "xai-imagine-video" },
};

test("xAI official video rejects static first/last frames while relay keeps its frame contract", () => {
  const official = resolveVideoModelCapability({ model: "grok-imagine-video-1.5", provider: officialProvider });
  assert.equal(official.supportsFirstFrame, true);
  assert.equal(official.supportsFirstLastFrame, false);
  assert.deepEqual(official.referenceImagePolicy, { supported: true, min: 1, max: 7 });
  assert.equal(official.supportsReferenceSetWithFirst, false);
  assert.equal(official.supportsReferenceSetWithFrames, false);
  assert.deepEqual(official.supportedOperations, ["text-to-video", "image-to-video", "reference-to-video"]);

  const relay = resolveVideoModelCapability({ model: "grok-imagine-video-1.5", provider: relayProvider });
  assert.equal(relay.supportsFirstFrame, true);
  assert.equal(relay.supportsFirstLastFrame, true);
  assert.equal(relay.referenceImagePolicy.supported, true);
  assert.equal(relay.referenceImagePolicy.supported ? relay.referenceImagePolicy.max : undefined, 5);
  assert.equal(relay.supportsReferenceSetWithFirst, true);
  assert.equal(relay.supportsReferenceSetWithFrames, true);
  assert.ok(relay.supportedOperations?.includes("first-last-frame-to-video"));
});

test("xAI generate_audio is supported, including false, only on the documented 1.5 video model", () => {
  const capability = resolveVideoModelCapability({ model: "grok-imagine-video-1.5", provider: officialProvider });
  assert.equal(capability.generationParameters.audio.status, "supported");
  assert.equal(capability.generationParameters.audio.valueType, "boolean");
  assert.equal(capability.generationParameters.audio.transportName, "generate_audio");
  assert.doesNotThrow(() => validateVideoGenerationParameters(capability, { audio: true }));
  assert.doesNotThrow(() => validateVideoGenerationParameters(capability, { audio: false }));

  const legacy = resolveVideoModelCapability({ model: "grok-imagine-video", provider: officialProvider });
  assert.equal(legacy.generationParameters.audio.status, "unsupported");
  assert.throws(
    () => validateVideoGenerationParameters(legacy, { audio: false }),
    /音频|不支持/iu,
  );
});

test("xAI compatible relay defaults aspect_ratio to 16:9 when the user did not choose a ratio", () => {
  const relay = resolveVideoModelCapability({ model: "grok-imagine-video", provider: relayProvider });
  assert.equal(relay.generationParameters.aspectRatio.status, "supported");
  assert.equal(relay.generationParameters.aspectRatio.defaultValue, "16:9");
});

test("Civitai short video ids resolve their verified generation parameter contracts", () => {
  const ltx = resolveVideoModelCapability({
    model: "ltx2.3",
    provider: { id: "preset-civitai", adapterType: "civitai-orchestration" },
  });
  assert.equal(ltx.generationParameters.duration.status, "supported");
  assert.equal(ltx.generationParameters.duration.minimum, 3);
  assert.equal(ltx.generationParameters.duration.maximum, 20);
  assert.doesNotThrow(() => validateVideoGenerationParameters(ltx, { duration: 16 }));
  assert.throws(() => validateVideoGenerationParameters(ltx, { duration: 2 }), /最小值|3/);
  assert.equal(ltx.generationParameters.steps.status, "supported");
  assert.equal(ltx.generationParameters.steps.transportName, "numInferenceSteps");
  assert.equal(ltx.generationParameters.guidance.transportName, "guidanceScale");
  assert.deepEqual(ltx.generationParameters.modelVariant.enumValues, ["22b-dev", "22b-distilled"]);
  assert.equal(ltx.generationParameters.modelVariant.defaultValue, "22b-distilled");

  const hunyuan = resolveVideoModelCapability({
    model: "hunyuan",
    provider: { id: "preset-civitai", adapterType: "civitai-orchestration" },
  });
  assert.equal(hunyuan.generationParameters.steps.status, "supported");
  assert.equal(hunyuan.generationParameters.steps.transportName, "steps");
  assert.equal(hunyuan.generationParameters.steps.defaultValue, 40);
  assert.equal(hunyuan.generationParameters.guidance.transportName, "cfgScale");
  assert.equal(hunyuan.generationParameters.negativePrompt.status, "unsupported");
});

test("studio adapter aliases reach their native video capability contracts", () => {
  const arkProvider = { id: "preset-volcengine-plan", adapterType: "ark-plan" };
  assert.equal(nativeVideoAdapterType(arkProvider), "ark");
  assert.equal(
    resolveVideoModelCapability({ model: "doubao-seedance-1.5-pro", provider: arkProvider }).id,
    "ark-seedance-legacy",
  );
  assert.equal(
    videoCapabilityProfileCompatibility(arkProvider, "ark-seedance-legacy").compatible,
    true,
  );

  const civitaiProvider = { id: "preset-civitai", adapterType: "civitai" };
  assert.equal(nativeVideoAdapterType(civitaiProvider), "civitai-orchestration");
  assert.equal(resolveVideoModelCapability({ model: "ltx2.3", provider: civitaiProvider }).id, "civitai-first-last");
});

test("video capability mapping fails closed for unknown xAI models and incompatible adapters", () => {
  const unknownXai = resolveVideoModelCapability({
    model: "grok-imagine-video-9.9",
    provider: { id: "preset-xai", adapterType: "xai-imagine", baseUrl: "https://api.x.ai/v1" },
  });
  assert.equal(unknownXai.id, "openai-unknown");
  assert.equal(unknownXai.provider, "openai");
  assert.notEqual(unknownXai.generationParameters.duration.status, "supported");

  const openaiAdapter = resolveVideoModelCapability({
    model: "grok-imagine-video-1.5",
    provider: { id: "preset-openai", adapterType: "openai-compat", baseUrl: "https://relay.example.test/v1" },
  });
  assert.equal(openaiAdapter.id, "openai-unknown");
  assert.notEqual(openaiAdapter.generationParameters.duration.status, "supported");

  const arbitraryProvider = resolveVideoModelCapability({
    model: "grok-imagine-video-1.5",
    provider: { id: "preset-arbitrary", adapterType: "unknown-adapter", baseUrl: "https://api.x.ai/v1" },
  });
  assert.equal(arbitraryProvider.id, "openai-unknown");
});

test("xAI imagine adapter is compatible with the xai-imagine-video capability template", () => {
  const officialCompat = videoCapabilityProfileCompatibility(officialProvider, "xai-imagine-video");
  assert.equal(officialCompat.compatible, true);
  assert.doesNotThrow(() =>
    assertConfiguredVideoCapabilityProfileCompatibility(officialProvider, "grok-imagine-video-1.5"),
  );

  const relayCompat = videoCapabilityProfileCompatibility(relayProvider, "xai-imagine-video");
  assert.equal(relayCompat.compatible, true);
  assert.doesNotThrow(() =>
    assertConfiguredVideoCapabilityProfileCompatibility(relayProvider, "grok-imagine-video"),
  );
  assert.doesNotThrow(() =>
    assertConfiguredVideoCapabilityProfileCompatibility(
      {
        ...relayProvider,
        videoCapabilityProfiles: { "grok-imagine-video": "xai-imagine-video" },
      },
      "grok-imagine-video",
    ),
  );

  const dashscopeOnXai = videoCapabilityProfileCompatibility(
    { id: "preset-dashscope", adapterType: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    "xai-imagine-video",
  );
  assert.equal(dashscopeOnXai.compatible, false);
});

test("xAI story placeholders submit through the native xai-imagine adapter", () => {
  assert.equal(
    nativeVideoSubmissionAdapterType(officialProvider, "grok-imagine-video-1.5"),
    "xai-imagine",
  );
  assert.equal(
    nativeVideoSubmissionAdapterType(relayProvider, "grok-imagine-video"),
    "xai-imagine",
  );
  assert.equal(
    nativeVideoSubmissionAdapterType(
      { id: "preset-xai", adapterType: "xai-imagine", baseUrl: "https://api.x.ai/v1" },
      "grok-imagine-video-9.9",
    ),
    "",
  );
  assert.equal(
    nativeVideoSubmissionAdapterType(
      { id: "preset-openai", adapterType: "openai", baseUrl: "https://relay.example.test/v1" },
      "grok-imagine-video-1.5",
    ),
    "",
  );
});

test("runtime .mjs xAI contract matches official vs relay overlays", async () => {
  const runtime = await import("./video-model-capabilities.mjs");
  const official = runtime.resolveVideoModelCapability({
    model: "grok-imagine-video-1.5",
    provider: officialProvider,
  });
  assert.equal(official.supportsFirstLastFrame, false);
  assert.deepEqual(official.referenceImagePolicy, { supported: true, min: 1, max: 7 });
  assert.deepEqual(official.supportedOperations, ["text-to-video", "image-to-video", "reference-to-video"]);
  assert.equal(runtime.nativeVideoSubmissionAdapterType(officialProvider, "grok-imagine-video-1.5"), "xai-imagine");

  const relay = runtime.resolveVideoModelCapability({
    model: "grok-imagine-video-1.5",
    provider: relayProvider,
  });
  assert.equal(relay.supportsFirstLastFrame, true);
  assert.equal(relay.referenceImagePolicy.supported ? relay.referenceImagePolicy.max : undefined, 5);
  assert.ok(relay.supportedOperations?.includes("first-last-frame-to-video"));

  const unknown = runtime.resolveVideoModelCapability({
    model: "grok-imagine-video-9.9",
    provider: { id: "preset-xai", adapterType: "xai-imagine", baseUrl: "https://api.x.ai/v1" },
  });
  assert.equal(unknown.id, "openai-unknown");
  assert.equal(
    runtime.videoCapabilityProfileCompatibility(relayProvider, "xai-imagine-video").compatible,
    true,
  );
  assert.doesNotThrow(() =>
    runtime.assertConfiguredVideoCapabilityProfileCompatibility(relayProvider, "grok-imagine-video"),
  );
});
