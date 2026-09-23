import assert from "node:assert/strict";
import test from "node:test";
import type { StoryVideoRequestWindow } from "./seedance2-story-integration.ts";
import { packStoryVideoRequestWindows } from "./seedance2-story-integration.mjs";

const grokCurrentShotPolicy = {
  intentPolicy: "frames-or-reference-set",
  storyAutoReferencePolicy: "current-shot",
  supportsFirstFrame: true,
  supportsFirstLastFrame: false,
  supportsKeyframeSequence: false,
  referenceImagePolicy: { supported: true, min: 1, max: 5 },
};

test("Grok smart packing merges five storyboard images into one reference window", () => {
  const shots = [1, 2, 3, 4, 5].map((index) => ({
    id: `shot-${index}`,
    index,
    title: `镜${index}`,
  }));
  const images = shots.map((shot) => ({ id: `img-${shot.index}`, type: "image" }));
  const windows = packStoryVideoRequestWindows({
    shots,
    images,
    policy: grokCurrentShotPolicy,
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].operation, "reference-to-video");
  assert.equal(windows[0].images.length, 5);
  assert.equal(windows[0].shots.length, 5);
  assert.equal(windows[0].shotIndex, 1);
  assert.deepEqual(windows[0].images.map((image: { id: string }) => image.id), [
    "img-1",
    "img-2",
    "img-3",
    "img-4",
    "img-5",
  ]);
});

test("Grok current-shot honors explicit per-shot packing and text-to-video operation", () => {
  const shots = [1, 2, 3, 4, 5].map((index) => ({
    id: `shot-${index}`,
    index,
    title: `镜${index}`,
  }));
  const images = shots.map((shot) => ({ id: `img-${shot.index}`, type: "image" }));
  const perShotWindows = packStoryVideoRequestWindows({
    shots,
    images,
    operation: "reference-to-video",
    packMode: "per_shot",
    policy: grokCurrentShotPolicy,
  });
  assert.equal(perShotWindows.length, 5);
  perShotWindows.forEach((window: StoryVideoRequestWindow, offset: number) => {
    assert.equal(window.operation, "reference-to-video");
    assert.equal(window.images.length, 1);
    assert.equal(window.shots.length, 1);
    assert.equal(window.shotIndex, offset + 1);
    assert.equal(window.images[0].id, `img-${offset + 1}`);
  });

  const textToVideoWindows = packStoryVideoRequestWindows({
    shots,
    images,
    operation: "text-to-video",
    policy: grokCurrentShotPolicy,
  });
  assert.equal(textToVideoWindows.length, 5);
  textToVideoWindows.forEach((window: StoryVideoRequestWindow, offset: number) => {
    assert.equal(window.operation, "text-to-video");
    assert.equal(window.images.length, 0);
    assert.equal(window.shots.length, 1);
    assert.equal(window.shotIndex, offset + 1);
  });
});

test("Grok smart packing auto-selects R2V for a three-shot storyboard", () => {
  const shots = [1, 2, 3].map((index) => ({
    id: `shot-${index}`,
    index,
    title: `镜${index}`,
  }));
  const images = shots.map((shot) => ({ id: `img-${shot.index}`, type: "image" }));
  const windows = packStoryVideoRequestWindows({
    shots,
    images,
    policy: grokCurrentShotPolicy,
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].operation, "reference-to-video");
  assert.equal(windows[0].images.length, 3);
  assert.equal(windows[0].shots.length, 3);
});
