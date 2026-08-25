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

export function isVideoTaskSnapshotLocked(
  metadata: VideoTaskLockMetadata | undefined,
) {
  return Boolean(
    metadata?.content ||
      metadata?.status === "loading" ||
      metadata?.status === "generating" ||
      metadata?.status === "success" ||
      metadata?.videoReferenceLedger ||
      metadata?.videoGenerationTask?.id ||
      metadata?.videoGenerationAttempt?.id ||
      metadata?.seedanceTaskId ||
      metadata?.seedanceGenerationTaskState?.taskId ||
      metadata?.seedanceGenerationTaskState?.attemptId ||
      metadata?.seedanceGenerationTaskState?.startedAt ||
      metadata?.seedanceGenerationTaskState?.status === "generating",
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
