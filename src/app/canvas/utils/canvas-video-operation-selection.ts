import type { ResolvedVideoModelCapability } from "@/services/api/video-model-capabilities";
import type {
  VideoGenerationOperation,
  VideoGenerationSettingsScope,
} from "@/stores/use-config-store";

export type WorkflowVideoOperationOption = {
  value: VideoGenerationOperation;
  label: string;
};

export type WorkflowVideoOperationSelection = {
  options: WorkflowVideoOperationOption[];
  operation?: VideoGenerationOperation;
  requiresSelection: boolean;
  blockedReason?: string;
  migrationSource?: "task-snapshot" | "semantic-contract" | "single-capability-operation";
};

const OPERATION_LABELS: Record<VideoGenerationOperation, string> = {
  "text-to-video": "文生视频（不使用图片）",
  "image-to-video": "首帧图生视频",
  "reference-to-video": "多参考素材生视频",
  "first-last-frame-to-video": "首尾帧生视频",
  "keyframes-to-video": "有序关键帧生视频",
  continuation: "视频续写",
  "video-edit": "视频编辑",
};

export function resolveWorkflowVideoOperationSelection({
  capability,
  providerId,
  model,
  savedScope,
  savedTaskScope,
  savedCapabilityId,
  savedReferenceUses = [],
}: {
  capability: ResolvedVideoModelCapability | undefined;
  providerId: string;
  model: string;
  savedScope?: VideoGenerationSettingsScope;
  savedTaskScope?: VideoGenerationSettingsScope;
  savedCapabilityId?: string;
  savedReferenceUses?: readonly string[];
}): WorkflowVideoOperationSelection {
  if (!capability) {
    return {
      options: [],
      requiresSelection: true,
      blockedReason: "视频 provider/model capability 尚未解析，不能选择 operation",
    };
  }
  if (capability.requiresExplicitProfile || capability.intentPolicy === "blocked") {
    return {
      options: [],
      requiresSelection: true,
      blockedReason:
        capability.referenceContractBlockReason ||
        "当前 provider/model 没有可验证的视频 operation 合同",
    };
  }

  const options = workflowVideoOperationOptionsForCapability(capability);
  const exactSavedOperation =
    savedScope?.providerId === providerId &&
    savedScope.model === model &&
    options.some(({ value }) => value === savedScope.operation)
      ? savedScope.operation
      : undefined;
  // savedTaskScope is used as a migration fallback for nodes that pre-date
  // explicit scope saving. But when the user explicitly clears the scope by
  // selecting "auto" (which patches both savedScope and savedCapabilityId to
  // undefined), we must not let the task snapshot silently override that
  // intent — the UI would show the old resolved operation instead of "auto".
  // Brand-new nodes (no tasks ever run) are unaffected because their
  // savedTaskScope is always undefined to begin with.
  const taskScopeSuppressed = savedScope === undefined && savedCapabilityId === undefined;
  const exactTaskOperation =
    !taskScopeSuppressed &&
    savedTaskScope?.providerId === providerId &&
    savedTaskScope.model === model &&
    options.some(({ value }) => value === savedTaskScope.operation)
      ? savedTaskScope.operation
      : undefined;
  const semanticOperation = operationFromSavedSemanticUses(savedReferenceUses);
  const exactSemanticOperation =
    savedCapabilityId === capability.generationParameters.id &&
    semanticOperation &&
    options.some(({ value }) => value === semanticOperation)
      ? semanticOperation
      : undefined;
  const singleCapabilityOperation =
    savedCapabilityId === capability.generationParameters.id && options.length === 1
      ? options[0]?.value
      : undefined;
  const migratedOperation = exactTaskOperation || exactSemanticOperation || singleCapabilityOperation;
  const operation = exactSavedOperation || migratedOperation;
  const migrationSource = exactTaskOperation
    ? "task-snapshot" as const
    : exactSemanticOperation
      ? "semantic-contract" as const
      : singleCapabilityOperation
        ? "single-capability-operation" as const
        : undefined;

  return {
    options,
    ...(operation ? { operation } : {}),
    ...(migrationSource ? { migrationSource } : {}),
    requiresSelection: !operation,
    ...(!options.length
      ? { blockedReason: "当前 provider/model 没有适用于 Story 工作流的已验证 operation" }
      : {}),
  };
}

function operationFromSavedSemanticUses(
  uses: readonly string[],
): VideoGenerationOperation | undefined {
  const normalized = new Set(uses.filter(Boolean));
  if (!normalized.size) return undefined;
  if (normalized.has("keyframe")) {
    return normalized.has("reference_image") ? undefined : "keyframes-to-video";
  }
  const hasFirst = normalized.has("first_frame");
  const hasLast = normalized.has("last_frame");
  const hasReferences = normalized.has("reference_image");
  if (hasReferences && (hasFirst || hasLast)) return undefined;
  if (hasFirst && hasLast) return "first-last-frame-to-video";
  if (hasFirst && !hasLast) return "image-to-video";
  if (hasReferences && !hasLast) return "reference-to-video";
  return undefined;
}

