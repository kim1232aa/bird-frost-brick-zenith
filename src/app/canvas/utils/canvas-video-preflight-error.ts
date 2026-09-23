import { hasNonterminalVideoTask } from "./canvas-video-task-ownership.ts";

type VideoPreflightMetadata = {
  status?: string;
  content?: string;
  errorDetails?: string;
  seedanceWorkflowRole?: string;
  seedanceModel?: string;
  model?: string;
  modelProviderId?: string;
  videoGenerationScope?: {
    model?: string;
    providerId?: string;
    operation?: string;
  };
  videoGenerationTask?: {
    id?: string;
    provider?: string;
    providerId?: string;
    model?: string;
  };
  videoGenerationAttempt?: {
    id?: string;
    provider?: string;
    providerId?: string;
    model?: string;
  };
  seedanceTaskId?: string;
  seedanceGenerationTaskState?: {
    status?: string;
    taskId?: string;
    attemptId?: string;
    provider?: string;
    providerId?: string;
    model?: string;
    errorMessage?: string;
    [key: string]: unknown;
  };
  storyGenerationStatus?: string;
  storyAnalysisStatus?: string;
  [key: string]: unknown;
};

export type VideoPlaceholderPreflightTarget = {
  id: string;
  type?: string;
  metadata?: VideoPreflightMetadata;
  [key: string]: unknown;
};

/**
 * Checks whether a video node is currently running or in-flight.
 * In-flight nodes must never be overwritten with a preflight error.
 */
export function isVideoNodeGenerating(
  metadata: VideoPreflightMetadata | undefined,
): boolean {
  if (!metadata) return false;
  const status = String(metadata.status || "").toLowerCase();
  const taskStatus = String(
    metadata.seedanceGenerationTaskState?.status || "",
  ).toLowerCase();
  if (status === "loading" || status === "generating") return true;
  if (taskStatus === "generating" || taskStatus === "running") return true;
  if (hasNonterminalVideoTask(metadata as any)) return true;
  if (
    metadata.storyGenerationStatus === "loading" ||
    metadata.storyAnalysisStatus === "loading"
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a video node is already completed or successful.
 * Succeeded nodes must never be overwritten with a preflight error.
 */
export function isVideoNodeSucceeded(
  metadata: VideoPreflightMetadata | undefined,
): boolean {
  if (!metadata) return false;
  const status = String(metadata.status || "").toLowerCase();
  const taskStatus = String(
    metadata.seedanceGenerationTaskState?.status || "",
  ).toLowerCase();
  if (
    status === "success" ||
    status === "done" ||
    status === "ready" ||
    status === "completed"
  ) {
    return true;
  }
  if (
    taskStatus === "success" ||
    taskStatus === "completed" ||
    taskStatus === "done"
  ) {
    return true;
  }
  if (Boolean(metadata.content)) return true;
  return false;
}

function extractVideoTaskIdentity(metadata: VideoPreflightMetadata) {
  const taskState = metadata.seedanceGenerationTaskState;
  const attempt = metadata.videoGenerationAttempt;
  const task = metadata.videoGenerationTask;
  const model = String(
    taskState?.model ||
      attempt?.model ||
      task?.model ||
      metadata.seedanceModel ||
      metadata.model ||
      metadata.videoGenerationScope?.model ||
      "",
  ).trim();
  const providerId = String(
    taskState?.providerId ||
      attempt?.providerId ||
      task?.providerId ||
      metadata.modelProviderId ||
      metadata.videoGenerationScope?.providerId ||
      "",
  ).trim();
  const provider = taskState?.provider || attempt?.provider || task?.provider;
  return {
    ...(model ? { model } : {}),
    ...(providerId ? { providerId } : {}),
    ...(provider ? { provider } : {}),
  };
}

/**
 * Settles a video placeholder node into error state when pre-submission validation fails.
 * Returns null if the node cannot be safely transitioned (e.g. it is currently generating
 * or already succeeded).
 */
export function settleVideoPlaceholderPreflightMetadata<
  T extends VideoPreflightMetadata,
>(metadata: T | undefined, errorDetails: string): T | null {
  if (!metadata) return null;
  if (isVideoNodeSucceeded(metadata)) return null;
  if (isVideoNodeGenerating(metadata)) return null;

  const cleanError = String(errorDetails || "").trim() || "视频生成配置校验失败";
  const identity = extractVideoTaskIdentity(metadata);

  return {
    ...metadata,
    status: "error",
    errorDetails: cleanError,
    seedanceGenerationTaskState: {
      ...metadata.seedanceGenerationTaskState,
      ...identity,
      status: "failed",
      errorMessage: cleanError,
    },
    videoGenerationAttempt: undefined,
    videoGenerationTask: undefined,
  };
}

/**
 * Pure helper to apply preflight error to a list of canvas nodes.
 * If the target node cannot be transitioned (e.g. generating or success),
 * returns modified: false and the original nodes unmodified.
 */
export function applyVideoPlaceholderPreflightError<
  T extends VideoPlaceholderPreflightTarget,
>(
  nodes: readonly T[],
  targetNodeId: string,
  errorDetails: string,
): { nodes: T[]; modified: boolean } {
  let modified = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== targetNodeId) return node;
    const settledMetadata = settleVideoPlaceholderPreflightMetadata(
      node.metadata,
      errorDetails,
    );
    if (!settledMetadata) return node;
    modified = true;
    return {
      ...node,
      metadata: settledMetadata,
    };
  });
  return { nodes: modified ? nextNodes : [...nodes], modified };
}
