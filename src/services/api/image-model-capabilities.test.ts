import assert from "node:assert/strict";
import test from "node:test";
import {
  planImageOutputRequests,
  resolveImageModelCapability,
  validateImageModelRequest,
  type ImageOutputCountCapability,
  type ImageReferenceCountCapability,
  type ImageSizeCapability,
} from "./image-model-capabilities.ts";

function supportedOutput(capability: ImageOutputCountCapability) {
  assert.equal(capability.state, "supported");
  if (capability.state !== "supported") throw new Error("expected supported output count");
  return capability;
}

function supportedRefs(capability: ImageReferenceCountCapability) {
  assert.equal(capability.state, "supported");
  if (capability.state !== "supported") throw new Error("expected supported reference count");
  return capability;
}

function supportedSize(capability: ImageSizeCapability) {
  assert.equal(capability.state, "supported");
  if (capability.state !== "supported") throw new Error("expected supported size");
  return capability;
}

const officialOpenAI = {
  adapterType: "openai-compat",
  baseUrl: "https://api.openai.com/v1",
  name: "OpenAI 官方",
};

const grokOfficial = {
  adapterType: "xai-imagine",
  baseUrl: "https://api.x.ai/v1",
  name: "xAI 官方",
};

test("GPT Image 2 generate exposes official n 1-10, not a 3-image cap", () => {
  const capability = resolveImageModelCapability({
    model: "gpt-image-2",
    operation: "generate",
    provider: officialOpenAI,
  });

  assert.equal(capability.id, "openai-gpt-image-2-generate");
  const output = supportedOutput(capability.outputCount);
  assert.equal(output.min, 1);
  assert.equal(output.max, 10);
  assert.equal(output.transport, "native-batch");

  const ten = validateImageModelRequest(capability, { operation: "generate", outputCount: 10 });
  assert.equal(ten.ok, true);
  assert.equal(ten.errors.length, 0);

  const eleven = validateImageModelRequest(capability, { operation: "generate", outputCount: 11 });
  assert.equal(eleven.ok, false);
  assert.ok(eleven.errors.some((issue) => issue.code === "output_count_too_high" && issue.message.includes("10")));

  const plan = planImageOutputRequests(capability, 10);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.batches, [{ providerOutputCount: 10, repeat: 1 }]);
});

test("GPT Image 2 edit accepts official n 1-10 and up to 16 reference images", () => {
  const capability = resolveImageModelCapability({
    model: "gpt-image-2",
    operation: "edit",
    provider: officialOpenAI,
  });

  assert.equal(capability.id, "openai-gpt-image-2-edit");
  assert.equal(supportedOutput(capability.outputCount).max, 10);
  const refs = supportedRefs(capability.referenceCount);
  assert.equal(refs.min, 1);
  assert.equal(refs.max, 16);
  assert.equal(capability.mask.state, "supported");

  const sixteen = validateImageModelRequest(capability, {
    operation: "edit",
    outputCount: 10,
    referenceCount: 16,
  });
  assert.equal(sixteen.ok, true);

  const seventeen = validateImageModelRequest(capability, {
    operation: "edit",
    outputCount: 1,
    referenceCount: 17,
  });
  assert.equal(seventeen.ok, false);
  assert.ok(seventeen.errors.some((issue) => issue.code === "reference_count_too_high" && issue.message.includes("16")));
});

test("GPT Image 2 snapshot and chatgpt-image-latest resolve to the GPT Image 2 contract", () => {
  for (const model of ["gpt-image-2-2026-04-21", "chatgpt-image-latest"]) {
    const generate = resolveImageModelCapability({ model, operation: "generate", provider: officialOpenAI });
    const edit = resolveImageModelCapability({ model, operation: "edit", provider: officialOpenAI });
    assert.equal(generate.id, "openai-gpt-image-2-generate", model);
    assert.equal(edit.id, "openai-gpt-image-2-edit", model);
    assert.equal(supportedOutput(generate.outputCount).max, 10, model);
    assert.equal(supportedRefs(edit.referenceCount).max, 16, model);
  }
});

test("relay-only gpt-image-2 variants stay off the official OpenAI host", () => {
  const official = resolveImageModelCapability({
    model: "gpt-image-2-high",
    operation: "generate",
    provider: officialOpenAI,
  });
  assert.equal(official.id, "unknown-native-model");

  const relay = resolveImageModelCapability({
    model: "gpt-image-2-high",
    operation: "generate",
    provider: { adapterType: "openai-compat", baseUrl: "https://relay.example.test/v1", name: "relay" },
  });
  assert.equal(relay.id, "openai-gpt-image-2-generate");
  assert.equal(supportedOutput(relay.outputCount).max, 10);
});

