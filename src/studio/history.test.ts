import assert from "node:assert/strict";
import test from "node:test";
import {
  isFailedStudioHistoryItem,
  isSavedStudioHistoryItem,
  isStableHistoryUrl,
  mergeStudioHistoryItems,
  sameStudioHistoryPayload,
  studioHistoryPersistStatus,
  type StudioHistoryItem,
} from "./history.ts";

function item(
  id: string,
  kind: StudioHistoryItem["kind"],
  urls: string[],
  createdAt: number,
): StudioHistoryItem {
  return { id, kind, urls, createdAt, title: id, prompt: "", model: "test" };
}

test("served /works URLs remain stable across hydration", () => {
  assert.equal(isStableHistoryUrl("/works/video-0.mp4"), true);
  assert.equal(isStableHistoryUrl("/gallery/reference.jpg"), true);
  assert.equal(isStableHistoryUrl("data:image/png;base64,abc"), true);
  assert.equal(isStableHistoryUrl("blob:https://example.test/transient"), false);
  assert.equal(isStableHistoryUrl("https://upstream.example/video.mp4"), false);
});

test("history deduplication distinguishes bundles and work kinds", () => {
  assert.equal(
    sameStudioHistoryPayload(
      { kind: "story", urls: ["/works/a.png", "/works/b.png"] },
      { kind: "story", urls: ["/works/a.png", "/works/b.png"] },
    ),
    true,
  );
  assert.equal(
    sameStudioHistoryPayload(
      { kind: "story", urls: ["/works/a.png"] },
      { kind: "story", urls: ["/works/a.png", "/works/b.png"] },
    ),
    false,
  );
  assert.equal(
    sameStudioHistoryPayload(
      { kind: "image", urls: ["/works/a.png"] },
      { kind: "story", urls: ["/works/a.png"] },
    ),
    false,
  );
});

test("hydration keeps local /works entries and lets remote rows win by id", () => {
  const remote = [item("shared", "video", ["/works/remote.mp4"], 10)];
  const local = [
    item("story", "story", ["data:image/png;base64,story"], 30),
    item("local", "video", ["/works/local.mp4"], 20),
    item("shared", "video", ["/works/stale-local.mp4"], 40),
    item("transient", "video", ["blob:https://example.test/transient"], 50),
  ];

  const merged = mergeStudioHistoryItems(remote, local);
  assert.deepEqual(merged.map((row) => row.id), ["story", "local", "shared"]);
  assert.equal(merged.find((row) => row.id === "shared")?.urls[0], "/works/remote.mp4");
  assert.equal(merged.every((row) => row.persistStatus === "saved"), true);
});

test("failed persistence is not a saved work and legacy errors remain failed", () => {
  const failed = {
    ...item("failed", "video", ["blob:failed"], 1),
    persistStatus: "failed" as const,
    persistError: "作品媒体上传失败 HTTP 500",
  };
  const saved = {
    ...item("saved", "video", ["/works/saved.mp4"], 2),
    persistStatus: "saved" as const,
  };
  const legacyFailed = {
    ...item("legacy-failed", "image", ["/works/legacy.png"], 3),
    persistError: "作品文件写入失败",
  };

  assert.equal(studioHistoryPersistStatus(failed), "failed");
  assert.equal(studioHistoryPersistStatus(legacyFailed), "failed");
  assert.equal(isFailedStudioHistoryItem(failed), true);
  assert.equal(isSavedStudioHistoryItem(failed), false);
  assert.equal(isSavedStudioHistoryItem(saved), true);
  assert.equal(isFailedStudioHistoryItem(saved), false);
});