export function workflowVideoOperationOptionsForCapability(
  capability: ResolvedVideoModelCapability,
): WorkflowVideoOperationOption[] {
  return workflowVideoOperationsForCapability(capability).map((value) => ({
    value,
    label: OPERATION_LABELS[value],
  }));
}

export type WorkflowVideoAutoMaterials = {
  /** Total story shots scheduled for this run. */
  totalShots: number;
  /** Shots that currently carry a storyboard/reference image. */
  shotsWithImage: number;
};

export type WorkflowVideoAutoOperationSelection =
  | { operation: VideoGenerationOperation; autoReason: string; blockedReason?: undefined }
  | { operation?: undefined; autoReason?: undefined; blockedReason: string };

/**
 * One-click story runs must not dead-end on a manual mode pick: resolve the
 * best operation the model's declared primary capability (intentPolicy) can
 * deliver for the available materials. Keyframe-primary models get
 * keyframes-to-video (end shot degrades gracefully to image-to-video in the
 * snapshot phase). Reference-set models get reference-to-video for better
 * multi-shot consistency. First-last-frame is never auto-selected because the
 * last shot has no following shot.
 */
export function autoWorkflowVideoOperationForMaterials({
  capability,
  materials,
}: {
  capability: ResolvedVideoModelCapability;
  materials: WorkflowVideoAutoMaterials;
}): WorkflowVideoAutoOperationSelection {
  const options = workflowVideoOperationsForCapability(capability);
  const label = `${capability.providerLabel} / ${capability.model || "未命名模型"}`;
  const optionLabels = options.map((value) => OPERATION_LABELS[value]).join("、") || "无";
  if (!options.length) {
    return { blockedReason: `${label}: 当前 provider/model 没有适用于 Story 工作流的已验证 operation` };
  }
  const has = (operation: VideoGenerationOperation) => options.includes(operation);
  if (materials.shotsWithImage > 0) {
    // 1. 关键帧序列模型（Agnes v2 等，intentPolicy="keyframes"）：优先关键帧模式，
    //    每镜按上限分配时序图；末镜凑不齐下限时由参数快照阶段自动降级为首帧图生视频。
    if (
      capability.intentPolicy === "keyframes" &&
      capability.supportsKeyframeSequence &&
      has("keyframes-to-video")
    ) {
      const min = typeof capability.keyframeImageMinimum === "number" ? capability.keyframeImageMinimum : 2;
      const max = typeof capability.keyframeImageLimit === "number" ? capability.keyframeImageLimit : min;
      if (materials.totalShots >= min) {
        return {
          operation: "keyframes-to-video",
          autoReason: `已按模型能力自动选择：${label} 支持最多 ${max} 张关键帧，每镜分配对应数量；末镜凑不齐下限时自动降级为首帧图生视频`,
        };
      }
    }
    // 2. 帧+参考集模型（Seedance-2 等，intentPolicy="frames-or-reference-set"）：优先
    //    多参考图模式，利用多个故事分镜图提升角色/场景一致性。
    if (
      capability.intentPolicy === "frames-or-reference-set" &&
      has("reference-to-video")
    ) {
      return {
        operation: "reference-to-video",
        autoReason: `已按模型能力自动选择：${label} 支持多参考图，使用多参考素材生视频以提升分镜一致性`,
      };
    }
    // 3. 首帧模型（i2v / single-frame 等）：使用首帧图生视频。
    if (has("image-to-video")) {
      return {
        operation: "image-to-video",
        autoReason: `已按素材自动选择：${materials.shotsWithImage}/${materials.totalShots} 镜带有分镜图，使用首帧图生视频`,
      };
    }
    // 4. 兜底：参考图模式。
    if (has("reference-to-video")) {
      return {
        operation: "reference-to-video",
        autoReason: `已按素材自动选择：${materials.shotsWithImage}/${materials.totalShots} 镜带有分镜图，使用多参考素材生视频`,
      };
    }
    // 5. 仅首尾帧合同（如 Wan KF2V）：相邻镜成对打包，剩余单镜单独成窗，
    //    生成期由真实合同提示缺尾帧，不垫假帧。
    if (has("first-last-frame-to-video")) {
      return {
        operation: "first-last-frame-to-video",
        autoReason: `已按模型能力自动选择：${label} 合同仅支持首尾帧生视频，按相邻镜成对打包；剩余单镜生成时会提示缺少尾帧`,
      };
    }
    return {
      blockedReason: `${label}: ${materials.shotsWithImage}/${materials.totalShots} 镜已带分镜图，但当前模型合同仅支持「${optionLabels}」，无法使用分镜图；请更换支持首帧图生视频/参考素材的模型，或移除分镜图`,
    };
  }
  if (has("text-to-video")) {
    return {
      operation: "text-to-video",
      autoReason: "已按素材自动选择：分镜尚无图片，使用文生视频",
    };
  }
  return {
    blockedReason: `${label}: 当前模型合同仅支持「${optionLabels}」，不支持纯文生视频；请先生成分镜图片，或更换支持文生视频的模型`,
  };
}

