import type { CanvasNodeMetadata } from "../types";

export type LegacyImageTaskRecoveryMetadata = Pick<
  CanvasNodeMetadata,
  | "sourceImageTaskId"
  | "imageGenerationAttemptId"
  | "storageKey"
  | "backendUrl"
  | "backendRel"
  | "content"
  | "status"
  | "errorDetails"
>;

export function isLegacyCanvasImageTaskId(taskId?: string) {
  return String(taskId || "").trim().startsWith("canvas-");
}

export function hasLegacyCanvasImageRecoverySource(
  metadata: Pick<
    LegacyImageTaskRecoveryMetadata,
    "storageKey" | "backendUrl" | "backendRel" | "content"
  >,
) {
  return Boolean(
    String(metadata.storageKey || "").trim() ||
      String(metadata.backendUrl || "").trim() ||
      String(metadata.backendRel || "").trim() ||
      (String(metadata.content || "").trim() &&
        !String(metadata.content || "").trim().startsWith("blob:")),
  );
}

export function shouldPreferCanvasImageRecoveryRetry(
  node:
    | {
        type?: string;
        metadata?: LegacyImageTaskRecoveryMetadata;
      }
    | undefined,
) {
  const metadata = node?.metadata;
  if (!metadata || node?.type !== "image" || metadata.status !== "error") {
    return false;
  }
  if (String(metadata.content || "").trim()) return false;
  if (!hasLegacyCanvasImageRecoverySource(metadata)) return false;
  const errorDetails = String(metadata.errorDetails || "");
  return (
    errorDetails.includes("图片本地缓存和远程源均无法恢复") ||
    errorDetails.includes("图片重试缺少已保存的精确 operation/provider/model 路由")
  );
}

export function shouldSkipLegacyImageTaskResume(
  metadata: LegacyImageTaskRecoveryMetadata | undefined,
) {
  return Boolean(
    metadata &&
      isLegacyCanvasImageTaskId(metadata.sourceImageTaskId) &&
      hasLegacyCanvasImageRecoverySource(metadata),
  );
}

const NATIVE_IMAGE_TASK_PROVIDERS = new Set(["dashscope", "miaohua", "civitai"]);

function nativeImageTaskSnapshot(metadata: { imageGenerationTask?: unknown } | undefined) {
  const binding = metadata?.imageGenerationTask as
    | { snapshot?: { provider?: unknown; taskId?: unknown } }
    | undefined;
  const snapshot = binding?.snapshot;
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const provider = String(snapshot.provider || "").trim();
  const taskId = String(snapshot.taskId || "").trim();
  if (!NATIVE_IMAGE_TASK_PROVIDERS.has(provider) || !taskId) return undefined;
  if (isLegacyCanvasImageTaskId(taskId)) return undefined;
  return snapshot;
}

/** Native poll snapshot or a real remote task id. Local `canvas-*` attempt ids cannot resume after reload. */
export function isResumableCanvasImageTask(
  metadata:
    | (LegacyImageTaskRecoveryMetadata & { imageGenerationTask?: unknown })
    | undefined,
) {
  if (nativeImageTaskSnapshot(metadata)) return true;
  const sourceTaskId = String(metadata?.sourceImageTaskId || "").trim();
  if (!sourceTaskId || isLegacyCanvasImageTaskId(sourceTaskId)) return false;
  if (shouldSkipLegacyImageTaskResume(metadata)) return false;
  return true;
}

export function recoveredLegacyImageMetadataPatch(
  metadata: LegacyImageTaskRecoveryMetadata | undefined,
) {
  if (!shouldSkipLegacyImageTaskResume(metadata)) return undefined;
  return {
    status: "success" as const,
    errorDetails: undefined,
    sourceImageTaskId: undefined,
    imageGenerationAttemptId: undefined,
  };
}

const INTERRUPTED_LOCAL_IMAGE_TASK =
  "旧任务在刷新后无法恢复；已停止且不会重新提交付费请求";

/** Reload-only. Live in-flight canvas-* attempts stay loading until this runs. */
export function recoverInterruptedCanvasImageNode<
  T extends {
    type?: string;
    metadata?: (LegacyImageTaskRecoveryMetadata & { imageGenerationTask?: unknown }) | undefined;
  },
>(node: T): T {
  if (node.type !== "image") return node;
  if (node.metadata?.status !== "loading") return node;
  if (isResumableCanvasImageTask(node.metadata)) return node;
  return {
    ...node,
    metadata: {
      ...node.metadata,
      status: "error",
      errorDetails: INTERRUPTED_LOCAL_IMAGE_TASK,
      sourceImageTaskId: undefined,
      imageGenerationAttemptId: undefined,
      imageGenerationTask: undefined,
    },
  };
}
