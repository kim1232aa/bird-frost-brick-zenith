import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeedance2ResultMetadata,
  createSeedance2VideoPlaceholderMetadata,
  resolveSeedance2WorkflowRatio,
  submittedSeedance2ResultRatio,
} from "./seedance2-workflow.mjs";

test("Grok 16:9 wire format wins over a leftover 9:16 placeholder layout ratio", () => {
  const placeholder = {
    id: "ph-1",
    type: "video",
    title: "第1镜",
    position: { x: 0, y: 0 },
    width: 420,
    height: 746,
    metadata: {
      seedanceRatio: "9:16",
      size: "9:16",
      videoWireFormat: { mode: "request", aspectRatio: "16:9" },
      videoGenerationSettings: { aspectRatio: "16:9" },
    },
  };
  assert.equal(
    submittedSeedance2ResultRatio({
      paramsSnapshot: {
        ratio: "9:16",
        aspectRatio: "16:9",
        wireFormat: { aspectRatio: "16:9" },
      },
      sourcePlaceholder: placeholder,
    }),
    "16:9",
  );
  assert.equal(
    createSeedance2ResultMetadata({
      sourcePlaceholder: placeholder,
      version: 1,
      url: "https://example.test/out.mp4",
      paramsSnapshot: {
        ratio: "9:16",
        aspectRatio: "16:9",
        wireFormat: { aspectRatio: "16:9" },
      },
    }).seedanceRatio,
    "16:9",
  );
});

test("a leftover 9:16 placeholder layout does not label a Grok 16:9 submission", () => {
  assert.equal(
    submittedSeedance2ResultRatio({
      paramsSnapshot: {},
      sourcePlaceholder: {
        id: "ph-2",
        metadata: { seedanceRatio: "9:16", size: "9:16", videoLayoutRatio: "9:16" },
      },
    }),
    "16:9",
  );
});

test("story director 16:9 upstream beats the Seedance-era 9:16 workflow default", () => {
  assert.equal(
    resolveSeedance2WorkflowRatio({
      storedRatio: "9:16",
      selection: "upstream",
      upstreamRatio: "16:9",
    }),
    "16:9",
  );
  assert.equal(
    resolveSeedance2WorkflowRatio({
      storedRatio: undefined,
      selection: "upstream",
      upstreamRatio: undefined,
    }),
    "16:9",
  );
});

test("standalone video metadata pins the visible provider and model together", () => {
  const metadata = createSeedance2VideoPlaceholderMetadata({
    model: "grok-imagine-video",
    modelProviderId: "preset-grok-relay",
    duration: "6",
  });

  assert.equal(metadata.model, "grok-imagine-video");
  assert.equal(metadata.seedanceModel, "grok-imagine-video");
  assert.equal(metadata.modelProviderId, "preset-grok-relay");
});
