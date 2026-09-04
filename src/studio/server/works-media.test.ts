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
        "X-Work-Kind": "unknown",
        "X-Work-Index": "8",
      },
      body: new Blob(["ignored"], { type: "video/mp4" }),
    }),
    { storageDirs: [] },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "作品媒体类型或序号无效" });
});
