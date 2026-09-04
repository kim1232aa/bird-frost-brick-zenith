import assert from "node:assert/strict";
import test from "node:test";

import { hasNonterminalVideoTask } from "./canvas-video-task-ownership.ts";

test("failed placeholder recovery does not keep the node locked as generating", () => {
  assert.equal(
    hasNonterminalVideoTask({
      status: "error",
      videoGenerationTask: {
        id: "task-1",
        provider: "xai-imagine",
        providerId: "preset-grok-relay",
      },
      seedanceGenerationTaskState: {
        status: "failed",
        taskId: "task-1",
        errorMessage: "原视频 provider 配置版本已变化，任务恢复已阻止。",
      },
    }),
    false,
  );
});

test("error placeholders with a leftover generating snapshot are still retryable", () => {
  assert.equal(
    hasNonterminalVideoTask({
      status: "error",
      videoGenerationAttempt: {
        id: "attempt-1",
        kind: "native",
        provider: "xai-imagine",
        model: "grok-imagine-video",
        startedAt: "2026-09-02T00:00:00.000Z",
        taskId: "task-1",
      },
      seedanceGenerationTaskState: {
        status: "generating",
        taskId: "task-1",
        errorMessage: "原视频 provider 配置版本已变化，任务恢复已阻止。",
      },
    }),
    false,
  );
});

test("an in-flight generating placeholder remains locked", () => {
  assert.equal(
    hasNonterminalVideoTask({
      status: "loading",
      videoGenerationTask: {
        id: "task-1",
        provider: "xai-imagine",
      },
      seedanceGenerationTaskState: {
        status: "generating",
        taskId: "task-1",
      },
    }),
    true,
  );
});
