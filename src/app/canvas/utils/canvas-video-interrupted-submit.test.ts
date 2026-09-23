import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERRUPTED_VIDEO_SUBMIT_ERROR,
  recoverInterruptedVideoSubmit,
} from "./canvas-video-interrupted-submit.ts";
import {
  resolveSeedance2ReferenceTransportResolution,
  seedance2ReferenceTransportSource,
} from "./seedance2-reference-transport.ts";
import { isVideoTaskSnapshotLocked } from "./canvas-video-task-edit-lock.ts";

const loadingPlaceholder = (overrides: Record<string, any> = {}) => ({
  status: "loading",
  content: "",
  seedanceWorkflowRole: "placeholder",
  seedanceWorkflowNodeId: "wf-1",
  seedanceShotIndex: 1,
  seedanceStoryShotId: "shot_001",
  videoGenerationAttempt: {
    id: "attempt-1",
    kind: "native",
    provider: "customer",
    providerId: "preset-agnes-ai",
    model: "agnes-video-v2.0",
    startedAt: "2026-09-23T04:00:00.000Z",
  },
  seedanceGenerationTaskState: {
    status: "generating",
    startedAt: "2026-09-23T04:00:00.000Z",
    attemptId: "attempt-1",
  },
  ...overrides,
});

test("a submit that never got a task id settles as a failure, not back to a blank box", () => {
  const settled = recoverInterruptedVideoSubmit(loadingPlaceholder());

  assert.ok(settled);
  assert.equal(settled.status, "error");
  assert.equal(settled.errorDetails, INTERRUPTED_VIDEO_SUBMIT_ERROR);
  assert.equal(settled.videoGenerationAttempt, undefined);
  assert.equal(settled.seedanceGenerationTaskState, undefined);
  assert.equal(settled.seedanceTaskId, undefined);
  assert.equal(settled.videoGenerationTask, undefined);
});

test("the settled failure keeps workflow identity and reopens editing", () => {
  const settled = recoverInterruptedVideoSubmit(loadingPlaceholder())!;

  assert.equal(settled.seedanceWorkflowRole, "placeholder");
  assert.equal(settled.seedanceWorkflowNodeId, "wf-1");
  assert.equal(settled.seedanceShotIndex, 1);
  assert.equal(settled.seedanceStoryShotId, "shot_001");
  // `error` is terminal, so the model picker and the generate button unlock.
  assert.equal(isVideoTaskSnapshotLocked(settled), false);
});

test("an already-reported reason survives the recovery", () => {
  const settled = recoverInterruptedVideoSubmit(
    loadingPlaceholder({ errorDetails: "参考图“当前分镜图”无法提交" }),
  );

  assert.equal(settled?.errorDetails, "参考图“当前分镜图”无法提交");
});

test("a task that polling can still resume is left alone", () => {
  assert.equal(
    recoverInterruptedVideoSubmit(
      loadingPlaceholder({
        seedanceGenerationTaskState: { status: "generating", taskId: "task-1" },
      }),
    ),
    null,
  );
  assert.equal(
    recoverInterruptedVideoSubmit(
      loadingPlaceholder({ videoGenerationTask: { id: "task-1" } }),
    ),
    null,
  );
});

test("nodes that are not mid-submit are left alone", () => {
  assert.equal(recoverInterruptedVideoSubmit(undefined), null);
  assert.equal(recoverInterruptedVideoSubmit({ status: "idle" }), null);
  assert.equal(recoverInterruptedVideoSubmit({ status: "error" }), null);
  assert.equal(recoverInterruptedVideoSubmit({ status: "success" }), null);
});

test("a reference whose image cannot be loaded is reported, not silently submitted", async () => {
  const dead = "/works/5bc50dbb-68ed-4bea-a759-bc5cd16ed29d-0.png";
  assert.deepEqual(seedance2ReferenceTransportSource(dead), { url: dead });

  // `imageToDataUrl` swallows its own fetch error and hands back the address it
  // was given; that fallback is what used to be submitted as a reference.
  const swallowingResolver = async (source: { url?: string; storageKey?: string }) =>
    source.url || source.storageKey || "";
  const swallowed = await resolveSeedance2ReferenceTransportResolution(dead, swallowingResolver);
  assert.equal(swallowed.state, "unresolved");
  assert.match(swallowed.reason, /无法加载/);

  const throwingResolver = async () => {
    throw new Error("HTTP 404");
  };
  const thrown = await resolveSeedance2ReferenceTransportResolution(dead, throwingResolver);
  assert.equal(thrown.state, "unresolved");
  assert.equal(thrown.reason, "HTTP 404");

  const emptyResolver = async () => "";
  const empty = await resolveSeedance2ReferenceTransportResolution(dead, emptyResolver);
  assert.equal(empty.state, "unresolved");
  assert.equal(empty.reason, "读取结果为空");
});

test("a reference that really loads still resolves", async () => {
  const live = "/works/936dc6c6-765b-4453-abfa-68cbc0de8c37-0.png";
  const resolver = async () => "data:image/png;base64,AAAA";

  assert.deepEqual(await resolveSeedance2ReferenceTransportResolution(live, resolver), {
    state: "ready",
    value: "data:image/png;base64,AAAA",
  });

  // Addresses that need no local resolution pass through untouched.
  assert.deepEqual(
    await resolveSeedance2ReferenceTransportResolution(
      "https://cdn.example.com/a.png",
      resolver,
    ),
    { state: "ready", value: "https://cdn.example.com/a.png" },
  );
  assert.deepEqual(await resolveSeedance2ReferenceTransportResolution("", resolver), {
    state: "empty",
  });
});
