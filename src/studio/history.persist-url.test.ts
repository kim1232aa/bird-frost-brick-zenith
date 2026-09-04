import assert from "node:assert/strict";
import test from "node:test";
import { persistUrl, toDataUrl, toDataUrlIfLocal } from "./persist-url.ts";

test("persistUrl keeps data, served paths, and remote http for the server", async () => {
  assert.equal(await persistUrl("data:image/png;base64,aaa"), "data:image/png;base64,aaa");
  assert.equal(await persistUrl("/works/a-0.jpg"), "/works/a-0.jpg");
  assert.equal(await persistUrl("/gallery/seed.jpg"), "/gallery/seed.jpg");
  assert.equal(await persistUrl("https://imgen.x.ai/blocked.jpg"), "https://imgen.x.ai/blocked.jpg");
});

test("toDataUrl fetches a same-origin path into a data URL", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) as typeof fetch;
  try {
    const out = await toDataUrl("/gallery/seedream-mug.jpg");
    assert.equal(out, `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
  } finally {
    globalThis.fetch = original;
  }
});

test("toDataUrlIfLocal converts local paths and leaves https alone", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(Uint8Array.from([9]), { status: 200, headers: { "content-type": "image/png" } })) as typeof fetch;
  try {
    const local = await toDataUrlIfLocal("/gallery/seedream-mug.jpg");
    assert.match(local, /^data:image\/png;base64,/);
    assert.equal(await toDataUrlIfLocal("https://imgen.x.ai/a.jpg"), "https://imgen.x.ai/a.jpg");
  } finally {
    globalThis.fetch = original;
  }
});

test("toDataUrl throws on HTTP 403", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("no", { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(() => toDataUrl("/gallery/missing.jpg"), /图片读取失败 HTTP 403/);
  } finally {
    globalThis.fetch = original;
  }
});

test("persistUrl uploads a large local video as binary instead of base64", async () => {
  const original = globalThis.fetch;
  const uploads: Array<{ body: BodyInit | null; contentType: string | null }> = [];
  globalThis.fetch = (async (input, init) => {
    const target = String(input);
    if (target === "blob:large-video") {
      return new Response(new Blob([new Uint8Array(12_000_001)], { type: "video/mp4" }), { status: 200 });
    }
    if (target === "/client-api/upload-work-media") {
      uploads.push({
        body: init?.body || null,
        contentType: new Headers(init?.headers).get("content-type"),
      });
      return Response.json({ ok: true, url: "/works/large-video.mp4" });
    }
    throw new Error(`unexpected fetch: ${target}`);
  }) as typeof fetch;
  try {
    const out = await persistUrl("blob:large-video", { kind: "video", index: 0 });
    assert.equal(out, "/works/large-video.mp4");
    assert.equal(uploads.length, 1);
    assert.ok(uploads[0]?.body instanceof Blob);
    assert.equal(uploads[0]?.contentType, "video/mp4");
  } finally {
    globalThis.fetch = original;
  }
});

test("persistUrl infers a video MIME when an imported ZIP blob has none", async () => {
  const original = globalThis.fetch;
  let contentType = "";
  globalThis.fetch = (async (input, init) => {
    const target = String(input);
    if (target === "blob:zip-video") return new Response(new Blob(["video"]), { status: 200 });
    if (target === "/client-api/upload-work-media") {
      contentType = new Headers(init?.headers).get("content-type") || "";
      return Response.json({ ok: true, url: "/works/zip-video.mp4" });
    }
    throw new Error(`unexpected fetch: ${target}`);
  }) as typeof fetch;
  try {
    await persistUrl("blob:zip-video", { kind: "video", index: 0 });
    assert.equal(contentType, "video/mp4");
  } finally {
    globalThis.fetch = original;
  }
});