/**
 * Standalone video nodes have no operation picker. Persist and reuse the
 * model's auto-selected operation so settings, connection purposes, and
 * generate all see the same contract. A saved operation wins only when it
 * remains valid for the current capability; otherwise re-derive from materials.
 */
export function resolveStandaloneVideoOperation({
  capability,
  persistedOperation,
  hasConnectedImage,
}: {
  capability: ResolvedVideoModelCapability | undefined;
  persistedOperation?: VideoGenerationOperation;
  hasConnectedImage: boolean;
}): VideoGenerationOperation | undefined {
  if (!capability) return undefined;
  const options = workflowVideoOperationsForCapability(capability);
  const persistedStillValid = persistedOperation && options.some(op => op === persistedOperation);
  if (persistedStillValid) return persistedOperation;
  return autoWorkflowVideoOperationForMaterials({
    capability,
    materials: { totalShots: 1, shotsWithImage: hasConnectedImage ? 1 : 0 },
  }).operation || options[0];
}

/**
 * Returns reasons why auto mode skipped certain operations. Keyframes is only
 * listed as skipped for models whose primary capability is NOT keyframes —
 * for keyframes-primary models, auto now selects keyframes directly.
 */
export function workflowVideoAutoSkippedOperationReasons(
  capability: ResolvedVideoModelCapability,
): string[] {
  const options = workflowVideoOperationsForCapability(capability);
  const reasons: string[] = [];
  if (
    options.includes("keyframes-to-video") &&
    !(capability.intentPolicy === "keyframes" && capability.supportsKeyframeSequence)
  ) {
    const min = typeof capability.keyframeImageMinimum === "number" ? capability.keyframeImageMinimum : 2;
    const max = typeof capability.keyframeImageLimit === "number" ? capability.keyframeImageLimit : min;
    reasons.push(
      `「${OPERATION_LABELS["keyframes-to-video"]}」要求每镜 ${min}–${max} 张时序图，末镜只有自己的分镜图、达不到下限，自动模式不会选择它；需要时请手动切换`,
    );
  }
  if (options.includes("first-last-frame-to-video")) {
    reasons.push(
      `「${OPERATION_LABELS["first-last-frame-to-video"]}」要求每镜同时提供当前镜与下一镜两张图，末镜没有下一镜，自动模式不会选择它；需要时请手动切换`,
    );
  }
  return reasons;
}

function workflowVideoOperationsForCapability(
  capability: ResolvedVideoModelCapability,
): VideoGenerationOperation[] {
  if (capability.supportedOperations?.length) {
    return [...capability.supportedOperations];
  }
  if (capability.requiresFirstLastFrame) {
    return ["first-last-frame-to-video"];
  }
  const operations: VideoGenerationOperation[] = [];
  const append = (operation: VideoGenerationOperation) => {
    if (!operations.includes(operation)) operations.push(operation);
  };

  if (
    capability.intentPolicy === "none" ||
    (capability.allowedReferenceIntentKinds?.includes("none") &&
      !(capability.videoInputPolicy.supported && capability.videoInputPolicy.min > 0))
  ) append("text-to-video");
  if (
    capability.intentPolicy === "single-frame" ||
    capability.intentPolicy === "i2v" ||
    capability.intentPolicy === "keyframes" ||
    capability.intentPolicy === "frames-or-reference-set" ||
    capability.intentPolicy === "reference-set-with-frames"
  ) {
    if (capability.supportsFirstFrame) append("image-to-video");
  }
  if (capability.supportsFirstLastFrame) append("first-last-frame-to-video");
  if (capability.supportsKeyframeSequence) append("keyframes-to-video");
  if (
    capability.referenceImagePolicy.supported &&
    capability.intentPolicy !== "i2v" &&
    capability.intentPolicy !== "single-frame" &&
    capability.intentPolicy !== "keyframes"
  ) {
    append("reference-to-video");
  }
  if (
    capability.videoInputPolicy.supported &&
    capability.videoInputPolicy.uses.includes("first_clip")
  ) {
    append("continuation");
  }
  if (
    capability.videoInputPolicy.supported &&
    capability.videoInputPolicy.uses.includes("source_video")
  ) {
    append("video-edit");
  }
  return operations;
}
