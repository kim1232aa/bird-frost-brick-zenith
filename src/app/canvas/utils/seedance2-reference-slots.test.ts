import assert from "node:assert/strict";
import test from "node:test";
import { resolveSeedance2ReferenceSlots } from "./seedance2-reference-slots.mjs";

test("current-shot preview resolves a durable storage key instead of stale blob content", () => {
  const storageKey = "image:current-shot-1";
  const staleBlobUrl = "blob:https://example.test/stale-current-shot";
  const currentShot = {
    id: "current-shot-1",
    type: "image",
    title: "第1镜分镜图",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: {
      content: staleBlobUrl,
      storageKey,
      backendUrl: "/works/current-shot-1.png",
    },
  };
  const placeholder = {
    id: "video-placeholder-1",
    type: "video",
    title: "第1镜视频占位框",
    position: { x: 400, y: 0 },
    width: 320,
    height: 180,
    metadata: {
      seedanceStorySourceImageNodeId: currentShot.id,
    },
  };

  const [slot] = resolveSeedance2ReferenceSlots({
    placeholder,
    nodes: [currentShot, placeholder],
    connections: [
      { id: "current-shot-connection-1", fromNodeId: currentShot.id, toNodeId: placeholder.id },
    ],
    visibleSlotCount: 1,
    visibleSlotPurposes: undefined,
    automaticConnectionPurpose: undefined,
  });

  assert.equal(slot.role, "current_shot");
  assert.equal(slot.previewValue, storageKey);
  assert.equal(slot.previewValue.startsWith("blob:"), false);
});
