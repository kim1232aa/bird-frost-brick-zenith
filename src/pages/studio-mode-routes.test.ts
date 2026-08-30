import assert from "node:assert/strict";
import test from "node:test";
import {
  imageStudioModeFromQuery,
  imageStudioModeLocation,
  imageStudioSearchMode,
  videoI2vSearchMode,
  videoStudioModeFromQuery,
  videoStudioModeLocation,
} from "./studio-mode-routes.ts";

test("image goMode keeps i2i on /image?mode=i2i and t2i on /image?mode=t2i", () => {
  assert.deepEqual(imageStudioModeLocation("i2i"), { to: "/image", search: { mode: "i2i" } });
  assert.deepEqual(imageStudioModeLocation("t2i"), { to: "/image", search: { mode: "t2i" } });
  assert.deepEqual(imageStudioModeLocation("edit"), { to: "/edit" });
});

test("image page query mode is retained, unknown falls back", () => {
  assert.equal(imageStudioModeFromQuery("i2i", "t2i"), "i2i");
  assert.equal(imageStudioModeFromQuery("edit", "t2i"), "edit");
  assert.equal(imageStudioModeFromQuery("", "t2i"), "t2i");
  assert.equal(imageStudioModeFromQuery("nope", "edit"), "edit");
  assert.deepEqual(imageStudioSearchMode({ mode: "i2i" }), { mode: "i2i" });
  assert.deepEqual(imageStudioSearchMode({ mode: "t2i" }), { mode: "t2i" });
  assert.deepEqual(imageStudioSearchMode({ mode: "edit" }), {});
});

test("video goMode sends flf to /i2v?mode=flf and i2v to /i2v?mode=i2v", () => {
  assert.deepEqual(videoStudioModeLocation("flf"), { to: "/i2v", search: { mode: "flf" } });
  assert.deepEqual(videoStudioModeLocation("i2v"), { to: "/i2v", search: { mode: "i2v" } });
  assert.deepEqual(videoStudioModeLocation("t2v"), { to: "/video" });
  assert.deepEqual(videoStudioModeLocation("extract"), { to: "/frames" });
});

test("video page query mode is retained on /i2v", () => {
  assert.equal(videoStudioModeFromQuery("flf", "i2v"), "flf");
  assert.equal(videoStudioModeFromQuery("i2v", "t2v"), "i2v");
  assert.equal(videoStudioModeFromQuery("", "i2v"), "i2v");
  assert.deepEqual(videoI2vSearchMode({ mode: "flf" }), { mode: "flf" });
  assert.deepEqual(videoI2vSearchMode({ mode: "i2v" }), { mode: "i2v" });
  assert.deepEqual(videoI2vSearchMode({ mode: "t2v" }), {});
});