test("GPT Image 1.5 keeps the legacy size enum and n 1-10", () => {
  const capability = resolveImageModelCapability({
    model: "gpt-image-1.5",
    operation: "generate",
    provider: officialOpenAI,
  });
  assert.equal(capability.id, "openai-gpt-image-legacy-generate");
  assert.equal(supportedOutput(capability.outputCount).max, 10);
  const size = supportedSize(capability.size);
  assert.equal(size.kind, "enum");
  assert.deepEqual(size.values, ["auto", "1024x1024", "1536x1024", "1024x1536"]);
});

test("xAI Imagine 2.0 generate documents n 1-10 plus aspect_ratio, resolution, and quality", () => {
  const capability = resolveImageModelCapability({
    model: "grok-imagine-image-2.0",
    operation: "generate",
    provider: grokOfficial,
  });

  assert.equal(supportedOutput(capability.outputCount).max, 10);
  const size = supportedSize(capability.size);
  assert.equal(size.kind, "tier-and-ratio");
  assert.deepEqual([...size.tiers], ["1k", "2k"]);
  assert.ok(size.ratios.includes("16:9"));
  assert.ok(size.ratios.includes("auto"));
  assert.equal(capability.quality.state, "supported");
  if (capability.quality.state !== "supported") throw new Error("expected supported quality");
  assert.deepEqual([...capability.quality.values], ["low", "medium"]);
  assert.equal(capability.serialization.sizeField, "aspectRatio+resolution");
  assert.equal(capability.serialization.qualityField, "quality");
  assert.equal(capability.id, "xai-grok-imagine-2-generate");

  const ok = validateImageModelRequest(capability, {
    operation: "generate",
    outputCount: 10,
    aspectRatio: "16:9",
    size: "2k",
    quality: "low",
  });
  assert.equal(ok.ok, true);

  const pixelSize = validateImageModelRequest(capability, {
    operation: "generate",
    outputCount: 1,
    size: "1024x1024",
  });
  assert.equal(pixelSize.ok, false);
  assert.ok(pixelSize.errors.some((issue) => issue.field === "size"));
});

test("generic xAI profile mapping still specializes Imagine 2.0 to official fields", () => {
  const capability = resolveImageModelCapability({
    model: "grok-imagine-image-2.0",
    operation: "generate",
    provider: {
      ...grokOfficial,
      imageCapabilityProfiles: {
        "grok-imagine-image-2.0": { generate: "xai-grok-image-generate", edit: "xai-grok-imagine-edit" },
      },
    },
  });
  assert.equal(capability.id, "xai-grok-imagine-2-generate");
  assert.equal(capability.size.state, "supported");
  assert.equal(capability.quality.state, "supported");
});

test("legacy grok-imagine-image generate supports size (1k/2k per live model catalog) but not 2.0-only quality", () => {
  const capability = resolveImageModelCapability({
    model: "grok-imagine-image",
    operation: "generate",
    provider: grokOfficial,
  });
  assert.equal(capability.id, "xai-grok-image-generate");
  assert.equal(supportedOutput(capability.outputCount).max, 10);
  // 官方模型目录为 grok-imagine-image（1.0）列出 1K/2K 两档 resolutionPricing；
  // supportedQualities 只在 2.0 上出现。
  assert.equal(capability.size.state, "supported");
  assert.equal(capability.quality.state, "unsupported");
});

test("unsupported enum fields reject explicit values instead of being silently dropped", () => {
  const legacy = resolveImageModelCapability({
    model: "grok-imagine-image",
    operation: "generate",
    provider: grokOfficial,
  });
  const result = validateImageModelRequest(legacy, {
    operation: "generate",
    outputCount: 1,
    quality: "high",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "field_unsupported" && issue.field === "quality"));
});

test("xAI Imagine edit keeps the official 3-reference cap and does not apply it to GPT Image", () => {
  const grokEdit = resolveImageModelCapability({
    model: "grok-imagine-image-2.0",
    operation: "edit",
    provider: grokOfficial,
  });
  assert.equal(supportedRefs(grokEdit.referenceCount).max, 3);
  assert.equal(grokEdit.outputCount.state, "supported");

  const gptEdit = resolveImageModelCapability({
    model: "gpt-image-2",
    operation: "edit",
    provider: officialOpenAI,
  });
  assert.equal(supportedRefs(gptEdit.referenceCount).max, 16);
  assert.notEqual(supportedRefs(gptEdit.referenceCount).max, supportedRefs(grokEdit.referenceCount).max);
});
