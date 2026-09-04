import assert from "node:assert/strict";
import test from "node:test";

import { chooseVideoReferenceImageUrl } from "./video-reference-image-url-policy.ts";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("xAI video references keep inline data URIs without an image host", () => {
  const choice = chooseVideoReferenceImageUrl({
    capability: { id: "xai-imagine-video" },
    directUrl: PNG_DATA_URL,
  });
  assert.deepEqual(choice, { kind: "inline", url: PNG_DATA_URL });
});

test("non-xAI video references still require an image host for local images", () => {
  const choice = chooseVideoReferenceImageUrl({
    capability: { id: "ark-seedance-2" },
    directUrl: PNG_DATA_URL,
  });
  assert.deepEqual(choice, { kind: "host" });
});

test("http(s) reference URLs stay as-is for every video capability", () => {
  const publicUrl = "https://cdn.example.com/shot.png";
  assert.deepEqual(
    chooseVideoReferenceImageUrl({ capability: { id: "xai-imagine-video" }, directUrl: publicUrl }),
    { kind: "reuse", url: publicUrl },
  );
  assert.deepEqual(
    chooseVideoReferenceImageUrl({ capability: { id: "ark-seedance-2" }, directUrl: publicUrl }),
    { kind: "reuse", url: publicUrl },
  );
});
