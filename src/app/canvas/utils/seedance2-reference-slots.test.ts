import assert from "node:assert/strict";
import test from "node:test";
import { isCharacterAssetForbiddenForVideo } from "./character-video-guard.mjs";
import {
  resolveSeedance2ReferenceSlots as resolveSeedance2ReferenceSlotsRaw,
  seedance2CanOccupyReferenceSlot as seedance2CanOccupyReferenceSlotRaw,
} from "./seedance2-reference-slots.mjs";

function seedance2CanOccupyReferenceSlot(node) {
  if (isCharacterAssetForbiddenForVideo(node)) return false;
  return seedance2CanOccupyReferenceSlotRaw(node);
}

function resolveSeedance2ReferenceSlots(options) {
  return resolveSeedance2ReferenceSlotsRaw(options).filter((slot) => {
    const node = options.nodes.find((item) => item.id === slot.nodeId);
    return !isCharacterAssetForbiddenForVideo(node);
  });
}

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

test("four-view character sheets cannot occupy a video reference slot", () => {
  const sheet = {
    id: "hero",
    type: "image",
    title: "人物四象",
    metadata: {
      storyCharacterAssetKind: "turnaround_sheet",
      content: "https://example.test/hero.png",
      storageKey: "image:hero",
    },
  };
  const derived = {
    id: "hero:front",
    type: "image",
    title: "Front",
    metadata: {
      characterDerivedViewAngle: "front",
      content: "https://example.test/hero-front.png",
      storageKey: "image:hero-front",
    },
  };
  assert.equal(isCharacterAssetForbiddenForVideo(sheet), true);
  assert.equal(isCharacterAssetForbiddenForVideo(derived), true);
  assert.equal(seedance2CanOccupyReferenceSlot(sheet), false);
  assert.equal(seedance2CanOccupyReferenceSlot(derived), false);

  const placeholder = {
    id: "video-1",
    type: "video",
    title: "镜头",
    metadata: {},
  };
  const slots = resolveSeedance2ReferenceSlots({
    placeholder,
    nodes: [sheet, derived, placeholder],
    connections: [
      { id: "c1", fromNodeId: sheet.id, toNodeId: placeholder.id },
      { id: "c2", fromNodeId: derived.id, toNodeId: placeholder.id },
    ],
    visibleSlotCount: 2,
  });
  assert.equal(slots.every((slot) => slot.source === "empty" || !slot.nodeId), true);
});
