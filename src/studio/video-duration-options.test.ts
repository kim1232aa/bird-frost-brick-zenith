import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  isOpenAiOfficial,
  videoDurationOptions,
  normalizeVideoDuration,
  OPENAI_OFFICIAL_DURATION_OPTIONS,
  GENERIC_DURATION_OPTIONS,
} from "./video-duration-options.ts";

test("isOpenAiOfficial detects api.openai.com host", () => {
  assert.equal(isOpenAiOfficial("https://api.openai.com/v1"), true);
  assert.equal(isOpenAiOfficial("https://api.openai.com"), true);
  assert.equal(isOpenAiOfficial("https://relay.example.com/v1"), false);
  assert.equal(isOpenAiOfficial("https://superxihe.com/v1"), false);
  assert.equal(isOpenAiOfficial(""), false);
});

test("isOpenAiOfficial detects openai-official protocol", () => {
  assert.equal(isOpenAiOfficial("https://relay.example.com/v1", "openai-official"), true);
  assert.equal(isOpenAiOfficial("https://api.openai.com/v1", "openai-official"), true);
  assert.equal(isOpenAiOfficial("https://relay.example.com/v1", "openai-compat"), false);
});

test("videoDurationOptions returns [4,8,12] for OpenAI official", () => {
  const opts = videoDurationOptions("https://api.openai.com/v1");
  assert.deepEqual([...opts], [4, 8, 12]);
  assert.ok(opts === OPENAI_OFFICIAL_DURATION_OPTIONS);
});

test("videoDurationOptions returns [4,5,6,8,10] for other providers", () => {
  const opts = videoDurationOptions("https://relay.example.com/v1");
  assert.deepEqual([...opts], [4, 5, 6, 8, 10]);
  assert.ok(opts === GENERIC_DURATION_OPTIONS);
});

test("videoDurationOptions returns 1-15 for official xAI without dropping generic chips", () => {
  const opts = videoDurationOptions("https://api.x.ai/v1");
  assert.deepEqual([...opts], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  for (const chip of GENERIC_DURATION_OPTIONS) assert.ok(opts.includes(chip));
});

test("normalizeVideoDuration keeps valid OpenAI official durations", () => {
  assert.equal(normalizeVideoDuration(4, "https://api.openai.com/v1"), 4);
  assert.equal(normalizeVideoDuration(8, "https://api.openai.com/v1"), 8);
  assert.equal(normalizeVideoDuration(12, "https://api.openai.com/v1"), 12);
});

test("normalizeVideoDuration rejects invalid OpenAI official values instead of snapping", () => {
  for (const duration of [5, 6, 7, 10, 11, 15]) {
    assert.throws(
      () => normalizeVideoDuration(duration, "https://api.openai.com/v1"),
      /4 \/ 8 \/ 12|非法|只接受/,
    );
  }
});

test("normalizeVideoDuration keeps all generic provider durations", () => {
  const host = "https://relay.example.com/v1";
  assert.equal(normalizeVideoDuration(4, host), 4);
  assert.equal(normalizeVideoDuration(5, host), 5);
  assert.equal(normalizeVideoDuration(6, host), 6);
  assert.equal(normalizeVideoDuration(8, host), 8);
  assert.equal(normalizeVideoDuration(10, host), 10);
});

test("normalizeVideoDuration snaps invalid generic duration to closest", () => {
  const host = "https://relay.example.com/v1";
  assert.equal(normalizeVideoDuration(3, host), 4);
  assert.equal(normalizeVideoDuration(7, host), 6);
  assert.equal(normalizeVideoDuration(9, host), 8);
  assert.equal(normalizeVideoDuration(11, host), 10);
  assert.equal(normalizeVideoDuration(15, host), 10);
});

test("normalizeVideoDuration rejects out-of-range official xAI values instead of snapping", () => {
  for (const duration of [0, 16, 99]) {
    assert.throws(
      () => normalizeVideoDuration(duration, "https://api.x.ai/v1"),
      /xAI 官方视频.*1.?15|只接受|不会静默/,
    );
  }
});
