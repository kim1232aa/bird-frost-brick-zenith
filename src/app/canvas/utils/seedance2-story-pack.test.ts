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
  referenceImagePolicy: { supported: true, min: 1, max: 7 },
};

test("Grok current-shot R2V keeps one window per storyboard image", () => {
  const shots = [1, 2, 3, 4, 5].map((index) => ({
    id: `shot-${index}`,
    index,
    title: `镜${index}`,
  }));
  const images = shots.map((shot) => ({ id: `img-${shot.index}`, type: "image" }));
  const windows = packStoryVideoRequestWindows({
    shots,
    images,
    operation: "reference-to-video",
    policy: grokCurrentShotPolicy,
  });
  assert.equal(windows.length, 5);
  windows.forEach((window: StoryVideoRequestWindow, offset: number) => {
    assert.equal(window.operation, "reference-to-video");
    assert.equal(window.images.length, 1);
    assert.equal(window.shots.length, 1);
    assert.equal(window.shotIndex, offset + 1);
    assert.equal(window.images[0].id, `img-${offset + 1}`);
  });
});

test("Grok current-shot honors an explicit text-to-video operation", () => {
  const shots = [1, 2, 3, 4, 5].map((index) => ({
    id: `shot-${index}`,
    index,
    title: `镜${index}`,
  }));
  const images = shots.map((shot) => ({ id: `img-${shot.index}`, type: "image" }));
  const windows = packStoryVideoRequestWindows({
    shots,
    images,
    operation: "text-to-video",
    policy: grokCurrentShotPolicy,
  });
  assert.equal(windows.length, 5);
  windows.forEach((window: StoryVideoRequestWindow, offset: number) => {
    assert.equal(window.operation, "text-to-video");
    assert.equal(window.images.length, 0);
    assert.equal(window.shots.length, 1);
    assert.equal(window.shotIndex, offset + 1);
  });
});

test("Grok current-shot auto-selects R2V when its reference capacity is multi-image", () => {
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
  assert.equal(windows.length, 3);
  windows.forEach((window: StoryVideoRequestWindow) => {
    assert.equal(window.operation, "reference-to-video");
    assert.equal(window.images.length, 1);
    assert.equal(window.shots.length, 1);
  });
});
