import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocalVideoResultDownload } from "./video-result-url.ts";

test("grok2api relative video content URLs download through the local relay proxy", () => {
  assert.deepEqual(resolveLocalVideoResultDownload("/v1/videos/abc/content"), {
    kind: "relay",
    path: "/videos/abc/content",
  });
  assert.deepEqual(resolveLocalVideoResultDownload("/v1/media/videos/asset-1"), {
    kind: "relay",
    path: "/media/videos/asset-1",
  });
  assert.deepEqual(resolveLocalVideoResultDownload("/videos/abc/content"), {
    kind: "relay",
    path: "/videos/abc/content",
  });
});

test("grok2api absolute video content URLs still use the local relay, not fetch-url", () => {
  assert.deepEqual(
    resolveLocalVideoResultDownload("https://grok.example.test/v1/videos/abc/content"),
    { kind: "relay", path: "/videos/abc/content" },
  );
  assert.deepEqual(
    resolveLocalVideoResultDownload("https://grok.example.test/v1/media/videos/asset-1"),
    { kind: "relay", path: "/media/videos/asset-1" },
  );
});

test("absolute public video URLs still go through fetch-url", () => {
  assert.deepEqual(resolveLocalVideoResultDownload("https://cdn.example.com/out.mp4"), {
    kind: "fetch-url",
    url: "https://cdn.example.com/out.mp4",
  });
});

test("empty or opaque video URLs are invalid", () => {
  assert.deepEqual(resolveLocalVideoResultDownload(""), { kind: "invalid" });
  assert.deepEqual(resolveLocalVideoResultDownload("blob:abc"), { kind: "invalid" });
});
