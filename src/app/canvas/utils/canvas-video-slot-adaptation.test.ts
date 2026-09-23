import test from "node:test";
import assert from "node:assert/strict";
import { adaptVideoReferencePurposeForOperation, adaptVideoReferenceListForOperation } from "./canvas-video-slot-adaptation.ts";
import { resolveVideoModelCapability } from "../../../services/api/video-model-capabilities.ts";

const grokCapability = resolveVideoModelCapability({
  model: "grok-imagine-video",
  provider: { id: "preset-grok-relay", baseUrl: "http://127.0.0.1:8000/v1", adapterType: "xai-imagine" },
});

test("adapts first_frame to reference_image when model R2V does not accept first_frame", () => {
  const ref = { id: "ref-1", label: "当前分镜图", role: "current_shot", useAs: "first_frame" };
  const adapted = adaptVideoReferencePurposeForOperation(ref, grokCapability, "reference-to-video");
  assert.equal(adapted.useAs, "reference_image");
});

test("leaves first_frame alone when model supports first_frame in R2V", () => {
  const dashscopeCapability = resolveVideoModelCapability({
    model: "wan2.7-r2v",
    provider: { id: "preset-dashscope", baseUrl: "https://dashscope.aliyuncs.com/api/v1", adapterType: "dashscope" },
  });
  const ref = { id: "ref-1", label: "当前分镜图", role: "current_shot", useAs: "first_frame" };
  const adapted = adaptVideoReferencePurposeForOperation(ref, dashscopeCapability, "reference-to-video");
  // If dashscope capability has r2v-with-first, first_frame is preserved
  if (dashscopeCapability.intentPolicy === "r2v-with-first") {
    assert.equal(adapted.useAs, "first_frame");
  }
});

test("adapts reference_image to first_frame in image-to-video", () => {
  const ref = { id: "ref-1", label: "当前分镜图", role: "current_shot", useAs: "reference_image" };
  const adapted = adaptVideoReferencePurposeForOperation(ref, grokCapability, "image-to-video");
  assert.equal(adapted.useAs, "first_frame");
});

test("batch adaptation adapts all references in a list", () => {
  const refs = [
    { id: "ref-1", label: "分镜1", role: "current_shot", useAs: "first_frame" },
    { id: "ref-2", label: "角色图", role: "character", useAs: "reference_image" },
  ];
  const adapted = adaptVideoReferenceListForOperation(refs, grokCapability, "reference-to-video");
  assert.equal(adapted[0].useAs, "reference_image");
  assert.equal(adapted[1].useAs, "reference_image");
});
