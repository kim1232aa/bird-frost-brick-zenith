import assert from "node:assert/strict";
import test from "node:test";
import { isCharacterAssetForbiddenForVideo } from "./character-video-guard.mjs";

test("derived four-view crops cannot enter video slots", () => {
  assert.equal(isCharacterAssetForbiddenForVideo({ id: "hero:front" }), true);
  assert.equal(isCharacterAssetForbiddenForVideo({ id: "hero:side" }), true);
  assert.equal(isCharacterAssetForbiddenForVideo({ id: "hero:back" }), true);
  assert.equal(isCharacterAssetForbiddenForVideo({ id: "hero:portrait" }), true);
});

test("parent turnaround sheet cannot enter video slots", () => {
  assert.equal(
    isCharacterAssetForbiddenForVideo({
      id: "hero-sheet",
      title: "角色四象图",
      metadata: { storyCharacterAssetKind: "turnaround_sheet" },
    }),
    true,
  );
});

test("ordinary shot frames can still occupy video slots", () => {
  assert.equal(
    isCharacterAssetForbiddenForVideo({
      id: "shot-1",
      title: "第1镜分镜图",
      metadata: { source: "story-shot" },
    }),
    false,
  );
});
