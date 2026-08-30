import { register } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const { buildXaiImagineImageBody } = await import("./xai-imagine.ts");

test("xAI Imagine 2.0 text-to-image maps size, aspect ratio, and quality", () => {
  const body = buildXaiImagineImageBody({
    model: "grok-imagine-image-2.0",
    prompt: "p",
    n: 2,
    size: "2K",
    aspectRatio: "16:9",
    quality: "low",
  });

  assert.deepEqual(body, {
    model: "grok-imagine-image-2.0",
    prompt: "p",
    n: 2,
    aspect_ratio: "16:9",
    resolution: "2k",
    quality: "low",
  });
});

test("xAI Imagine non-2.0 image models omit unsupported advanced fields", () => {
  const body = buildXaiImagineImageBody({
    model: "grok-imagine-image",
    prompt: "p",
    size: "2K",
    aspectRatio: "16:9",
    quality: "low",
  });

  assert.equal("resolution" in body, false);
  assert.equal("aspect_ratio" in body, false);
  assert.equal("quality" in body, false);
});

test("xAI Imagine single-image edits use the documented image object only", () => {
  const body = buildXaiImagineImageBody({
    model: "grok-imagine-image-2.0",
    prompt: "p",
    operation: "edit",
    imageUrl: "https://example.test/source.png",
    size: "2K",
    aspectRatio: "16:9",
    quality: "low",
  });

  assert.deepEqual(body.image, {
    type: "image_url",
    url: "https://example.test/source.png",
  });
  assert.equal("images" in body, false);
  assert.equal("aspect_ratio" in body, false);
  assert.equal("resolution" in body, false);
  assert.equal("quality" in body, false);
});

test("xAI Imagine multi-image edits send up to three documented images and aspect_ratio", () => {
  const body = buildXaiImagineImageBody({
    model: "grok-imagine-image-2.0",
    prompt: "p",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
    aspectRatio: "3:2",
    size: "2K",
    quality: "medium",
  });

  assert.deepEqual(body.images, [
    { type: "image_url", url: "https://example.test/a.png" },
    { type: "image_url", url: "https://example.test/b.png" },
  ]);
  assert.equal("image" in body, false);
  assert.equal(body.aspect_ratio, "3:2");
  assert.equal("resolution" in body, false);
  assert.equal("quality" in body, false);
});

test("xAI Imagine rejects more than three references and edit without a reference", () => {
  assert.throws(
    () =>
      buildXaiImagineImageBody({
        model: "grok-imagine-image-2.0",
        prompt: "p",
        imageUrls: ["a", "b", "c", "d"],
      }),
    /最多 3 张参考图/,
  );
  assert.throws(
    () => buildXaiImagineImageBody({ model: "grok-imagine-image-2.0", prompt: "p", operation: "edit" }),
    /至少 1 张参考图|images\/edits/,
  );
});
