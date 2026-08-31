import assert from "node:assert/strict";
import test from "node:test";
import { MAX_IMAGE_REFS, collectImageRefs, imageRefs, mergeImageRefs } from "./image-refs.ts";

const many = Array.from({ length: 20 }, (_, index) => `data:image/png;base64,ref${index}`);

test("imageRefs never silently caps references", () => {
  const input = { imageUrls: many };
  assert.equal(MAX_IMAGE_REFS, 16);
  assert.equal(imageRefs(input).length, 20);
  assert.throws(() => imageRefs(input, 16), /最多 16 张/);
  assert.throws(() => imageRefs(input, 10), /最多 10 张/);
});

test("collectImageRefs throws instead of silently dropping extras", () => {
  assert.equal(collectImageRefs({ imageUrls: many }).length, 20);
  assert.throws(() => collectImageRefs({ imageUrls: many }, 3), /最多 3 张/);
  assert.throws(() => collectImageRefs({ imageUrls: many }, 16), /最多 16 张/);
  assert.equal(collectImageRefs({ imageUrls: many.slice(0, 16) }, 16).length, 16);
});

test("mergeImageRefs preserves order and rejects an explicit cap", () => {
  assert.deepEqual(mergeImageRefs(["a"], ["b"], 2), ["a", "b"]);
  assert.throws(() => mergeImageRefs(["a"], ["b", "c"], 2), /最多 2 张/);
  assert.deepEqual(mergeImageRefs(["a"], ["a", "b"]), ["a", "b"]);
});

test("dedupe keeps order and merges imageUrl with imageUrls", () => {
  const input = {
    imageUrl: "https://example.test/a.png",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
  };
  assert.deepEqual(collectImageRefs(input), ["https://example.test/a.png", "https://example.test/b.png"]);
});
