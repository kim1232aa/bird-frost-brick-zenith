import assert from "node:assert/strict";
import test from "node:test";
import { canvasVideoModelLabel, canvasVideoDurationLabel, canvasVideoAspectRatioLabel } from "./canvas-video-result-display.ts";

test("unknown result duration is labeled as missing, not as an unverified provider", () => {
  assert.equal(canvasVideoDurationLabel({}), "时长未记录");
  assert.equal(canvasVideoDurationLabel({ seconds: "" }), "时长未记录");
  assert.equal(canvasVideoDurationLabel({ seconds: "5" }), "5s");
});

test("result model label preserves provider identity when it is available", () => {
  assert.equal(canvasVideoModelLabel({ model: "ltx2.3" }), "模型 ltx2.3");
  assert.equal(canvasVideoModelLabel({ model: "ltx2.3", modelProviderId: "preset-civitai" }), "preset-civitai · ltx2.3");
  assert.equal(canvasVideoModelLabel({}), "来源未记录");
});

test("result aspect ratio reflects the loaded media dimensions", () => {
  assert.equal(canvasVideoAspectRatioLabel(1280, 704), "1.82:1");
  assert.equal(canvasVideoAspectRatioLabel(1920, 1080), "16:9");
  assert.equal(canvasVideoAspectRatioLabel(0, 1080), "");
});
