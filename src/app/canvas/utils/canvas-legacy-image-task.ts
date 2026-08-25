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
