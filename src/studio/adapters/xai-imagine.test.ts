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

const { buildXaiImagineImageBody, xaiImagineAdapter } = await import("./xai-imagine.ts");

test("xAI Imagine relay content download sends relay-id without browser credentials", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;
  const requests: Array<{ url: string; headers: Headers }> = [];
  (globalThis as { window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ status: "completed", url: "/v1/videos/vid-1/content" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
  };

  try {
    assert.ok(xaiImagineAdapter.pollVideo);
    const state = await xaiImagineAdapter.pollVideo(
      {
        provider: {
          id: "preset-grok-relay",
          baseUrl: "https://relay.example.test/v1",
          apiKey: "caller-key",
          apiKeys: [],
        },
      },
      "vid-1",
    );
    assert.equal(state.status, "completed");
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.headers.get("x-boundless-relay-id"), "preset-grok-relay");
      assert.equal(request.headers.get("x-local-relay-base-url"), null);
      assert.equal(request.headers.get("authorization"), null);
      assert.equal(request.headers.get("x-api-key"), null);
      assert.equal(JSON.stringify([...request.headers]).includes("caller-key"), false);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

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

test("xAI Imagine non-2.0 image models send generation-only fields and omit 2.0-only quality", () => {
  const body = buildXaiImagineImageBody({
    model: "grok-imagine-image",
    prompt: "p",
    size: "2K",
    aspectRatio: "16:9",
    quality: "low",
  });

  // 官方模型目录给 grok-imagine-image（1.0）同时列了 1K/2K resolutionPricing，
  // generation 文档的 aspect_ratio/resolution 未限版本；quality 仅 2.0。
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal("resolution" in body, true);
  assert.equal("quality" in body, false);
  assert.equal("image" in body, false);
  assert.equal("images" in body, false);
});

test("xAI Imagine text-to-image never sends an empty images array", () => {
  const body = buildXaiImagineImageBody({
    model: "grok-imagine-image",
    prompt: "white ceramic mug on a table, photorealistic",
    n: 1,
    operation: "generate",
    imageUrls: [],
  });
  assert.equal("images" in body, false);
  assert.equal("image" in body, false);
  assert.deepEqual(body, {
    model: "grok-imagine-image",
    prompt: "white ceramic mug on a table, photorealistic",
    n: 1,
  });
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
