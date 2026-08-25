import type { CanvasVideoTaskProvider } from "../types";

type VideoTaskMetadata = {
  videoGenerationTask?: {
    id: string;
    provider: string;
    providerId?: string;
    attemptId?: string;
  };
  videoGenerationAttempt?: VideoGenerationAttempt;
  seedanceGenerationTaskState?: {
    status: string;
    taskId?: string;
    attemptId?: string;
    provider?: string;
    providerId?: string;
  };
  seedanceTaskId?: string;
  [key: string]: unknown;
};

export type VideoGenerationAttempt = {
  id: string;
  kind: "native" | "customer";
  provider: CanvasVideoTaskProvider | "customer";
  providerId?: string;
  model: string;
  startedAt: string;
  taskId?: string;
};

export function videoTaskControllerKey(input: {
  provider: string;
  providerId?: string;
  nodeId: string;
  taskId: string;
}) {
  return [input.provider, input.providerId || "-", input.nodeId, input.taskId]
    .map((value) => encodeURIComponent(String(value || "")))
    .join(":");
}

export function hasNonterminalVideoTask(metadata: VideoTaskMetadata | undefined) {
  const taskState = metadata?.seedanceGenerationTaskState;
  const terminalTaskState = ["failed", "completed", "cancelled"].includes(
    String(taskState?.status || "").toLowerCase(),
  );
  if (terminalTaskState) return false;
  if (metadata?.status === "error" && taskState?.status !== "generating") return false;
  return Boolean(
    metadata?.videoGenerationAttempt ||
      metadata?.videoGenerationTask ||
      (taskState?.status === "generating" && taskState.taskId),
  );
}

export function ownsVideoGenerationAttempt(
  metadata: VideoTaskMetadata | undefined,
  expected: Pick<VideoGenerationAttempt, "id" | "provider" | "providerId"> & {
    taskId?: string;
  },
) {
  const actual = metadata?.videoGenerationAttempt;
  if (!actual || actual.id !== expected.id || actual.provider !== expected.provider)
    return false;
  if ((actual.providerId || "") !== (expected.providerId || "")) return false;
  if (expected.taskId && actual.taskId !== expected.taskId) return false;
  return true;
}

export function withVideoAttemptTaskId(
  attempt: VideoGenerationAttempt,
  taskId: string,
): VideoGenerationAttempt {
  return { ...attempt, taskId };
}

export function clearVideoTaskOwnership<T extends VideoTaskMetadata>(metadata: T) {
  return {
    ...metadata,
    videoGenerationTask: undefined,
    videoGenerationAttempt: undefined,
    seedanceTaskId: undefined,
    seedanceGenerationTaskState: undefined,
  };
}

export function videoTaskControllerKeysForNode(
  nodeId: string,
  metadata: VideoTaskMetadata | undefined,
) {
  const keys = new Set<string>();
  const attempt = metadata?.videoGenerationAttempt;
  if (attempt?.taskId)
    keys.add(
      videoTaskControllerKey({
        provider: attempt.provider,
        providerId: attempt.providerId,
        nodeId,
        taskId: attempt.taskId,
      }),
    );
  const nativeTask = metadata?.videoGenerationTask;
  if (nativeTask?.id)
    keys.add(
      videoTaskControllerKey({
        provider: nativeTask.provider,
        providerId: nativeTask.providerId,
        nodeId,
        taskId: nativeTask.id,
      }),
    );
  const customerTask = metadata?.seedanceGenerationTaskState;
  if (customerTask?.taskId)
    keys.add(
      videoTaskControllerKey({
        provider: customerTask.provider || "customer",
        providerId: customerTask.providerId,
        nodeId,
        taskId: customerTask.taskId,
      }),
    );
  return [...keys];
}
