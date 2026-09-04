import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasNodeMetadata } from "../types";
import {
  isResumableCanvasImageTask,
  recoverInterruptedCanvasImageNode,
} from "./canvas-legacy-image-task.ts";

test("local canvas-* attempt ids cannot resume after reload", () => {
  assert.equal(
    isResumableCanvasImageTask({
      status: "loading",
      imageGenerationAttemptId: "canvas-abc",
    }),
    false,
  );
});

test("native imageGenerationTask remains resumable", () => {
  assert.equal(
    isResumableCanvasImageTask({
      status: "loading",
      imageGenerationTask: {
        snapshot: { provider: "dashscope", taskId: "tsk_remote_1" },
        attemptId: "attempt-1",
        outputIndex: 0,
      },
    }),
    true,
  );
});

test("real remote sourceImageTaskId remains resumable", () => {
  assert.equal(
    isResumableCanvasImageTask({
      status: "loading",
      sourceImageTaskId: "task_remote_1",
    }),
    true,
  );
});

test("local canvas-* sourceImageTaskId cannot resume after reload", () => {
  assert.equal(
    isResumableCanvasImageTask({
      status: "loading",
      sourceImageTaskId: "canvas-story-shot-x-1",
      imageGenerationAttemptId: "canvas-story-shot-x-1",
    }),
    false,
  );
});

test("leftover non-native imageGenerationTask cannot resume after reload", () => {
  assert.equal(
    isResumableCanvasImageTask({
      status: "loading",
      imageGenerationTask: {
        snapshot: { provider: "platform", taskId: "canvas-story-shot-x-1" },
        attemptId: "canvas-story-shot-x-1",
        outputIndex: 0,
      },
    }),
    false,
  );
});

test("civitai native snapshot remains resumable", () => {
  assert.equal(
    isResumableCanvasImageTask({
      status: "loading",
      imageGenerationTask: {
        snapshot: { provider: "civitai", taskId: "wf_123" },
        attemptId: "attempt-1",
        outputIndex: 0,
      },
    }),
    true,
  );
});

test("reload marks local canvas-* loading image as interrupted error", () => {
  const metadata: CanvasNodeMetadata = {
    status: "loading",
    imageGenerationAttemptId: "canvas-story-shot-3ORKZ-fg1k6ArwFzNbOtw-1",
    storyLabel: "第5镜",
  };
  const recovered = recoverInterruptedCanvasImageNode({
    id: "shot-5",
    type: "image",
    metadata,
  });
  assert.equal(recovered.metadata?.status, "error");
  assert.equal(recovered.metadata?.imageGenerationAttemptId, undefined);
  assert.match(String(recovered.metadata?.errorDetails || ""), /无法恢复/);
});

test("reload keeps civitai native loading image resumable", () => {
  const recovered = recoverInterruptedCanvasImageNode({
    id: "shot-5",
    type: "image",
    metadata: {
      status: "loading",
      imageGenerationTask: {
        snapshot: { provider: "civitai", taskId: "wf_123" },
        attemptId: "attempt-1",
        outputIndex: 0,
      },
    },
  });
  assert.equal(recovered.metadata?.status, "loading");
  assert.equal(
    recovered.metadata?.imageGenerationTask?.snapshot?.taskId,
    "wf_123",
  );
});
