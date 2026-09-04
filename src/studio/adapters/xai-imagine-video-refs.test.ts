import assert from "node:assert/strict";
import test from "node:test";
import { resolveXaiImagineVideoImageFields } from "./xai-imagine-video-refs.ts";

test("one still frame stays image-to-video", () => {
  const fields = resolveXaiImagineVideoImageFields({
    imageUrl: "https://example.test/shot-1.png",
    official: true,
  });
  assert.equal(fields.mode, "image-to-video");
  assert.deepEqual(fields.image, { url: "https://example.test/shot-1.png" });
  assert.deepEqual(fields.image_urls, []);
});

test("two or more stills use official R2V and drop the first-frame field", () => {
  const fields = resolveXaiImagineVideoImageFields({
    imageUrl: "https://example.test/shot-1.png",
    imageUrls: ["https://example.test/shot-2.png", "https://example.test/shot-3.png"],
    official: true,
  });
  assert.equal(fields.mode, "reference-to-video");
  assert.equal(fields.image, undefined);
  assert.deepEqual(fields.image_urls, [
    "https://example.test/shot-1.png",
    "https://example.test/shot-2.png",
    "https://example.test/shot-3.png",
  ]);
});

test("R2V keeps at most 7 official reference images", () => {
  const urls = Array.from({ length: 9 }, (_, index) => `https://example.test/${index}.png`);
  const fields = resolveXaiImagineVideoImageFields({ imageUrls: urls, official: true });
  assert.equal(fields.image_urls.length, 7);
});

test("official xAI rejects a last-frame field", () => {
  assert.throws(
    () =>
      resolveXaiImagineVideoImageFields({
        imageUrl: "https://example.test/a.png",
        lastFrameUrl: "https://example.test/b.png",
        official: true,
      }),
    /没有静帧尾帧/,
  );
});
