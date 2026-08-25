import type {
  CanvasConnection,
  CanvasImageOperation,
  CanvasNodeData,
  CanvasNodeMetadata,
} from "../types";
import { readCivitaiCatalogServiceSnapshot } from "@/services/api/civitai-client";

export type StoryImageWorkflow = "character" | "shot";

export type StoryImageGenerationSource = {
  kind: "config" | "global";
  node: CanvasNodeData;
};

export type StoryImageOperationAuthority =
  | {
      readonly status: "resolved";
      readonly operation: CanvasImageOperation;
      readonly source:
        | "metadata"
        | "legacy-metadata"
        | "persisted-delivery"
        | "civitai-service";
    }
  | {
      readonly status: "unresolved";
      readonly reason: string;
    };

type StoryImageOperationAuthorityInput = {
  readonly sourceKind?: "config" | "global";
  readonly provider?: { readonly id?: string; readonly adapterType?: string };
  readonly providerId?: string;
  readonly model?: string;
  readonly metadata?: Pick<CanvasNodeMetadata, "imageOperation" | "generationType">;
  readonly persistedDeliveries?: readonly {
    readonly route?: {
      readonly providerId?: string;
      readonly model?: string;
    };
    readonly operation?: CanvasImageOperation;
  }[];
  readonly persistedDelivery?: {
    readonly route?: {
      readonly providerId?: string;
      readonly model?: string;
    };
    readonly operation?: CanvasImageOperation;
  };
};

const STORY_IMAGE_OPERATION_UNRESOLVED_REASON =
  "缺少精确图片 operation 权威，已阻止按引用数量猜测 generate/edit";
const STORY_IMAGE_OPERATION_CONFLICT_REASON =
  "同一 provider/model 路由存在冲突的已保存图片 operation，已阻止选择任一 operation";

function isStoryImageOperation(value: unknown): value is CanvasImageOperation {
  return value === "generate" || value === "edit" || value === "variation" || value === "responses-tool";
}

/**
 * Resolve Story's exact image operation before reference planning. Reference
 * count is intentionally absent from this contract: it cannot select a paid
 * provider operation. Civitai's selected service id/declared operation is the
 * only no-config inference allowed here.
 */
export function resolveStoryImageOperationAuthority(
  input: StoryImageOperationAuthorityInput,
): StoryImageOperationAuthority {
  if (isStoryImageOperation(input.metadata?.imageOperation)) {
    return { status: "resolved", operation: input.metadata.imageOperation, source: "metadata" };
  }
  if (input.metadata?.generationType === "edit") {
    return { status: "resolved", operation: "edit", source: "legacy-metadata" };
  }
  if (input.metadata?.generationType === "generation") {
    return { status: "resolved", operation: "generate", source: "legacy-metadata" };
  }

  const providerId = String(input.providerId || input.provider?.id || "").trim();
  const model = String(input.model || "").trim();
  const persistedCandidates = [
    ...(input.persistedDeliveries || []),
    ...(input.persistedDelivery ? [input.persistedDelivery] : []),
  ].filter(
    (delivery) =>
      delivery.route?.providerId === providerId &&
      delivery.route.model === model &&
      isStoryImageOperation(delivery.operation),
  );
  const persistedOperations = [...new Set(persistedCandidates.map((delivery) => delivery.operation))];
  if (persistedOperations.length === 1) {
    return {
      status: "resolved",
      operation: persistedOperations[0]!,
      source: "persisted-delivery",
    };
  }
  if (persistedOperations.length > 1) {
    return { status: "unresolved", reason: STORY_IMAGE_OPERATION_CONFLICT_REASON };
  }

  if (input.sourceKind !== "config" && input.provider?.adapterType === "civitai-orchestration" && model) {
    const service = readCivitaiCatalogServiceSnapshot(model, { providerId });
    if (service?.step === "imageGen") {
      const declared = String(service.parameters.operation || "").trim().toLowerCase();
      if (declared === "editimage") {
        return { status: "resolved", operation: "edit", source: "civitai-service" };
      }
      if (declared === "createvariant") {
        return { status: "resolved", operation: "variation", source: "civitai-service" };
      }
      // Civitai imageGen services without an operation discriminator (for
      // example Seedream, Imagen, and Kontext aliases) are createImage
      // services; optional images remain an ordered generate input.
      if (!declared || declared === "createimage") {
        return { status: "resolved", operation: "generate", source: "civitai-service" };
      }
    }
  }

  return { status: "unresolved", reason: STORY_IMAGE_OPERATION_UNRESOLVED_REASON };
}

/** Locate the connected Story-specific image config that owns a generation run. */
export function resolveStoryImageConfigNode(
  storyDirectorId: string,
  workflow: StoryImageWorkflow,
  nodes: readonly CanvasNodeData[],
  connections: readonly CanvasConnection[],
): CanvasNodeData | undefined {
  const connectedConfigIds = new Set(
    connections
      .filter((connection) => connection.fromNodeId === storyDirectorId)
      .map((connection) => connection.toNodeId),
  );
  const candidates = nodes.filter(
    (node) =>
      node.type === "config" &&
      connectedConfigIds.has(node.id) &&
      node.metadata?.storyWorkflow === workflow,
  );
  const workflowLabel = workflow === "character" ? "角色图" : "分镜图";
  if (candidates.length > 1) {
    throw new Error(
      `故事导演连接了多个${workflowLabel}配置节点，无法唯一确定提交路由，已阻止请求`,
    );
  }
  const candidate = candidates[0];
  if (!candidate) return undefined;
  if (
    candidate.metadata?.generationMode &&
    candidate.metadata.generationMode !== "image"
  ) {
    throw new Error(`${workflowLabel}配置节点不是图片生成模式，已阻止请求`);
  }
  const model = String(candidate.metadata?.model || "").trim();
  if (!model) {
    throw new Error(
      `${workflowLabel}配置节点的 provider/model 不完整，已阻止请求`,
    );
  }
  return candidate;
}

/**
 * Resolve one source node for both provider/model routing and saved advanced
 * settings. Connected Config nodes are explicit submission state; only the
 * absence of an applicable Config inherits the global route.
 */
export function resolveStoryImageGenerationSource(
  storyDirector: CanvasNodeData,
  workflow: StoryImageWorkflow,
  nodes: readonly CanvasNodeData[],
  connections: readonly CanvasConnection[],
): StoryImageGenerationSource {
  const configNode = resolveStoryImageConfigNode(
    storyDirector.id,
    workflow,
    nodes,
    connections,
  );
  return configNode
    ? { kind: "config", node: configNode }
    : { kind: "global", node: storyDirector };
}
