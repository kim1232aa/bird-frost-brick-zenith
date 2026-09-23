type VideoTaskLockMetadata = {
  content?: string;
  status?: string;
  videoGenerationTask?: { id?: string };
  videoGenerationAttempt?: { id?: string };
  videoReferenceLedger?: unknown;
  seedanceTaskId?: string;
  seedanceGenerationTaskState?: {
    taskId?: string;
    attemptId?: string;
    startedAt?: string;
    status?: string;
  };
  [key: string]: unknown;
};

const TERMINAL_VIDEO_TASK_STATES: readonly string[] = ["success", "failed", "timeout", "idle"];

const VIDEO_TASK_SNAPSHOT_KEYS = [
  "model",
  "seedanceModel",
  "modelProviderId",
  "seedanceApiProvider",
  "seedanceApiEndpoint",
  "videoGenerationSettings",
  "videoGenerationScope",
  "videoGenerationCapabilityId",
  "videoReferenceLedger",
  "videoWireFormat",
  "videoGenerationOperationMigration",
  "seedanceReferenceSlotBindings",
  "seedanceReferenceExtraSlotBindings",
  "seedanceReferenceOrder",
  "seedanceRequiredReferences",
] as const;

/**
 * A video snapshot is frozen only while its task is actually in flight. Once a
 * task settles — success, failure, timeout — the placeholder becomes editable
 * again, so the user can switch models and submit a new run.
 */
export function isVideoTaskSnapshotLocked(
  metadata: VideoTaskLockMetadata | undefined,
) {
  if (metadata?.status === "loading" || metadata?.status === "generating") return true;
  const taskStatus = String(metadata?.seedanceGenerationTaskState?.status || "");
  if (taskStatus === "generating") return true;
  const settled =
    TERMINAL_VIDEO_TASK_STATES.includes(taskStatus) ||
    metadata?.status === "success" ||
    metadata?.status === "error";
  return Boolean(metadata?.videoGenerationAttempt?.id && !settled);
}

/**
 * Whether this node ever ran a video task — in flight, or already finished.
 * Automatic background migration must leave such a node alone: rewriting its
 * parameter snapshot would misreport what produced the existing result. A user
 * editing the node is a different question; that is `isVideoTaskSnapshotLocked`.
 */
export function hasVideoTaskHistory(metadata: VideoTaskLockMetadata | undefined) {
  const taskStatus = String(metadata?.seedanceGenerationTaskState?.status || "");
  return Boolean(
    metadata?.content ||
      (metadata?.status && metadata.status !== "idle") ||
      metadata?.videoGenerationTask?.id ||
      metadata?.videoGenerationAttempt?.id ||
      metadata?.seedanceTaskId ||
      metadata?.seedanceGenerationTaskState?.taskId ||
      metadata?.seedanceGenerationTaskState?.attemptId ||
      metadata?.seedanceGenerationTaskState?.startedAt ||
      (taskStatus && taskStatus !== "idle"),
  );
}

export function protectVideoTaskSnapshotPatch<T extends object>(
  metadata: VideoTaskLockMetadata | undefined,
  patch: T,
): T {
  if (!isVideoTaskSnapshotLocked(metadata)) return patch;
  const protectedPatch = { ...patch } as T & Record<string, unknown>;
  for (const key of VIDEO_TASK_SNAPSHOT_KEYS) delete protectedPatch[key];
  return protectedPatch;
}
