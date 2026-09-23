import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { uploadStudioWorkMedia } = await import("./works-media.ts");

test("work media upload writes binary bytes and returns a served works URL", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-work-media-test-"));
  try {
    const response = await uploadStudioWorkMedia(
      new Request("http://studio.test/client-api/upload-work-media", {
        method: "POST",
        headers: {
          "Content-Type": "video/mp4",
          "X-Work-Kind": "video",
          "X-Work-Index": "0",
        },
        body: new Blob(["video-bytes"], { type: "video/mp4" }),
      }),
      { storageDirs: [directory], idFactory: () => "test-upload-id" },
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { ok?: boolean; url?: string; bytes?: number; mimeType?: string };
    assert.deepEqual(payload, {
      ok: true,
      url: "/works/test-upload-id-0.mp4",
      bytes: 11,
      mimeType: "video/mp4",
    });
    assert.equal(readFileSync(join(directory, "test-upload-id-0.mp4"), "utf8"), "video-bytes");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("work media upload rejects an invalid kind or index before reading the body", async () => {
  const response = await uploadStudioWorkMedia(
    new Request("http://studio.test/client-api/upload-work-media", {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        "X-Work-Kind": "video",
        "X-Work-Index": "8",
      },
      body: new Blob(["ignored"], { type: "video/mp4" }),
    }),
    { storageDirs: [] },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "作品媒体类型或序号无效" });
});

test("work media upload supports valid index 0-7 and respects mime extension", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-work-media-index-test-"));
  try {
    const response = await uploadStudioWorkMedia(
      new Request("http://studio.test/client-api/upload-work-media", {
        method: "POST",
        headers: {
          "Content-Type": "image/webp",
          "X-Work-Kind": "image",
          "X-Work-Index": "7",
        },
        body: new Blob(["webp-bytes"], { type: "image/webp" }),
      }),
      { storageDirs: [directory], idFactory: () => "valid-index-id" },
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { ok?: boolean; url?: string; bytes?: number; mimeType?: string };
    assert.deepEqual(payload, {
      ok: true,
      url: "/works/valid-index-id-7.webp",
      bytes: 10,
      mimeType: "image/webp",
    });
    assert.equal(readFileSync(join(directory, "valid-index-id-7.webp"), "utf8"), "webp-bytes");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("work media remote download returns failure when remote fetch fails", async () => {
  const originalFetch = globalThis.fetch;
  try {
    // 模拟远程上游服务 404
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });
    const response404 = await uploadStudioWorkMedia(
      new Request("http://studio.test/client-api/upload-work-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          remoteUrl: "https://example.com/missing-media.jpg",
        }),
      }),
    );

    assert.equal(response404.status, 404);
    const payload404 = await response404.json() as { ok?: boolean; error?: string };
    assert.equal(payload404.ok, false);
    assert.match(payload404.error || "", /404/);

    // 模拟网络异常抛错
    globalThis.fetch = async () => { throw new Error("Connection refused"); };
    const responseNetworkError = await uploadStudioWorkMedia(
      new Request("http://studio.test/client-api/upload-work-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          remoteUrl: "https://example.com/network-failed.jpg",
        }),
      }),
    );

    assert.equal(responseNetworkError.status, 502);
    const payloadNetworkError = await responseNetworkError.json() as { ok?: boolean; error?: string };
    assert.equal(payloadNetworkError.ok, false);
    assert.match(payloadNetworkError.error || "", /网络连接异常/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
