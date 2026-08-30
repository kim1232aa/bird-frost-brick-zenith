import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveVideoModelCapability,
  validateVideoGenerationParameters,
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
