import type {
  CanvasConnection,
  CharacterDerivedView,
  CanvasNodeData,
  CanvasNodeMetadata,
  Seedance2ReferenceSlotUseAs,
  StoryCharacter,
  StoryDirectorInputKind,
  StoryShot,
  VideoReferenceRole,
} from "../types";
import { CanvasNodeType } from "../types";
import type {
  AutoCharacterDerivedViewPolicy,
  ResolvedVideoModelCapability,
} from "@/services/api/video-model-capabilities";
import {
  resolveVideoReferenceSlotContract,
  type VideoReferenceNotSubmittedReasonCode,
  type VideoReferenceSubmissionOperation,
} from "@/services/api/video-reference-slot-contract";
import {
  LOCAL_SEEDANCE2_API_ENDPOINT,
  createSeedance2VideoPlaceholderMetadata,
  normalizeSeedance2Duration,
  normalizeSeedance2Resolution,
  resolveSeedance2WorkflowRatio,
  resolveSeedance2WorkflowRatioSelection,
  seedance2PlaceholderSize,
} from "./seedance2-workflow";
import type {
  Seedance2PromptRewriteInput,
  Seedance2RewrittenShot,
} from "./seedance2-prompt-rewrite";

export const STORY_SLICE_REFERENCE_ORDER = ["当前分镜图", "角色图", "场景图", "其它参考图"] as const;

export type StoryVideoRequestWindow = {
  shots: StoryShot[];
  images: CanvasNodeData[];
  prompts: string[];
  operation: VideoReferenceSubmissionOperation;
  shotIndex: number;
  shotTitle: string;
};

/** Pack storyboard images into paid-request windows by the model's real slot contract. */
export function packStoryVideoRequestWindows(options: {
  shots: StoryShot[];
  images: Array<CanvasNodeData | undefined>;
  prompts?: string[];
  operation?: VideoReferenceSubmissionOperation;
  policy: Seedance2StoryReferenceCapability;
}): StoryVideoRequestWindow[] {
  const pairs = options.shots.flatMap((shot, index) => {
    const image = options.images[index];
    if (!image) return [];
    return [{
      shot,
      image,
      prompt: options.prompts?.[index] || "",
    }];
  });
  const operation = options.operation || defaultStoryPackOperation(options.policy, pairs.length);
  const titled = (shots: StoryShot[]) => {
    const first = shots[0];
    const last = shots[shots.length - 1];
    if (!first) return "故事视频";
    if (shots.length === 1) return storyShotTitle(first);
    return `${storyShotTitle(first)}–${storyShotTitle(last || first)}`;
  };
  const windowOf = (
    items: typeof pairs,
    windowOperation: VideoReferenceSubmissionOperation,
  ): StoryVideoRequestWindow => ({
    shots: items.map((item) => item.shot),
    images: items.map((item) => item.image),
    prompts: items.map((item) => item.prompt),
    operation: windowOperation,
    shotIndex: items[0]?.shot.index || 1,
    shotTitle: titled(items.map((item) => item.shot)),
  });

  if (operation === "text-to-video") {
    return options.shots.map((shot, index) => ({
      shots: [shot],
      images: [],
      prompts: [options.prompts?.[index] || ""],
      operation,
      shotIndex: shot.index,
      shotTitle: storyShotTitle(shot),
    }));
  }
  if (operation === "image-to-video" || operation === "first-last-frame-to-video") {
    if (operation === "first-last-frame-to-video") {
      const windows: StoryVideoRequestWindow[] = [];
      for (let index = 0; index + 1 < pairs.length; index += 2) {
        windows.push(windowOf(pairs.slice(index, index + 2), operation));
      }
      // 剩余单镜不垫假尾帧：单独成窗，生成期由真实合同报「需要尾帧」。
      if (pairs.length % 2 === 1) {
        windows.push(windowOf(pairs.slice(pairs.length - 1), operation));
      }
      return windows;
    }
    return pairs.map((item) => windowOf([item], "image-to-video"));
  }
  if (operation === "keyframes-to-video") {
    const minimum = typeof options.policy.keyframeImageMinimum === "number" ? options.policy.keyframeImageMinimum : 2;
    const maximum = typeof options.policy.keyframeImageLimit === "number" ? options.policy.keyframeImageLimit : minimum;
    return packNonOverlappingWindows(pairs, minimum, maximum).map((items) => windowOf(items, "keyframes-to-video"));
  }
  if (operation === "reference-to-video") {
    const maximum = options.policy.referenceImagePolicy?.supported && typeof options.policy.referenceImagePolicy.max === "number"
      ? options.policy.referenceImagePolicy.max
      : pairs.length || 1;
    const minimum = options.policy.referenceImagePolicy?.supported && typeof options.policy.referenceImagePolicy.min === "number"
      ? options.policy.referenceImagePolicy.min
      : 1;
    return packNonOverlappingWindows(pairs, minimum, Math.max(maximum, minimum)).map((items) => windowOf(items, "reference-to-video"));
  }
  return pairs.map((item) => windowOf([item], operation));
}

function defaultStoryPackOperation(
  policy: Seedance2StoryReferenceCapability,
  imageCount: number,
): VideoReferenceSubmissionOperation {
  if (imageCount <= 0) return "text-to-video";
  if (policy.requiresFirstLastFrame) return "first-last-frame-to-video";
  if (policy.intentPolicy === "none") return "text-to-video";
  if (policy.intentPolicy === "keyframes" && policy.supportsKeyframeSequence) return "keyframes-to-video";
  if (policy.intentPolicy === "frames-or-reference-set" || policy.intentPolicy === "reference-set" || policy.intentPolicy === "r2v-with-first") {
    return "reference-to-video";
  }
  return "image-to-video";
}

function packNonOverlappingWindows<T>(items: T[], minimum: number, maximum: number): T[][] {
  const windows: T[][] = [];
  let cursor = 0;
  while (cursor < items.length) {
    const remaining = items.length - cursor;
    if (remaining < minimum) {
      if (windows.length && windows[windows.length - 1].length + remaining <= maximum) {
        windows[windows.length - 1].push(...items.slice(cursor));
      }
      break;
    }
    let size = Math.min(maximum, remaining);
    const leftover = remaining - size;
    if (leftover > 0 && leftover < minimum) {
      const reduced = remaining - minimum;
      if (reduced >= minimum) size = reduced;
      else if (remaining <= maximum) size = remaining;
    }
    windows.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return windows;
}

export type StoryShotSemanticReference = {
  node: CanvasNodeData;
  role: VideoReferenceRole;
  label: string;
  entityId?: string;
  useAs: Seedance2ReferenceSlotUseAs;
  referenceAssetId?: string;
  referenceAssetStorageKey?: string;
  sourceConnectionId?: string;
};

export type Seedance2StoryReferenceCapability = Pick<
  ResolvedVideoModelCapability,
  | "id"
  | "intentPolicy"
  | "referenceImagePolicy"
  | "autoCharacterDerivedViewPolicy"
  | "storyAutoReferencePolicy"
  | "supportsFirstFrame"
  | "supportsFirstLastFrame"
  | "supportsKeyframeSequence"
  | "keyframeImageMinimum"
  | "keyframeImageLimit"
  | "supportsReferenceSetWithFirst"
  | "supportsReferenceSetWithFrames"
  | "requiresFirstLastFrame"
  | "requiresExplicitProfile"
  | "referenceContractBlockReason"
  | "videoInputPolicy"
  | "sharedImageVideoMaximum"
> & {
  generationParameters?: ResolvedVideoModelCapability["generationParameters"];
};

export type Seedance2StoryReferencePrefillPolicy = Pick<
  Seedance2StoryReferenceCapability,
  "intentPolicy" | "referenceImagePolicy" | "autoCharacterDerivedViewPolicy" | "storyAutoReferencePolicy"
> & Partial<Omit<Seedance2StoryReferenceCapability, "intentPolicy" | "referenceImagePolicy" | "autoCharacterDerivedViewPolicy" | "storyAutoReferencePolicy">>;

type StoryReferencePlan = {
  /** Provider-independent candidates. */
  references: StoryShotSemanticReference[];
  /** Current provider/model/operation delivery plan. */
  submitted: StoryShotSemanticReference[];
  /** References the canvas wires: `submitted` when an operation is resolved, otherwise the policy-filtered candidates (legacy no-scope placeholders). */
  drawable: StoryShotSemanticReference[];
  notSubmitted: Array<{
    reference: StoryShotSemanticReference;
    reasonCode: VideoReferenceNotSubmittedReasonCode;
    reason: string;
  }>;
  omittedCount: number;
  contractState: "known" | "blocked" | "unbounded";
  contractReason?: string;
  notice?: string;
};

export type StorySliceBuildResult = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  storyDirector?: CanvasNodeData;
  missingCurrentShotIndexes: number[];
};

export type VersionedStorySliceBuildResult = StorySliceBuildResult & {
  createdNodes: CanvasNodeData[];
  createdConnections: CanvasConnection[];
  setVersion: number;
};

export type Seedance2StoryPromptContext = {
  storyTitle?: string;
  storySummary?: string;
  characters?: string[];
  plotPosition?: string;
  characterState?: string;
};

export type Seedance2StoryDirectorSourceResolution = {
  status: "connected" | "bound" | "suggested" | "ambiguous" | "missing";
  source?: CanvasNodeData;
};

export function seedance2StoryShotCountDisplay(
  resolution: Seedance2StoryDirectorSourceResolution,
) {
  const count = resolution.source?.metadata?.storyShots?.length || 0;
  return {
    count,
    label: resolution.source ? `${count} 镜 · 跟随故事导演` : "0 镜 · 等待绑定",
  };
}

export function resolveSeedance2StoryDirectorSource(
  workflowNode: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
): Seedance2StoryDirectorSourceResolution {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connectedSources = new Map<string, CanvasNodeData>();
  for (const connection of connections) {
    if (connection.toNodeId !== workflowNode.id) continue;
    const source = nodeById.get(connection.fromNodeId);
    if (source?.type === CanvasNodeType.StoryDirector) connectedSources.set(source.id, source);
  }
  if (connectedSources.size > 1) return { status: "ambiguous" };
  if (connectedSources.size === 1) {
    return { status: "connected", source: [...connectedSources.values()][0] };
  }

  const metadataSourceId = workflowNode.metadata?.seedanceStoryDirectorNodeId;
  const metadataSource = metadataSourceId ? nodeById.get(metadataSourceId) : undefined;
  if (metadataSource?.type === CanvasNodeType.StoryDirector) {
    return { status: "bound", source: metadataSource };
  }

  const storyDirectors = nodes.filter((node) => node.type === CanvasNodeType.StoryDirector);
  if (storyDirectors.length === 1) return { status: "suggested", source: storyDirectors[0] };
  return { status: storyDirectors.length > 1 ? "ambiguous" : "missing" };
}

export function findSeedance2StoryDirectorSource(
  workflowNode: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
): CanvasNodeData | undefined {
  return resolveSeedance2StoryDirectorSource(workflowNode, nodes, connections).source;
}

export function bindSeedance2StoryDirectorSource(options: {
  workflowNode: CanvasNodeData;
  storyDirector: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
}) {
  const { workflowNode, storyDirector, nodes, connections } = options;
  if (workflowNode.type !== CanvasNodeType.Seedance2Workflow) {
    throw new Error("只能为 Seedance2 工作流绑定故事导演");
  }
  if (storyDirector.type !== CanvasNodeType.StoryDirector) {
    throw new Error("Seedance2 工作流来源必须是故事导演");
  }
  const boundWorkflow: CanvasNodeData = {
    ...workflowNode,
    metadata: {
      ...workflowNode.metadata,
      seedanceStoryDirectorNodeId: storyDirector.id,
      ...((storyDirector.metadata?.storyShots?.length || 0) > 0
        ? { seedanceShotCount: storyDirector.metadata?.storyShots?.length }
        : {}),
    },
  };
  const nextNodes = nodes.map((node) => node.id === workflowNode.id ? boundWorkflow : node);
  const hasVisibleEdge = connections.some(
    (connection) => connection.fromNodeId === storyDirector.id && connection.toNodeId === workflowNode.id,
  );
  if (hasVisibleEdge) return { nodes: nextNodes, connections, workflowNode: boundWorkflow };
  const usedIds = new Set(connections.map((connection) => connection.id));
  const connectionId = uniqueId(
    `conn-seedance2-story-source-${safeIdPart(storyDirector.id)}-${safeIdPart(workflowNode.id)}`,
    usedIds,
  );
  return {
    nodes: nextNodes,
    connections: [
      ...connections,
      { id: connectionId, fromNodeId: storyDirector.id, toNodeId: workflowNode.id },
    ],
    workflowNode: boundWorkflow,
  };
}

export function commitSeedance2PlaceholderSetAtomic(options: {
  workflowNodeId: string;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  built: Pick<VersionedStorySliceBuildResult, "createdNodes" | "createdConnections">;
  sessionActive: boolean;
  workflowMetadataPatch?: Partial<CanvasNodeMetadata>;
}):
  | { status: "stale-session"; nodes: CanvasNodeData[]; connections: CanvasConnection[] }
  | { status: "committed"; nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
  if (!options.sessionActive) {
    return { status: "stale-session", nodes: options.nodes, connections: options.connections };
  }
  const orderedCreatedNodes = [...options.built.createdNodes].sort(
    (left, right) =>
      Number(left.metadata?.seedanceStoryShotIndex || 0) -
      Number(right.metadata?.seedanceStoryShotIndex || 0),
  );
  if (
    !orderedCreatedNodes.length ||
    orderedCreatedNodes.some(
      (node) =>
        node.metadata?.seedanceWorkflowRole !== "placeholder" ||
        Number(node.metadata?.seedanceStoryShotIndex || 0) <= 0,
    )
  ) {
    throw new Error("Seedance2 视频占位框集合不完整，未写入画布");
  }
  const createdIds = new Set(orderedCreatedNodes.map((node) => node.id));
  if (createdIds.size !== orderedCreatedNodes.length) {
    throw new Error("Seedance2 视频占位框集合包含重复节点，未写入画布");
  }
  // A refresh supersedes this workflow's earlier placeholder sets: remove the
  // ones still safe to reconcile (idle/pending/failed, no content or task) so
  // the canvas keeps exactly one set. Paid/in-flight/completed placeholders
  // keep their immutable snapshot and are never removed here.
  const supersededIds = new Set(
    options.nodes
      .filter(
        (node) =>
          isStoryPlaceholderForWorkflow(node, options.workflowNodeId) &&
          !createdIds.has(node.id) &&
          storyPlaceholderCanReconcile(node),
      )
      .map((node) => node.id),
  );
  const existingIds = new Set(
    options.nodes.filter((node) => !supersededIds.has(node.id)).map((node) => node.id),
  );
  const nextNodes = options.nodes
    .filter((node) => !supersededIds.has(node.id))
    .map((node) =>
      node.id === options.workflowNodeId && options.workflowMetadataPatch
        ? { ...node, metadata: { ...node.metadata, ...options.workflowMetadataPatch } }
        : node,
    );
  for (const node of orderedCreatedNodes) {
    if (!existingIds.has(node.id)) {
      nextNodes.push(node);
      existingIds.add(node.id);
    }
  }
  const nextConnections = options.connections.filter(
    (connection) => !supersededIds.has(connection.fromNodeId) && !supersededIds.has(connection.toNodeId),
  );
  const connectionKeys = new Set(nextConnections.map(connectionEndpointKey));
  for (const connection of options.built.createdConnections) {
    const key = connectionEndpointKey(connection);
    if (connectionKeys.has(key)) continue;
    nextConnections.push(connection);
    connectionKeys.add(key);
  }
  return { status: "committed", nodes: nextNodes, connections: nextConnections };
}

export function buildSeedance2StoryShotPrompt(
  shot: StoryShot,
  context: Seedance2StoryPromptContext = {},
): string {
  const storyTitle = stringValue(context.storyTitle) || "当前故事";
  const shotContent = stringValue(shot.visualContent) || stringValue(shot.imagePrompt) || stringValue(shot.title) || `第${shot.index}镜`;
  const storySummary = stringValue(context.storySummary) || shotContent;
  const action = stringValue(shot.action);
  const camera = stringValue(shot.camera) || "电影感中景";
  const emotion = stringValue(shot.emotion);
  const voiceover = stringValue(shot.voiceover) || "无";
  const characters = (context.characters || []).map(stringValue).filter(Boolean).join("、") || "无明确角色";
  const plotPosition = stringValue(context.plotPosition) || `第 ${shot.index} 镜`;
  const characterState = stringValue(context.characterState) || emotion || "按当前分镜状态";

  return `【故事背景】
这是《${storyTitle}》中的第 ${shot.index} 镜。
故事讲述：${storySummary}

【本镜头内容】
本镜头讲述：${shotContent}
当前剧情进展：${plotPosition}

【首帧画面】
以当前分镜图作为首帧，画面中包含：${shotContent}
若无分镜图，则以场景图作为首帧。

【出场角色】
本镜头出场角色：${characters}
角色当前状态：${characterState}

【画面动作】
${action}

【镜头运动】
${camera}

【情绪氛围】
${emotion}

【对白/表演】
${voiceover}

画面无字幕`;
}

export function seedance2UserPromptPatch(
  prompt: string,
): Pick<CanvasNodeMetadata, "prompt" | "seedancePromptEditedByUser"> {
  return {
    prompt,
    seedancePromptEditedByUser: true,
  };
}

export function seedance2RegeneratePromptPatch(
  metadata: CanvasNodeMetadata | undefined,
): Pick<CanvasNodeMetadata, "prompt" | "seedancePromptEditedByUser"> {
  return {
    prompt: stringValue(metadata?.seedanceAutoPrompt) || stringValue(metadata?.prompt),
    seedancePromptEditedByUser: false,
  };
}

export function buildStoryDirectorSlicePlaceholders(options: {
  workflowNode: CanvasNodeData;
  storyDirector?: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  now?: number;
  capability?: Seedance2StoryReferenceCapability;
  referencePolicy?: Seedance2StoryReferencePrefillPolicy;
}): StorySliceBuildResult {
  const { workflowNode, nodes, connections } = options;
  const storyDirector =
    options.storyDirector?.type === CanvasNodeType.StoryDirector
      ? options.storyDirector
      : findSeedance2StoryDirectorSource(workflowNode, nodes, connections);

  if (!storyDirector) {
    return { nodes, connections, storyDirector: undefined, missingCurrentShotIndexes: [] };
  }

  const shots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  if (!shots.length) {
    return { nodes, connections, storyDirector, missingCurrentShotIndexes: [] };
  }
  assertStoryVideoPlaceholderCapability(options.capability, options.referencePolicy);

  const now = options.now ?? Date.now();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const existingPlaceholderByShotIndex = existingSeedancePlaceholdersByShotIndex(workflowNode, nodes);
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const workflowMetadata = workflowNode.metadata || {};
  const ratio = resolveSeedance2WorkflowRatio({
    storedRatio: workflowMetadata.seedanceRatio || workflowMetadata.size,
    selection: resolveSeedance2WorkflowRatioSelection({
      selection: workflowMetadata.seedanceRatioSelection,
      inheritSourceRatio: workflowMetadata.seedanceInheritSourceRatio,
      ratioTouched: workflowMetadata.seedanceRatioTouched,
    }),
    upstreamRatio: storyDirector.metadata?.storyAspectRatio,
  });
  const duration = normalizeSeedance2Duration(workflowMetadata.seedanceDuration || workflowMetadata.seconds);
  const resolution = normalizeSeedance2Resolution(workflowMetadata.seedanceResolution || workflowMetadata.vquality);
  const model = workflowMetadata.seedanceModel || workflowMetadata.model || "";
  const apiEndpoint = workflowMetadata.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const generateCount = 1;
  const videoSize = seedance2PlaceholderSize(ratio);
  const nextNodes: CanvasNodeData[] = [];
  const placeholderConnections: CanvasConnection[] = [];
  const missingCurrentShotIndexes: number[] = [];
  const updatedNodesById = new Map<string, CanvasNodeData>();
  const policy = resolveStoryReferencePrefillPolicy(options.capability, options.referencePolicy);
  const shotImages = shots.map((shot) => {
    const currentShotCandidate = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    const currentShot = currentShotCandidate && imageReferenceValue(currentShotCandidate) ? currentShotCandidate : undefined;
    if (!currentShot) missingCurrentShotIndexes.push(shot.index);
    return currentShot;
  });
  const requestWindows = packStoryVideoRequestWindows({
    shots,
    images: shotImages,
    operation: storyReferenceSubmissionOperation(workflowMetadata),
    policy,
  });

  requestWindows.forEach((window, orderIndex) => {
    const shot = window.shots[0];
    if (!shot) return;
    const shotTitle = window.shotTitle;
    const currentShot = window.images[0];
    const existingPlaceholder = existingPlaceholderByShotIndex.get(window.shotIndex);
    const placeholderId =
      existingPlaceholder?.id ||
      uniqueId(
        `video-seedance2-story-${safeIdPart(workflowNode.id)}-${safeIdPart(shot.id || String(window.shotIndex))}-${now}`,
        existingNodeIds,
      );
    existingNodeIds.add(placeholderId);

    // Paid/in-flight/completed placeholders own an immutable provider and
    // reference snapshot. A workflow refresh may only update idle placeholders.
    if (existingPlaceholder && !storyPlaceholderCanReconcile(existingPlaceholder)) {
      updatedNodesById.set(existingPlaceholder.id, existingPlaceholder);
      return;
    }

    const windowScope = workflowMetadata.videoGenerationScope
      ? { ...workflowMetadata.videoGenerationScope, operation: window.operation }
      : { providerId: "", model: "", operation: window.operation };
    const referencePlan = referenceNodesForShot({
      shot,
      packedShots: window.shots,
      storyDirector,
      nodeById,
      connections,
      currentShot,
      packedImages: window.images,
      targetNodeId: placeholderId,
      policy,
      operation: window.operation,
    });
    const storyMetadata = buildStoryPlaceholderMetadata({
      workflowNode,
      storyDirector,
      shot,
      shotTitle,
      currentShot,
      generatedPrompt: window.shots
        .map((item) => buildSeedance2StoryShotPrompt(item, storyPromptContext(item, storyDirector)))
        .filter(Boolean)
        .join("\n\n"),
      referencePlan,
    });
    const baseMetadata = createSeedance2VideoPlaceholderMetadata({
      mode: "slice",
      model,
      ratio,
      duration,
      resolution,
      generateCount,
      apiProvider: "local",
      apiEndpoint,
      workflowNodeId: workflowNode.id,
      shotIndex: window.shotIndex,
      shotTitle,
      prompt: storyMetadata.seedanceAutoPrompt || buildSeedance2StoryShotPrompt(shot),
      referenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    });
    const metadata = mergePlaceholderMetadata(
      existingPlaceholder?.metadata,
      {
        ...baseMetadata,
        ...workflowVideoGenerationSnapshot(workflowMetadata),
        videoGenerationScope: windowScope,
      },
      storyMetadata,
      { ...workflowMetadata, videoGenerationScope: windowScope },
    );
    const placeholder: CanvasNodeData = existingPlaceholder
      ? {
          ...existingPlaceholder,
          type: CanvasNodeType.Video,
          title: existingPlaceholder.title || `${shotTitle} Seedance2 视频`,
          width: existingPlaceholder.width,
          height: existingPlaceholder.height,
          metadata,
        }
      : {
          id: placeholderId,
          type: CanvasNodeType.Video,
          title: `${shotTitle} Seedance2 视频`,
          position: placeholderPosition(workflowNode, videoSize, orderIndex),
          width: videoSize.width,
          height: videoSize.height,
          metadata,
        };

    updatedNodesById.set(placeholder.id, placeholder);

    placeholderConnections.push({
      id: storyControllerConnectionId(workflowNode.id, placeholder.id),
      fromNodeId: workflowNode.id,
      toNodeId: placeholder.id,
    });
    appendStoryReferenceConnections(placeholderConnections, workflowNode.id, placeholder.id, referencePlan);
  });

  nodes.forEach((node) => {
    nextNodes.push(updatedNodesById.get(node.id) || node);
  });
  updatedNodesById.forEach((node) => {
    if (!nodeById.has(node.id)) nextNodes.push(node);
  });

  const candidateConnections = [...connections];
  const connectionKeys = new Set(connections.map(connectionEndpointKey));
  placeholderConnections.forEach((connection) => {
    const key = connectionEndpointKey(connection);
    if (connectionKeys.has(key)) return;
    candidateConnections.push(connection);
    connectionKeys.add(key);
  });
  const nextConnections = reconcileSeedance2StoryPlaceholderReferences({
    nodes: nextNodes,
    connections: candidateConnections,
    capability: options.capability,
    referencePolicy: options.referencePolicy,
  });

  return {
    nodes: nextNodes,
    connections: nextConnections,
    storyDirector,
    missingCurrentShotIndexes,
  };
}

export function collectSeedance2StoryRewriteInput(options: {
  storyDirector: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  template: string;
  shotId?: string;
  shotIndex?: number;
}): Seedance2PromptRewriteInput {
  const { storyDirector, nodes, connections } = options;
  const storyValue = storyDirector.metadata?.storyText ?? storyDirector.metadata?.content ?? "";
  const story = typeof storyValue === "string" ? storyValue : "";
  if (!story.trim()) throw new Error("Seedance2 整批改写缺少完整故事内容");
  const allStoryShots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  const requestedShotId = stringValue(options.shotId);
  const requestedShotIndex = positiveInteger(options.shotIndex);
  const requestedShot =
    allStoryShots.find((shot) => requestedShotId && shot.id === requestedShotId) ||
    allStoryShots.find((shot) => requestedShotIndex && shot.index === requestedShotIndex);
  const storyShots = requestedShotId || requestedShotIndex
    ? (requestedShot ? [requestedShot] : [])
    : allStoryShots;
  if (!storyShots.length) throw new Error("Seedance2 整批改写没有可用分镜");
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const shots = storyShots.map((shot) => {
    const currentShot = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    if (!currentShot) throw new Error(`Seedance2 第 ${shot.index} 镜缺少当前分镜图`);
    const currentPrompt = typeof currentShot.metadata?.prompt === "string" ? currentShot.metadata.prompt : "";
    const storyContext = {
      sceneId: stringValue(shot.sceneId) || undefined,
      appearingCharacterIds: Array.isArray(shot.appearingCharacterIds) ? shot.appearingCharacterIds : [],
      excludedCharacterIds: Array.isArray(shot.excludedCharacterIds) ? shot.excludedCharacterIds : [],
      action: stringValue(shot.action),
      camera: stringValue(shot.camera),
      emotion: stringValue(shot.emotion) || undefined,
      continuityNote: stringValue(shot.continuityNote) || undefined,
      characterState: stringValue(shot.characterState) || undefined,
      visualContent: stringValue(shot.visualContent) || undefined,
      voiceover: stringValue(shot.voiceover) || undefined,
      imagePrompt: stringValue(shot.imagePrompt),
      finalPrompt: stringValue(shot.finalPrompt) || undefined,
    };
    const hasStoryContext = Object.values(storyContext).some((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    );
    return {
      shotId: shot.id,
      shotIndex: shot.index,
      title: storyShotTitle(shot),
      sourceImageNodeId: currentShot.id,
      sourceImage: imageReferenceValue(currentShot),
      currentPrompt,
      ...(hasStoryContext ? { storyContext } : {}),
    };
  });
  return { story, shots, template: options.template };
}

export function createSeedance2SequentialPlaceholderRun(options: {
  rewrittenShots: Seedance2RewrittenShot[];
  startShotIndex?: number;
  appendShot: (shot: Seedance2RewrittenShot) => unknown;
}) {
  const ordered = [...options.rewrittenShots].sort((left, right) => left.shotIndex - right.shotIndex);
  const startShotIndex = options.startShotIndex ?? ordered[0]?.shotIndex ?? 1;
  const createdShotIndexes: number[] = [];

  for (const shot of ordered) {
    if (shot.shotIndex < startShotIndex) continue;
    try {
      options.appendShot(shot);
      createdShotIndexes.push(shot.shotIndex);
    } catch (error) {
      return {
        createdShotIndexes,
        nextShotIndex: shot.shotIndex,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  return {
    createdShotIndexes,
    nextShotIndex: null,
    error: null,
  };
}

export function buildVersionedStoryDirectorSlicePlaceholders(options: {
  workflowNode: CanvasNodeData;
  storyDirector: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  rewrittenShots: Seedance2RewrittenShot[];
  rewriteModel: string;
  rewriteTemplate: string;
  now?: number;
  capability?: Seedance2StoryReferenceCapability;
  referencePolicy?: Seedance2StoryReferencePrefillPolicy;
}): VersionedStorySliceBuildResult {
  const { workflowNode, storyDirector, nodes, connections } = options;
  if (storyDirector.type !== CanvasNodeType.StoryDirector) {
    throw new Error("Seedance2 整批改写缺少故事导演来源");
  }

  const shots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  if (!shots.length) throw new Error("Seedance2 整批改写没有可用分镜");
  assertStoryVideoPlaceholderCapability(options.capability, options.referencePolicy);

  const rewrittenByShot = new Map<string, Seedance2RewrittenShot>();
  options.rewrittenShots.forEach((shot) => {
    rewrittenByShot.set(shot.shotId || `index:${shot.shotIndex}`, shot);
    rewrittenByShot.set(`index:${shot.shotIndex}`, shot);
  });
  const rewrittenInOrder = shots.map((shot) => {
    const rewritten = rewrittenByShot.get(shot.id) || rewrittenByShot.get(`index:${shot.index}`);
    if (!rewritten) throw new Error(`Seedance2 整批提示词缺少 ${shot.id || `第 ${shot.index} 镜`}`);
    const prompt = stringValue(rewritten.prompt);
    if (!prompt) throw new Error(`Seedance2 整批提示词中 ${shot.id || `第 ${shot.index} 镜`} 的 prompt 为空`);
    return { shot, prompt };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const currentShots = rewrittenInOrder.map(({ shot }) =>
    findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections),
  );
  const workflowMetadata = workflowNode.metadata || {};
  const policy = resolveStoryReferencePrefillPolicy(options.capability, options.referencePolicy);
  const requestWindows = packStoryVideoRequestWindows({
    shots: rewrittenInOrder.map(({ shot }) => shot),
    images: currentShots,
    prompts: rewrittenInOrder.map(({ prompt }) => prompt),
    operation: storyReferenceSubmissionOperation(workflowMetadata),
    policy,
  });
  if (!requestWindows.length) throw new Error("当前分镜图不足以按模型能力组成一次视频请求");

  const rewriteModel = stringValue(options.rewriteModel);
  if (!rewriteModel) throw new Error("Seedance2 整批改写缺少文本模型");
  const now = options.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const setVersion = nextSeedancePlaceholderSetVersion(workflowNode.id, nodes);
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const ratio = resolveSeedance2WorkflowRatio({
    storedRatio: workflowMetadata.seedanceRatio || workflowMetadata.size,
    selection: resolveSeedance2WorkflowRatioSelection({
      selection: workflowMetadata.seedanceRatioSelection,
      inheritSourceRatio: workflowMetadata.seedanceInheritSourceRatio,
      ratioTouched: workflowMetadata.seedanceRatioTouched,
    }),
    upstreamRatio: storyDirector.metadata?.storyAspectRatio,
  });
  const duration = normalizeSeedance2Duration(workflowMetadata.seedanceDuration || workflowMetadata.seconds);
  const resolution = normalizeSeedance2Resolution(workflowMetadata.seedanceResolution || workflowMetadata.vquality);
  const model = workflowMetadata.seedanceModel || workflowMetadata.model || "";
  const apiEndpoint = workflowMetadata.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const generateCount = 1;
  const videoSize = seedance2PlaceholderSize(ratio);
  const groupStartY = nextSeedancePlaceholderGroupY(workflowNode, nodes);
  const createdNodes: CanvasNodeData[] = [];
  const createdConnections: CanvasConnection[] = [];

  requestWindows.forEach((window, orderIndex) => {
    const shot = window.shots[0];
    if (!shot) return;
    const currentShot = window.images[0];
    const prompt = window.prompts.filter(Boolean).join("\n\n") || rewrittenInOrder.find((item) => item.shot.id === shot.id)?.prompt || "";
    const shotTitle = window.shotTitle;
    const placeholderId = uniqueId(
      `video-seedance2-story-${safeIdPart(workflowNode.id)}-v${setVersion}-${safeIdPart(shot.id || String(window.shotIndex))}-${now}`,
      existingNodeIds,
    );
    const windowScope = workflowMetadata.videoGenerationScope
      ? { ...workflowMetadata.videoGenerationScope, operation: window.operation }
      : { providerId: "", model: "", operation: window.operation };
    const referencePlan = referenceNodesForShot({
      shot,
      packedShots: window.shots,
      storyDirector,
      nodeById,
      connections,
      currentShot,
      packedImages: window.images,
      targetNodeId: placeholderId,
      policy,
      operation: window.operation,
    });
    const storyMetadata = buildStoryPlaceholderMetadata({
      workflowNode,
      storyDirector,
      shot,
      shotTitle,
      currentShot,
      generatedPrompt: prompt,
      referencePlan,
    });
    const baseMetadata = createSeedance2VideoPlaceholderMetadata({
      mode: "slice",
      model,
      ratio,
      duration,
      resolution,
      generateCount,
      apiProvider: "local",
      apiEndpoint,
      workflowNodeId: workflowNode.id,
      shotIndex: window.shotIndex,
      shotTitle,
      prompt,
      referenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    });
    const placeholder: CanvasNodeData = {
      id: placeholderId,
      type: CanvasNodeType.Video,
      title: `${shotTitle} Seedance2 视频 V${setVersion}`,
      position: versionedPlaceholderPosition(workflowNode, videoSize, orderIndex, groupStartY),
      width: videoSize.width,
      height: videoSize.height,
      metadata: {
        ...baseMetadata,
        ...workflowVideoGenerationSnapshot({ ...workflowMetadata, videoGenerationScope: windowScope }),
        videoGenerationScope: windowScope,
        ...storyMetadata,
        prompt,
        seedanceAutoPrompt: prompt,
        seedancePromptEditedByUser: false,
        seedancePlaceholderSetVersion: setVersion,
        seedancePromptRewriteModel: rewriteModel,
        seedancePromptRewriteTemplate: options.rewriteTemplate,
        seedancePromptRewriteCreatedAt: createdAt,
      },
    };
    createdNodes.push(placeholder);

    createdConnections.push({
      id: storyControllerConnectionId(workflowNode.id, placeholder.id),
      fromNodeId: workflowNode.id,
      toNodeId: placeholder.id,
    });
    appendStoryReferenceConnections(createdConnections, workflowNode.id, placeholder.id, referencePlan);
  });

  const nextNodes = [...nodes, ...createdNodes];
  const nextConnections = reconcileSeedance2StoryPlaceholderReferences({
    nodes: nextNodes,
    connections: [...connections, ...createdConnections],
    capability: options.capability,
    referencePolicy: options.referencePolicy,
  });
  const createdNodeIds = new Set(createdNodes.map((node) => node.id));
  const nextCreatedConnections = nextConnections.filter((connection) => createdNodeIds.has(connection.toNodeId));

  return {
    nodes: nextNodes,
    connections: nextConnections,
    storyDirector,
    missingCurrentShotIndexes: [],
    createdNodes,
    createdConnections: nextCreatedConnections,
    setVersion,
  };
}

export function findCurrentShotImageForStoryShot(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  imageNodes: CanvasNodeData[],
  connections: CanvasConnection[],
): CanvasNodeData | undefined {
  const directOutputIds = new Set(
    connections
      .filter((connection) => connection.fromNodeId === storyDirector.id)
      .map((connection) => connection.toNodeId),
  );
  const isCurrentShotMatch = (node: CanvasNodeData) =>
    isUsableImageReference(node) && storyShotIndexesFromImageNode(node).includes(shot.index);
  const bestCurrentShotMatch = (candidates: CanvasNodeData[]) => {
    const matches = candidates.filter(isCurrentShotMatch);
    return (
      matches.find((node) => {
        const indexes = storyShotIndexesFromImageNode(node);
        return indexes.length === 1 && indexes[0] === shot.index;
      }) || matches[0]
    );
  };
  const resultNodeIds = new Set(shot.resultNodeIds || []);
  const resultMatch = bestCurrentShotMatch(imageNodes.filter((node) => resultNodeIds.has(node.id)));
  if (resultMatch) return resultMatch;
  const directMatch = bestCurrentShotMatch(imageNodes.filter((node) => directOutputIds.has(node.id)));
  if (directMatch) return directMatch;
  return bestCurrentShotMatch(storyDirectorConnectedInputImageNodes(
    storyDirector,
    "story:reference",
    new Map(imageNodes.map((node) => [node.id, node])),
    connections,
  ));
}

export function storyShotIndexesFromImageNode(node: CanvasNodeData): number[] {
  const metadata = node.metadata || {};
  const rangeStart = positiveInteger(metadata.storyGrid9ShotStart);
  const rangeEnd = positiveInteger(metadata.storyGrid9ShotEnd);
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset);
  }

  const parsedIndex = parseStoryShotIndex(metadata.storyLabel) || parseStoryShotIndex(node.title);
  return parsedIndex ? [parsedIndex] : [];
}

function existingSeedancePlaceholdersByShotIndex(
  workflowNode: CanvasNodeData,
  nodes: CanvasNodeData[],
) {
  const byShotIndex = new Map<number, CanvasNodeData>();
  nodes
    .filter((node) => isStoryPlaceholderForWorkflow(node, workflowNode.id))
    .forEach((node) => {
      const shotIndex = seedancePlaceholderShotIndex(node);
      if (!shotIndex) return;
      if (!byShotIndex.has(shotIndex)) byShotIndex.set(shotIndex, node);
    });
  return byShotIndex;
}

function isStoryPlaceholderForWorkflow(node: CanvasNodeData, workflowNodeId: string) {
  return (
    node.metadata?.seedanceWorkflowNodeId === workflowNodeId &&
    node.metadata?.seedanceWorkflowRole === "placeholder"
  );
}

function seedancePlaceholderShotIndex(node: CanvasNodeData) {
  return positiveInteger(node.metadata?.seedanceStoryShotIndex) || positiveInteger(node.metadata?.seedanceShotIndex);
}

function buildStoryPlaceholderMetadata(options: {
  workflowNode: CanvasNodeData;
  storyDirector: CanvasNodeData;
  shot: StoryShot;
  shotTitle: string;
  currentShot?: CanvasNodeData;
  generatedPrompt: string;
  referencePlan: StoryReferencePlan;
}): CanvasNodeMetadata {
  return {
    seedanceWorkflowNodeId: options.workflowNode.id,
    seedanceWorkflowMode: "slice",
    seedanceWorkflowRole: "placeholder",
    seedanceShotIndex: options.shot.index,
    seedanceShotTitle: options.shotTitle,
    seedanceStoryDirectorNodeId: options.storyDirector.id,
    seedanceStoryShotId: options.shot.id,
    seedanceStoryShotIndex: options.shot.index,
    seedanceStorySourceImageNodeId: options.currentShot?.id,
    seedanceStoryPackedImageNodeIds: options.referencePlan.drawable
      .filter((reference) => reference.role === "current_shot" || reference.role === "upstream_frame")
      .map((reference) => reference.node.id)
      .filter((id, index, ids) => ids.indexOf(id) === index),
    seedanceReferenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    seedanceRequiredReferences: ["当前分镜图"],
    seedanceStoryAutoReferenceOmittedCount: options.referencePlan.omittedCount,
    ...(options.referencePlan.notice
      ? { seedanceStoryAutoReferenceNotice: options.referencePlan.notice }
      : {}),
    seedanceAutoPrompt: options.generatedPrompt,
    seedancePromptEditedByUser: false,
    seedancePromptPanelMode: "compact",
    prompt: options.generatedPrompt,
  };
}

function mergePlaceholderMetadata(
  existingMetadata: CanvasNodeMetadata | undefined,
  baseMetadata: CanvasNodeMetadata,
  storyMetadata: CanvasNodeMetadata,
  workflowMetadata: CanvasNodeMetadata,
): CanvasNodeMetadata {
  if (!existingMetadata) return { ...baseMetadata, ...storyMetadata };
  const next: CanvasNodeMetadata = { ...baseMetadata, ...storyMetadata, ...existingMetadata };
  assignDefinedMetadata(next, {
    seedanceWorkflowNodeId: storyMetadata.seedanceWorkflowNodeId,
    seedanceWorkflowMode: storyMetadata.seedanceWorkflowMode,
    seedanceWorkflowRole: storyMetadata.seedanceWorkflowRole,
    seedanceShotIndex: storyMetadata.seedanceShotIndex,
    seedanceShotTitle: storyMetadata.seedanceShotTitle,
    seedanceStoryDirectorNodeId: storyMetadata.seedanceStoryDirectorNodeId,
    seedanceStoryShotId: storyMetadata.seedanceStoryShotId,
    seedanceStoryShotIndex: storyMetadata.seedanceStoryShotIndex,
    seedanceStorySourceImageNodeId: storyMetadata.seedanceStorySourceImageNodeId,
    seedanceReferenceOrder: storyMetadata.seedanceReferenceOrder,
    seedanceRequiredReferences: storyMetadata.seedanceRequiredReferences,
    seedanceStoryAutoReferenceOmittedCount: storyMetadata.seedanceStoryAutoReferenceOmittedCount,
    seedanceStoryAutoReferenceNotice: storyMetadata.seedanceStoryAutoReferenceNotice,
    seedanceAutoPrompt: storyMetadata.seedanceAutoPrompt,
  });
  applyWorkflowVideoGenerationSnapshot(next, baseMetadata, workflowMetadata);
  if (!storyMetadata.seedanceStoryAutoReferenceNotice) delete next.seedanceStoryAutoReferenceNotice;
  next.seedanceReferenceSlotBindings = mergeProtectedReferenceSlotBindings(
    existingMetadata.seedanceReferenceSlotBindings,
    existingMetadata.seedanceStorySourceImageNodeId,
    storyMetadata.seedanceStorySourceImageNodeId,
  );
  next.seedancePromptPanelMode =
    existingMetadata.seedancePromptPanelMode === "inline" || existingMetadata.seedancePromptEditedByUser === true
      ? "inline"
      : "compact";
  return next;
}

/**
 * Story placeholders inherit the workflow's exact provider/model/operation
 * snapshot. These fields are routing and capability inputs, rather than
 * per-shot edits, so a refresh must not let stale placeholder metadata win.
 */
function workflowVideoGenerationSnapshot(metadata: CanvasNodeMetadata): Partial<CanvasNodeMetadata> {
  const snapshot: Partial<CanvasNodeMetadata> = {};
  if (metadata.videoGenerationSettings !== undefined) snapshot.videoGenerationSettings = metadata.videoGenerationSettings;
  if (metadata.videoGenerationScope !== undefined) snapshot.videoGenerationScope = metadata.videoGenerationScope;
  if (metadata.videoGenerationCapabilityId !== undefined) snapshot.videoGenerationCapabilityId = metadata.videoGenerationCapabilityId;
  if (metadata.videoWireFormat !== undefined) snapshot.videoWireFormat = metadata.videoWireFormat;
  return snapshot;
}

const VIDEO_REFERENCE_SUBMISSION_OPERATIONS = new Set<VideoReferenceSubmissionOperation>([
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "first-last-frame-to-video",
  "keyframes-to-video",
  "continuation",
  "video-edit",
]);

function storyReferenceSubmissionOperation(
  metadata: CanvasNodeMetadata | undefined,
): VideoReferenceSubmissionOperation | undefined {
  const operation = metadata?.videoGenerationScope?.operation;
  return VIDEO_REFERENCE_SUBMISSION_OPERATIONS.has(operation as VideoReferenceSubmissionOperation)
    ? operation as VideoReferenceSubmissionOperation
    : undefined;
}

function applyWorkflowVideoGenerationSnapshot(
  target: CanvasNodeMetadata,
  baseMetadata: CanvasNodeMetadata,
  workflowMetadata: CanvasNodeMetadata,
) {
  // createSeedance2VideoPlaceholderMetadata is the canonical normalizer for
  // these legacy Seedance fields, including an intentionally blank model.
  target.model = baseMetadata.model;
  target.seedanceModel = baseMetadata.seedanceModel;
  target.seedanceApiProvider = baseMetadata.seedanceApiProvider;
  target.seedanceApiEndpoint = baseMetadata.seedanceApiEndpoint;
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationSettings");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationScope");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationCapabilityId");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoWireFormat");
}

function applyOptionalWorkflowSnapshotField<Key extends keyof CanvasNodeMetadata>(
  target: CanvasNodeMetadata,
  source: CanvasNodeMetadata,
  key: Key,
) {
  if (source[key] === undefined) {
    delete target[key];
    return;
  }
  target[key] = source[key];
}

function assignDefinedMetadata(target: CanvasNodeMetadata, source: CanvasNodeMetadata) {
  Object.entries(source).forEach(([key, value]) => {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  });
}

function mergeProtectedReferenceSlotBindings(
  existing: CanvasNodeMetadata["seedanceReferenceSlotBindings"],
  previousStorySourceImageNodeId: string | undefined,
  nextStorySourceImageNodeId: string | undefined,
) {
  const next = { ...(existing || {}) };
  const legacyCurrentShotNodeId = next.current_shot?.nodeId;
  if (
    legacyCurrentShotNodeId &&
    (legacyCurrentShotNodeId === previousStorySourceImageNodeId || legacyCurrentShotNodeId === nextStorySourceImageNodeId)
  ) {
    delete next.current_shot;
  }
  return next;
}

function storyPromptContext(shot: StoryShot, storyDirector: CanvasNodeData): Seedance2StoryPromptContext {
  const characterById = new Map(
    (storyDirector.metadata?.storyCharacters || []).map((character) => [character.id, character.name]),
  );
  const directorTitle = stringValue(storyDirector.title);
  return {
    storyTitle: directorTitle === "故事导演" ? undefined : directorTitle,
    storySummary: stringValue(storyDirector.metadata?.storyText) || stringValue(storyDirector.metadata?.content),
    characters: (shot.appearingCharacterIds || []).map((id) => stringValue(characterById.get(id))).filter(Boolean),
    plotPosition: `第 ${shot.index} 镜`,
    characterState: stringValue(shot.characterState) || stringValue(shot.emotion),
  };
}

function connectionEndpointKey(connection: Pick<CanvasConnection, "fromNodeId" | "toNodeId"> & Partial<Pick<CanvasConnection, "referenceAssetId" | "referenceAssetStorageKey">>) {
  const assetId = connection.referenceAssetId && connection.referenceAssetStorageKey
    ? connection.referenceAssetId
    : "parent";
  return `${connection.fromNodeId}->${connection.toNodeId}:${assetId}`;
}

function nextSeedancePlaceholderSetVersion(workflowNodeId: string, nodes: CanvasNodeData[]) {
  let maximumVersion = 0;
  nodes
    .filter((node) => isStoryPlaceholderForWorkflow(node, workflowNodeId))
    .forEach((node) => {
      const savedVersion = positiveInteger(node.metadata?.seedancePlaceholderSetVersion);
      maximumVersion = Math.max(maximumVersion, savedVersion || 1);
    });
  return maximumVersion + 1;
}

function nextSeedancePlaceholderGroupY(workflowNode: CanvasNodeData, nodes: CanvasNodeData[]) {
  const existingPlaceholders = nodes.filter((node) => isStoryPlaceholderForWorkflow(node, workflowNode.id));
  if (!existingPlaceholders.length) return workflowNode.position.y;
  return Math.max(...existingPlaceholders.map((node) => node.position.y + node.height)) + 60;
}

function versionedPlaceholderPosition(
  workflowNode: CanvasNodeData,
  size: { width: number; height: number },
  index: number,
  groupStartY: number,
) {
  return {
    x: workflowNode.position.x + workflowNode.width + 140 + (index % 3) * (size.width + 40),
    y: groupStartY + Math.floor(index / 3) * (size.height + 60),
  };
}

export function resolveStoryReferencePrefillPolicy(
  capability?: Seedance2StoryReferenceCapability,
  policy?: Seedance2StoryReferencePrefillPolicy,
): Seedance2StoryReferenceCapability {
  if (policy) return completeStoryReferencePolicy(policy);
  if (capability) {
    return {
      id: capability.id,
      intentPolicy: capability.intentPolicy,
      referenceImagePolicy: capability.referenceImagePolicy,
      autoCharacterDerivedViewPolicy: capability.autoCharacterDerivedViewPolicy,
      storyAutoReferencePolicy: capability.storyAutoReferencePolicy,
      supportsFirstFrame: capability.supportsFirstFrame,
      supportsFirstLastFrame: capability.supportsFirstLastFrame,
      supportsKeyframeSequence: capability.supportsKeyframeSequence,
      keyframeImageMinimum: capability.keyframeImageMinimum,
      keyframeImageLimit: capability.keyframeImageLimit,
      supportsReferenceSetWithFirst: capability.supportsReferenceSetWithFirst,
      supportsReferenceSetWithFrames: capability.supportsReferenceSetWithFrames,
      requiresFirstLastFrame: capability.requiresFirstLastFrame,
      requiresExplicitProfile: capability.requiresExplicitProfile,
      referenceContractBlockReason: capability.referenceContractBlockReason,
      videoInputPolicy: capability.videoInputPolicy,
      sharedImageVideoMaximum: capability.sharedImageVideoMaximum,
      generationParameters: capability.generationParameters,
    };
  }
  return {
    id: "ark-unknown",
    intentPolicy: "blocked",
    referenceImagePolicy: { supported: false },
    autoCharacterDerivedViewPolicy: "disabled",
    supportsFirstFrame: false,
    supportsFirstLastFrame: false,
    supportsReferenceSetWithFirst: false,
    videoInputPolicy: { supported: false },
    requiresExplicitProfile: true,
    generationParameters: undefined,
  };
}

export function assertStoryVideoPlaceholderCapability(
  capability?: Seedance2StoryReferenceCapability,
  policy?: Seedance2StoryReferencePrefillPolicy,
): Seedance2StoryReferenceCapability {
  const resolved = resolveStoryReferencePrefillPolicy(capability, policy);
  if ((capability || policy) && resolved.videoInputPolicy?.supported && resolved.videoInputPolicy.min > 0) {
    throw new Error(`当前视频模型要求至少 ${resolved.videoInputPolicy.min} 个源视频，故事导演工作流无法创建可用占位框`);
  }
  return resolved;
}

function assertStoryReferencePlanRequirements({
  policy,
  references,
  videos,
  shotIndex,
  contractState,
  contractReason,
  enforceContractState,
}: {
  policy: Seedance2StoryReferenceCapability;
  references: StoryShotSemanticReference[];
  videos: Array<{ useAs?: string }>;
  shotIndex: number;
  contractState: StoryReferencePlan["contractState"];
  contractReason?: string;
  enforceContractState: boolean;
}) {
  if (enforceContractState && contractState === "blocked") {
    throw new Error(`第 ${shotIndex} 镜：${contractReason || "当前视频 operation 的参考媒体合同不允许提交"}`);
  }
  if (policy.videoInputPolicy?.supported && policy.videoInputPolicy.min > videos.length) {
    throw new Error(`第 ${shotIndex} 镜选择的模型必须输入至少 ${policy.videoInputPolicy.min} 个视频，故事工作流当前没有可用源视频`);
  }
  const first = references.filter((reference) => reference.useAs === "first_frame").length;
  const last = references.filter((reference) => reference.useAs === "last_frame").length;
  const ordinary = references.filter((reference) => reference.useAs === "reference_image").length;
  if (policy.requiresFirstLastFrame && (!first || !last)) {
    throw new Error(`第 ${shotIndex} 镜选择的模型要求首帧和尾帧，当前故事分镜无法同时提供`);
  }
  if ((policy.intentPolicy === "single-frame" || policy.intentPolicy === "i2v" || policy.intentPolicy === "keyframes") && !first) {
    throw new Error(`第 ${shotIndex} 镜选择的模型需要首帧，但当前故事分镜没有可用首帧`);
  }
  const minimum = policy.referenceImagePolicy.supported ? policy.referenceImagePolicy.min : 0;
  const enforcePublishedMinimum = policy.id !== "ark-unknown";
  if (enforcePublishedMinimum && policy.storyAutoReferencePolicy !== "disabled" && (policy.intentPolicy === "reference-set" || policy.intentPolicy === "r2v-with-first")) {
    if (ordinary < minimum) {
      throw new Error(`第 ${shotIndex} 镜选择的模型至少需要 ${minimum} 张普通参考图，当前只准备了 ${ordinary} 张`);
    }
  } else if (enforcePublishedMinimum && policy.intentPolicy === "frames-or-reference-set" && first === 0 && ordinary < minimum) {
    throw new Error(`第 ${shotIndex} 镜选择的模型需要首帧或至少 ${minimum} 张普通参考图`);
  } else if (enforcePublishedMinimum && policy.intentPolicy === "reference-set-with-frames" && first + last + ordinary < minimum) {
    throw new Error(`第 ${shotIndex} 镜选择的模型至少需要 ${minimum} 张参考图或帧`);
  }
}

function completeStoryReferencePolicy(policy: Seedance2StoryReferencePrefillPolicy): Seedance2StoryReferenceCapability {
  const temporal = policy.intentPolicy === "single-frame" || policy.intentPolicy === "i2v" || policy.intentPolicy === "keyframes";
  return {
    id: policy.id || "ark-unknown",
    intentPolicy: policy.intentPolicy,
    referenceImagePolicy: policy.referenceImagePolicy,
    autoCharacterDerivedViewPolicy: policy.autoCharacterDerivedViewPolicy,
    storyAutoReferencePolicy: policy.storyAutoReferencePolicy,
    supportsFirstFrame: policy.supportsFirstFrame ?? temporal,
    supportsFirstLastFrame: policy.supportsFirstLastFrame ?? false,
    supportsKeyframeSequence: policy.supportsKeyframeSequence ?? (policy.intentPolicy === "keyframes"),
    keyframeImageMinimum: policy.keyframeImageMinimum,
    keyframeImageLimit: policy.keyframeImageLimit,
    supportsReferenceSetWithFirst: policy.supportsReferenceSetWithFirst ?? (policy.intentPolicy === "r2v-with-first"),
    supportsReferenceSetWithFrames: policy.supportsReferenceSetWithFrames ?? (policy.intentPolicy === "reference-set-with-frames"),
    requiresFirstLastFrame: policy.requiresFirstLastFrame,
    requiresExplicitProfile: policy.requiresExplicitProfile,
    referenceContractBlockReason: policy.referenceContractBlockReason,
    videoInputPolicy: policy.videoInputPolicy || { supported: false },
    sharedImageVideoMaximum: policy.sharedImageVideoMaximum,
    generationParameters: policy.generationParameters,
  };
}

function referenceNodesForShot(options: {
  shot?: StoryShot;
  packedShots?: StoryShot[];
  storyDirector?: CanvasNodeData;
  nodeById: Map<string, CanvasNodeData>;
  connections: CanvasConnection[];
  currentShot?: CanvasNodeData;
  packedImages?: CanvasNodeData[];
  targetNodeId?: string;
  policy: Seedance2StoryReferenceCapability;
  operation?: VideoReferenceSubmissionOperation;
}): StoryReferencePlan {
  const { shot, storyDirector, nodeById, connections, policy, operation } = options;
  const packedShots = options.packedShots?.length ? options.packedShots : (shot ? [shot] : []);
  const packedImages = (options.packedImages || []).filter(isUsableImageReference);
  const currentShot = packedImages[0] || options.currentShot;
  const currentShotTemporalPolicy = policy.intentPolicy === "single-frame" ||
    policy.intentPolicy === "keyframes" ||
    policy.intentPolicy === "i2v" ||
    (policy.intentPolicy === "frames-or-reference-set" && operation !== "reference-to-video");
  const operationSupportsSemanticReferences = operation === "reference-to-video" && (
    policy.intentPolicy === "reference-set" ||
    policy.intentPolicy === "r2v-with-first" ||
    policy.intentPolicy === "frames-or-reference-set" ||
    policy.intentPolicy === "reference-set-with-frames"
  );

  const temporalReferences: StoryShotSemanticReference[] = [];
  const ordinaryCandidates: StoryShotSemanticReference[] = [];
  const seenValues = new Set<string>();
  const pushReference = (
    target: StoryShotSemanticReference[],
    node: CanvasNodeData | undefined,
    role: VideoReferenceRole,
    label: string,
    entityId?: string,
    useAs: Seedance2ReferenceSlotUseAs = "reference_image",
    asset?: Pick<CharacterDerivedView, "id" | "storageKey">,
  ) => {
    if (!isUsableImageReference(node)) return;
    const value = asset?.storageKey || imageReferenceValue(node);
    const identity = asset?.id || `node:${node.id}`;
    if (seenValues.has(identity) || (value && seenValues.has(`value:${value}`))) return;
    seenValues.add(identity);
    if (value) seenValues.add(`value:${value}`);
    target.push({
      node,
      role,
      label,
      ...(entityId ? { entityId } : {}),
      useAs,
      ...(asset ? { referenceAssetId: asset.id, referenceAssetStorageKey: asset.storageKey } : {}),
    });
  };

  const isTextOnlyOperation = operation === "text-to-video";
  if (
    !isTextOnlyOperation &&
    (currentShotTemporalPolicy ||
      policy.intentPolicy === "r2v-with-first" ||
      policy.intentPolicy === "reference-set-with-frames" ||
      policy.intentPolicy === "blocked" ||
      policy.intentPolicy === "none")
  ) {
    pushReference(temporalReferences, currentShot, "current_shot", "当前分镜图", undefined, "first_frame");
    if (operation === "reference-to-video") {
      packedImages.slice(1).forEach((image, index) => {
        pushReference(ordinaryCandidates, image, "upstream_frame", `分镜图 ${index + 2}`);
      });
    }
  } else if (!isTextOnlyOperation) {
    pushReference(ordinaryCandidates, currentShot, "current_shot", "当前分镜图");
    packedImages.slice(1).forEach((image, index) => {
      pushReference(ordinaryCandidates, image, "upstream_frame", `分镜图 ${index + 2}`);
    });
  }
  if (currentShotTemporalPolicy && !isTextOnlyOperation) {
    // Temporal wiring follows the chosen operation's contract: an explicit
    // keyframes operation wires enough following shots to use the model's
    // declared keyframe capacity (Agnes v2 accepts 2–3 frames measured, so the
    // story wiring targets the upper bound), while
    // an i2v capability may carry the adjacent shot as its optional tail frame.
    // A plain image-to-video on a keyframes-intent model must not invent one.
    const wantsKeyframe = operation
      ? operation === "keyframes-to-video"
      : policy.intentPolicy === "keyframes" && policy.supportsKeyframeSequence;
    const wantsLastFrame = operation
      ? operation === "first-last-frame-to-video"
        ? Boolean(policy.supportsFirstLastFrame)
        : operation === "image-to-video" &&
          policy.intentPolicy === "i2v" &&
          Boolean(policy.supportsFirstLastFrame)
      : policy.intentPolicy === "i2v" && policy.supportsFirstLastFrame;
    if (wantsKeyframe && policy.supportsKeyframeSequence) {
      const following = packedImages.length > 1
        ? packedImages.slice(1)
        : followingOrderedStoryShotImages({ shot, storyDirector, nodeById, connections, limit: 1 });
      following.forEach((image, index) => {
        pushReference(
          temporalReferences,
          image,
          "upstream_frame",
          index === 0 ? "下一分镜图" : `后续关键帧 ${index + 2}`,
          undefined,
          "keyframe",
        );
      });
    } else if (wantsLastFrame && policy.supportsFirstLastFrame) {
      const nextShotImage = packedImages[1] || followingOrderedStoryShotImages({ shot, storyDirector, nodeById, connections, limit: 1 })[0];
      pushReference(temporalReferences, nextShotImage, "upstream_frame", "下一分镜图", undefined, "last_frame");
    }
  }

  let notice: string | undefined;
  const extraViewsByCharacter: StoryShotSemanticReference[][] = [];
  if (packedShots.length && storyDirector) {
    const characterPlan = appearingCharacterReferenceNodesForShots(packedShots, storyDirector, nodeById, connections, "multi-view");
    characterPlan.primary.forEach((reference) => {
      pushReference(ordinaryCandidates, reference.node, "character", reference.label, reference.entityId, "reference_image", reference.asset);
    });
    extraViewsByCharacter.push(...characterPlan.extraByCharacter);
    if (characterPlan.notices.length) notice = characterPlan.notices.join("；");
    packedShots.forEach((packedShot) => {
      sceneReferenceNodes(packedShot, storyDirector, nodeById, connections).forEach((reference) => {
        pushReference(ordinaryCandidates, reference.node, "scene", reference.label, reference.entityId);
      });
      propReferenceNodes(packedShot, storyDirector, nodeById, connections).forEach((node) => {
        pushReference(ordinaryCandidates, node, "prop", `其它参考图：${stringValue(node.title) || node.id}`);
      });
    });
  }
  if (currentShot) {
    orderedImageInputConnections(currentShot.id, nodeById, connections).forEach(({ node }) => {
      pushReference(ordinaryCandidates, node, "upstream_frame", stringValue(node.title) || "上游参考图");
    });
  }

  for (let round = 0; extraViewsByCharacter.some((views) => round < views.length); round += 1) {
    extraViewsByCharacter.forEach((views) => {
      const reference = views[round];
      const assetId = reference?.referenceAssetId;
      const assetStorageKey = reference?.referenceAssetStorageKey;
      if (!reference || !assetId || !assetStorageKey) return;
      pushReference(ordinaryCandidates, reference.node, reference.role, reference.label, reference.entityId, reference.useAs, {
        id: assetId,
        storageKey: assetStorageKey,
      });
    });
  }

  const orderedCandidates = [...temporalReferences, ...ordinaryCandidates];
  const workflowExcluded: StoryReferencePlan["notSubmitted"] = [];
  const derivedEntityIds = new Set<string>();
  const eligibleCandidates = orderedCandidates.filter((reference) => {
    if (policy.storyAutoReferencePolicy === "disabled") {
      workflowExcluded.push({
        reference,
        reasonCode: "workflow-policy",
        reason: "当前 service 未启用 Story 自动参考提交，该候选不会提交",
      });
      return false;
    }
    if (
      policy.storyAutoReferencePolicy === "current-shot" &&
      !operationSupportsSemanticReferences &&
      reference.role !== "current_shot" &&
      reference.useAs === "reference_image"
    ) {
      workflowExcluded.push({
        reference,
        reasonCode: "workflow-policy",
        reason: "当前模型只自动提交当前分镜的时序图，该语义候选不会提交",
      });
      return false;
    }
    if (reference.referenceAssetId && policy.autoCharacterDerivedViewPolicy === "disabled") {
      workflowExcluded.push({
        reference,
        reasonCode: "workflow-policy",
        reason: "当前模型未启用派生角色视图自动提交，该候选不会提交",
      });
      return false;
    }
    if (
      reference.referenceAssetId &&
      policy.autoCharacterDerivedViewPolicy === "single-view" &&
      !operationSupportsSemanticReferences
    ) {
      const entityId = reference.entityId || reference.node.id;
      if (derivedEntityIds.has(entityId)) {
        workflowExcluded.push({
          reference,
          reasonCode: "workflow-policy",
          reason: "当前模型每个角色只自动提交一个派生视图，其它视图不会提交",
        });
        return false;
      }
      derivedEntityIds.add(entityId);
    }
    return true;
  });
  const contract = resolveVideoReferenceSlotContract({
    capability: {
      ...policy,
      // Creation-time wiring does not enforce the exact keyframe minimum: a
      // recoverable frame shortage is surfaced by the canvas delivery plan and
      // rejected again at generation time, while the placeholder still wires
      // the honest temporal candidates.
      keyframeImageMinimum: undefined,
      id: policy.id || "ark-unknown",
      provider: "ark",
      label: policy.id || "story-policy",
      providerLabel: policy.id || "story-policy",
      model: policy.id || "story-policy",
      profileConfigured: true,
      generationParameters: {} as ResolvedVideoModelCapability["generationParameters"],
    },
    operation,
    references: eligibleCandidates,
    videos: connections.flatMap((connection) => {
      if (!options.targetNodeId || connection.toNodeId !== options.targetNodeId) return [];
      if (nodeById.get(connection.fromNodeId)?.type !== CanvasNodeType.Video) return [];
      return [{ useAs: connection.videoUseAs }];
    }),
  });
  const notSubmitted = [...workflowExcluded, ...contract.notSubmitted];
  const omittedCount = notSubmitted.length;
  if (omittedCount > 0) {
    const reasons = Array.from(new Set(notSubmitted.map((item) => item.reason))).join("；");
    notice = [notice, `当前提交计划不直传 ${omittedCount} 个相关候选：${reasons}。`].filter(Boolean).join("；");
  }
  return {
    references: orderedCandidates,
    submitted: contract.submitted,
    // Drawable = what the canvas may wire. With a resolved operation the wiring
    // mirrors the real paid request (submitted only). Legacy placeholders whose
    // workflow has no operation scope yet cannot define a request at all, so we
    // keep the policy-filtered candidates visible instead of gutting them.
    drawable: operation ? contract.submitted : eligibleCandidates,
    notSubmitted,
    omittedCount,
    contractState: contract.state,
    ...(contract.reason ? { contractReason: contract.reason } : {}),
    ...(notice ? { notice } : {}),
  };
}

/** Wire exactly what the submission contract will send — the canvas graph is the
 * real request preview, so retained/not-submitted candidates never get edges.
 * Their omission is recorded in the placeholder ledger (metadata notice). */
function appendStoryReferenceConnections(
  target: CanvasConnection[],
  workflowId: string,
  placeholderId: string,
  plan: StoryReferencePlan,
) {
  plan.drawable.forEach((reference) => {
    target.push(storySemanticReferenceConnection(workflowId, placeholderId, reference));
  });
}

function followingOrderedStoryShotImages(options: {
  shot?: StoryShot;
  storyDirector?: CanvasNodeData;
  nodeById: Map<string, CanvasNodeData>;
  connections: CanvasConnection[];
  limit?: number;
}) {
  const { shot, storyDirector, nodeById, connections, limit = 1 } = options;
  if (!shot || !storyDirector) return [] as CanvasNodeData[];
  const orderedShots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  const position = orderedShots.findIndex((candidate) =>
    (shot.id && candidate.id === shot.id) || candidate.index === shot.index,
  );
  if (position < 0) return [] as CanvasNodeData[];
  const images: CanvasNodeData[] = [];
  const imageNodes = [...nodeById.values()].filter((node) => node.type === CanvasNodeType.Image);
  for (let index = position + 1; index < orderedShots.length && images.length < limit; index += 1) {
    const image = findCurrentShotImageForStoryShot(orderedShots[index], storyDirector, imageNodes, connections);
    if (image) images.push(image);
  }
  return images;
}

function storySemanticReferenceConnection(
  workflowId: string,
  placeholderId: string,
  reference: StoryShotSemanticReference,
  referenceSequence?: number,
): CanvasConnection {
  return {
    id: storyReferenceConnectionId(workflowId, placeholderId, reference.referenceAssetId || reference.node.id),
    fromNodeId: reference.node.id,
    toNodeId: placeholderId,
    ...(referenceSequence ? { referenceSequence } : {}),
    referenceRole: reference.role,
    referenceLabel: reference.label,
    ...(reference.entityId ? { referenceEntityId: reference.entityId } : {}),
    useAs: reference.useAs,
    referenceOrigin: "story_auto",
    ...(reference.referenceAssetId && reference.referenceAssetStorageKey
      ? {
          referenceAssetId: reference.referenceAssetId,
          referenceAssetStorageKey: reference.referenceAssetStorageKey,
        }
      : {}),
  };
}

export function reconcileSeedance2StoryPlaceholderReferences(options: {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  capability?: Seedance2StoryReferenceCapability;
  referencePolicy?: Seedance2StoryReferencePrefillPolicy;
  capabilityForPlaceholder?: (
    placeholder: CanvasNodeData,
  ) => Seedance2StoryReferenceCapability | undefined;
  shouldReconcilePlaceholder?: (placeholder: CanvasNodeData) => boolean;
}): CanvasConnection[] {
  const { nodes, connections } = options;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const placeholders = nodes.filter((node) => {
    const currentShotId = node.metadata?.seedanceStorySourceImageNodeId;
    return (
      node.type === CanvasNodeType.Video &&
      node.metadata?.seedanceWorkflowRole === "placeholder" &&
      typeof currentShotId === "string" &&
      nodeById.get(currentShotId)?.type === CanvasNodeType.Image &&
      storyPlaceholderCanReconcile(node) &&
      (options.shouldReconcilePlaceholder?.(node) ?? true)
    );
  });
  if (!placeholders.length) return connections;

  const placeholderIds = new Set(placeholders.map((placeholder) => placeholder.id));
  const retainedByPlaceholderId = new Map<string, Map<string, CanvasConnection>>();
  const addedConnections: CanvasConnection[] = [];
  placeholders.forEach((placeholder) => {
    const currentShotId = placeholder.metadata?.seedanceStorySourceImageNodeId;
    const currentShot = typeof currentShotId === "string" ? nodeById.get(currentShotId) : undefined;
    if (!currentShot || currentShot.type !== CanvasNodeType.Image) return;
    const storyDirector = storyDirectorForPlaceholder(placeholder, nodeById);
    const shot = storyShotForPlaceholder(placeholder, storyDirector);
    const placeholderCapability = options.capabilityForPlaceholder?.(placeholder);
    const workflowNodeId = stringValue(placeholder.metadata?.seedanceWorkflowNodeId);
    // Legacy placeholders may lack their own operation scope; inherit the
    // workflow's scope so the wiring still mirrors the real request.
    const effectiveOperation =
      storyReferenceSubmissionOperation(placeholder.metadata) ??
      (workflowNodeId ? storyReferenceSubmissionOperation(nodeById.get(workflowNodeId)?.metadata) : undefined);
    // 与建线时共用的 semantic builder：画布只保留真实会提交的自动线；
    // 过期/不提交的自动线会被重算删除，手工直连线保留。
    const packedImageIds = placeholder.metadata?.seedanceStoryPackedImageNodeIds || [];
    const packedImages = uniqueImageNodes(
      packedImageIds.length
        ? packedImageIds.map((id) => nodeById.get(id))
        : connections
            .filter((connection) =>
              connection.toNodeId === placeholder.id &&
              connection.referenceOrigin === "story_auto" &&
              (connection.useAs === "first_frame" || connection.useAs === "keyframe" || connection.useAs === "last_frame" || connection.referenceRole === "current_shot"),
            )
            .sort((left, right) => {
              const rank = (useAs?: string) =>
                useAs === "first_frame" ? 0 : useAs === "keyframe" || useAs === "last_frame" ? 1 : 2;
              return rank(left.useAs) - rank(right.useAs);
            })
            .map((connection) => nodeById.get(connection.fromNodeId)),
    );
    const semanticPlan = referenceNodesForShot({
      shot,
      packedShots: storyDirector
        ? [...(storyDirector.metadata?.storyShots || [])]
            .sort((left, right) => left.index - right.index)
            .filter((item) => packedImages.some((image) => storyShotIndexesFromImageNode(image).includes(item.index)))
        : shot
          ? [shot]
          : [],
      storyDirector,
      nodeById,
      connections,
      currentShot,
      packedImages: packedImages.length ? packedImages : undefined,
      targetNodeId: placeholder.id,
      policy: resolveStoryReferencePrefillPolicy(
        placeholderCapability || options.capability,
        placeholderCapability ? undefined : options.referencePolicy,
      ),
      operation: effectiveOperation,
    });
    const semanticReferences = semanticPlan.drawable;
    const directConnections = orderedImageInputConnections(placeholder.id, nodeById, connections);
    const manualConnections = directConnections.filter(({ connection }) =>
      !isStoryReferenceConnection(connection) || connection.referenceUseAsExplicit === true || connection.referenceOrigin === "manual"
    );
    const manualReferences: StoryShotSemanticReference[] = manualConnections.map(({ node, connection }) => ({
      node,
      role: normalizeVideoReferenceRole(connection.referenceRole) || "other",
      label: stringValue(connection.referenceLabel) || stringValue(node.title) || node.id,
      ...(stringValue(connection.referenceEntityId) ? { entityId: stringValue(connection.referenceEntityId) } : {}),
      useAs: normalizeConnectionUseAs(connection.useAs),
      sourceConnectionId: connection.id,
      ...(connection.referenceAssetId && connection.referenceAssetStorageKey
        ? {
            referenceAssetId: connection.referenceAssetId,
            referenceAssetStorageKey: connection.referenceAssetStorageKey,
          }
        : {}),
    }));
    const targetReferences: StoryShotSemanticReference[] = [];
    const seenReferenceIds = new Set<string>();
    const seenValues = new Set<string>();
    const manualReferenceIds = new Set(manualReferences.map(referenceIdentity));
    const manualValues = new Set(manualReferences.map((reference) => reference.referenceAssetStorageKey || imageReferenceValue(reference.node)).filter(Boolean));
    semanticReferences.forEach((reference) => {
      const value = reference.referenceAssetStorageKey || imageReferenceValue(reference.node);
      const referenceId = reference.referenceAssetId || `node:${reference.node.id}`;
      if (manualReferenceIds.has(referenceId) || (value && manualValues.has(value))) return;
      if (seenReferenceIds.has(referenceId) || (value && seenValues.has(value))) return;
      seenReferenceIds.add(referenceId);
      if (value) seenValues.add(value);
      targetReferences.push(reference);
    });
    targetReferences.push(...manualReferences);
    const targetReferenceIds = new Set(targetReferences.filter((reference) => !reference.sourceConnectionId).map(referenceIdentity));
    const targetConnectionIds = new Set(targetReferences.map((reference) => reference.sourceConnectionId).filter(Boolean));
    const singleExplicitFrameOwner = (useAs: "first_frame" | "last_frame") => {
      const ownerNodeIds = new Set(
        directConnections
          .filter(({ node, connection }) =>
            (targetConnectionIds.has(connection.id) || targetReferenceIds.has(connectionReferenceIdentity(connection, node.id))) &&
            normalizeConnectionUseAs(connection.useAs) === useAs &&
            (connection.referenceUseAsExplicit === true || !isStoryReferenceConnection(connection)))
          .map(({ node, connection }) => connection.id || connectionReferenceIdentity(connection, node.id)),
      );
      return ownerNodeIds.size === 1 ? [...ownerNodeIds][0] : undefined;
    };
    const explicitFirstFrameOwner = singleExplicitFrameOwner("first_frame");
    const explicitLastFrameOwner = singleExplicitFrameOwner("last_frame");
    const exclusiveUseAs = (
      referenceId: string,
      useAs: Seedance2ReferenceSlotUseAs,
    ): Seedance2ReferenceSlotUseAs => {
      if (useAs === "first_frame" && explicitFirstFrameOwner && explicitFirstFrameOwner !== referenceId) return "reference_image";
      if (useAs === "last_frame" && explicitLastFrameOwner && explicitLastFrameOwner !== referenceId) return "reference_image";
      return useAs;
    };
    const retainedByConnectionId = new Map<string, CanvasConnection>();
    targetReferences.forEach((reference, index) => {
      const candidates = directConnections.filter(({ node, connection }) => reference.sourceConnectionId
        ? connection.id === reference.sourceConnectionId
        : connectionReferenceIdentity(connection, node.id) === referenceIdentity(reference));
      const existing =
        candidates.find(({ connection }) =>
          !isStoryReferenceConnection(connection) || connection.referenceUseAsExplicit === true || connection.referenceOrigin === "manual"
        ) ||
        candidates[0];
      if (existing) {
        // 手工直连线只补顺序，不改写其语义元数据；自动线按最新语义重打 role/label，
        // 但保留用户在参考图用途控件里明确选择的首帧/尾帧语义。
        if (isStoryReferenceConnection(existing.connection) && existing.connection.referenceUseAsExplicit !== true && existing.connection.referenceOrigin !== "manual") {
          const semanticConnection = storySemanticReferenceConnection(
            String(placeholder.metadata?.seedanceWorkflowNodeId || "story"),
            placeholder.id,
            reference,
            index + 1,
          );
          const retainedUseAs = normalizeConnectionUseAs(semanticConnection.useAs);
          retainedByConnectionId.set(existing.connection.id, {
            ...semanticConnection,
            id: existing.connection.id,
            useAs: exclusiveUseAs(reference.sourceConnectionId || referenceIdentity(reference), retainedUseAs),
          });
        } else {
          retainedByConnectionId.set(existing.connection.id, {
            ...existing.connection,
            referenceSequence: index + 1,
            referenceOrigin: "manual",
          });
        }
        return;
      }
      const semanticConnection = storySemanticReferenceConnection(
        String(placeholder.metadata?.seedanceWorkflowNodeId || "story"),
        placeholder.id,
        reference,
        index + 1,
      );
      addedConnections.push({
        ...semanticConnection,
        useAs: exclusiveUseAs(reference.sourceConnectionId || referenceIdentity(reference), normalizeConnectionUseAs(semanticConnection.useAs)),
      });
    });
    retainedByPlaceholderId.set(placeholder.id, retainedByConnectionId);
  });

  const nextConnections = connections.flatMap((connection) => {
    if (!placeholderIds.has(connection.toNodeId)) return [connection];
    if (isStoryReferenceConnection(connection) && nodeById.get(connection.fromNodeId)?.type !== CanvasNodeType.Image) {
      return [];
    }
    if (nodeById.get(connection.fromNodeId)?.type !== CanvasNodeType.Image) return [connection];
    const retained = retainedByPlaceholderId.get(connection.toNodeId)?.get(connection.id);
    return retained ? [retained] : [];
  });
  nextConnections.push(...addedConnections);
  return sameConnections(nextConnections, connections) ? connections : nextConnections;
}

function storyPlaceholderCanReconcile(node: CanvasNodeData) {
  const metadata = node.metadata;
  if (!metadata) return true;
  // Only a real video result or an in-flight generation owns the box.
  // Prompt-only / failed-timeout leftovers must stay replaceable so a
  // later pack (5 shots → 2 windows) can drop the old 1:1 boxes.
  if (metadata.content) return false;
  const status = stringValue(metadata.status).toLowerCase();
  if (status === "loading" || status === "generating") return false;
  const taskStatus = stringValue(metadata.seedanceGenerationTaskState?.status).toLowerCase();
  if (taskStatus === "loading" || taskStatus === "generating") return false;
  return true;
}

export function retainStoryAutoConnectionsForSupportedTargets(
  connections: CanvasConnection[],
  _supportedTargetNodeIds: ReadonlySet<string>,
) {
  // Route resolution and provider capability may change the delivery plan, but
  // never own candidate graph deletion. The argument remains for call-site
  // compatibility while old canvases migrate to non-destructive reconciliation.
  return connections;
}

function storyDirectorForPlaceholder(
  placeholder: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
) {
  const directorId = stringValue(placeholder.metadata?.seedanceStoryDirectorNodeId);
  const director = directorId ? nodeById.get(directorId) : undefined;
  return director?.type === CanvasNodeType.StoryDirector ? director : undefined;
}

function storyShotForPlaceholder(placeholder: CanvasNodeData, storyDirector?: CanvasNodeData) {
  const shots = storyDirector?.metadata?.storyShots || [];
  const shotId = stringValue(placeholder.metadata?.seedanceStoryShotId);
  const shotIndex =
    positiveInteger(placeholder.metadata?.seedanceStoryShotIndex) ||
    positiveInteger(placeholder.metadata?.seedanceShotIndex);
  return (
    shots.find((shot) => shotId && shot.id === shotId) ||
    shots.find((shot) => shotIndex && shot.index === shotIndex)
  );
}

function normalizeVideoReferenceRole(value: unknown): VideoReferenceRole | undefined {
  return value === "current_shot" ||
    value === "character" ||
    value === "scene" ||
    value === "prop" ||
    value === "other" ||
    value === "upstream_frame"
    ? value
    : undefined;
}

function normalizeConnectionUseAs(value: unknown): Seedance2ReferenceSlotUseAs {
  return value === "first_frame" || value === "last_frame" || value === "keyframe" ? value : "reference_image";
}

type OrderedImageInputConnection = {
  connection: CanvasConnection;
  node: CanvasNodeData;
  originalIndex: number;
};

function orderedImageInputConnections(
  targetNodeId: string,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
): OrderedImageInputConnection[] {
  return connections
    .map((connection, originalIndex) => ({
      connection,
      node: nodeById.get(connection.fromNodeId),
      originalIndex,
    }))
    .filter(
      (entry): entry is OrderedImageInputConnection =>
        entry.connection.toNodeId === targetNodeId &&
        entry.node?.type === CanvasNodeType.Image,
    )
    .sort((left, right) => {
      const leftSequence = validReferenceSequence(left.connection.referenceSequence) ?? left.originalIndex + 1;
      const rightSequence = validReferenceSequence(right.connection.referenceSequence) ?? right.originalIndex + 1;
      return leftSequence - rightSequence || left.originalIndex - right.originalIndex;
    });
}

function uniqueImageNodes(nodes: Array<CanvasNodeData | undefined>): CanvasNodeData[] {
  const seen = new Set<string>();
  return nodes.filter((node): node is CanvasNodeData => {
    if (node?.type !== CanvasNodeType.Image || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function isStoryReferenceConnection(connection: CanvasConnection) {
  return connection.referenceOrigin === "story_auto" || String(connection.id || "").startsWith("conn-seedance2-story-ref-");
}

function referenceIdentity(reference: Pick<StoryShotSemanticReference, "node" | "referenceAssetId">) {
  return reference.referenceAssetId || `node:${reference.node.id}`;
}

function connectionReferenceIdentity(
  connection: Pick<CanvasConnection, "referenceAssetId" | "referenceAssetStorageKey">,
  parentNodeId: string,
) {
  return connection.referenceAssetId && connection.referenceAssetStorageKey
    ? connection.referenceAssetId
    : `node:${parentNodeId}`;
}

function validReferenceSequence(value: unknown) {
  const sequence = Number(value);
  return Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : undefined;
}

function sameConnections(left: CanvasConnection[], right: CanvasConnection[]) {
  return left.length === right.length && left.every((connection, index) => {
    const other = right[index];
    if (!other) return false;
    const connectionValues = connection as unknown as Record<string, unknown>;
    const otherValues = other as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(connectionValues), ...Object.keys(otherValues)]);
    return [...keys].every((key) => connectionValues[key] === otherValues[key]);
  });
}

function appearingCharacterReferenceNodes(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
  derivedViewPolicy: AutoCharacterDerivedViewPolicy,
): {
  primary: Array<{ node: CanvasNodeData; entityId: string; label: string; asset?: Pick<CharacterDerivedView, "id" | "storageKey"> }>;
  extraByCharacter: StoryShotSemanticReference[][];
  notices: string[];
} {
  const characterById = new Map<string, StoryCharacter>(
    (storyDirector.metadata?.storyCharacters || []).map((character) => [character.id, character]),
  );
  const appearingCharacters = (shot.appearingCharacterIds || [])
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is StoryCharacter => Boolean(character));
  // 只发本镜出场角色：没有任何出场角色时一张角色图都不带。
  if (!appearingCharacters.length) return { primary: [], extraByCharacter: [], notices: [] };

  // 候选池按优先级排列：角色输入 > 保存的角色来源 > 通用参考输入，逐角色按名/别名匹配。
  const candidateNodes = uniqueImageNodes([
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:character", nodeById, connections),
    ...storyDirectorSourceImageNodes(storyDirector, "character", nodeById),
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:reference", nodeById, connections),
  ]);
  const candidateIds = candidateNodes.map((node) => node.id);
  const primary: Array<{ node: CanvasNodeData; entityId: string; label: string; asset?: Pick<CharacterDerivedView, "id" | "storageKey"> }> = [];
  const extraByCharacter: StoryShotSemanticReference[][] = [];
  const notices: string[] = [];
  const preferredAngle = preferredCharacterViewAngle(shot);
  appearingCharacters.forEach((character) => {
    const boundNode = imageNodeById(nodeById, character.referenceNodeId)[0];
    const matchedNode =
      boundNode || imageNodeById(nodeById, findCharacterReferenceCandidate(character, candidateIds, nodeById))[0];
    if (!matchedNode) return;
    const label = `角色图：${stringValue(character.name) || stringValue(matchedNode.title) || matchedNode.id}`;
    if (matchedNode.metadata?.storyCharacterAssetKind === "turnaround_sheet") {
      const views = validCharacterDerivedViews(matchedNode);
      if (!views.length || derivedViewPolicy === "disabled") {
        notices.push(`${label} 的 turnaround sheet 未自动使用：缺少可用独立派生视图或当前模型未核验该策略。`);
        return;
      }
      const preferred = views.find((view) => view.angle === preferredAngle) || views.find((view) => view.angle === "front") || views[0];
      primary.push({ node: matchedNode, entityId: character.id, label: `${label}（${preferred.label}）`, asset: preferred });
      extraByCharacter.push(views
        .filter((view) => view.id !== preferred.id)
        .map((view) => ({
          node: matchedNode,
          role: "character" as const,
          entityId: character.id,
          label: `${label}（${view.label}）`,
          useAs: "reference_image" as const,
          referenceAssetId: view.id,
          referenceAssetStorageKey: view.storageKey,
        })));
      return;
    }
    primary.push({
      node: matchedNode,
      entityId: character.id,
      label,
    });
  });
  return { primary, extraByCharacter, notices };
}

function validCharacterDerivedViews(node: CanvasNodeData): CharacterDerivedView[] {
  const sourceStorageKey = stringValue(node.metadata?.storageKey);
  const seenAngles = new Set<string>();
  return (node.metadata?.characterDerivedViews || []).filter((view) => {
    if (!view.id || !view.storageKey || !view.angle || seenAngles.has(view.angle)) return false;
    if (sourceStorageKey && view.sourceStorageKey !== sourceStorageKey) return false;
    seenAngles.add(view.angle);
    return true;
  });
}

function preferredCharacterViewAngle(shot: StoryShot): CharacterDerivedView["angle"] {
  const semantics = [shot.camera, shot.visualContent, shot.imagePrompt, shot.finalPrompt, shot.action]
    .map(stringValue)
    .join("\n")
    .toLowerCase();
  if (/背面|背影|后背|from behind|back view|rear view/.test(semantics)) return "back";
  if (/侧面|侧身|侧脸|profile|side view/.test(semantics)) return "side";
  if (/特写|近景|脸部|close[- ]?up|portrait|headshot/.test(semantics)) return "portrait";
  return "front";
}

function appearingCharacterReferenceNodesForShots(
  shots: StoryShot[],
  storyDirector: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
  derivedViewPolicy: AutoCharacterDerivedViewPolicy,
) {
  const merged = {
    primary: [] as ReturnType<typeof appearingCharacterReferenceNodes>["primary"],
    extraByCharacter: [] as ReturnType<typeof appearingCharacterReferenceNodes>["extraByCharacter"],
    notices: [] as string[],
  };
  const seenPrimary = new Set<string>();
  shots.forEach((item) => {
    const plan = appearingCharacterReferenceNodes(item, storyDirector, nodeById, connections, derivedViewPolicy);
    plan.primary.forEach((reference) => {
      const key = `${reference.entityId || ""}:${reference.node.id}:${reference.asset?.id || ""}`;
      if (seenPrimary.has(key)) return;
      seenPrimary.add(key);
      merged.primary.push(reference);
    });
    merged.extraByCharacter.push(...plan.extraByCharacter);
    merged.notices.push(...plan.notices);
  });
  return merged;
}

function storyDirectorConnectedInputImageNodes(
  storyDirector: CanvasNodeData,
  toHandleId: string,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
) {
  return connections
    .filter((connection) => connection.toNodeId === storyDirector.id && connection.toHandleId === toHandleId)
    .flatMap((connection) => imageNodeById(nodeById, connection.fromNodeId))
    .filter((node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index);
}

function findCharacterReferenceCandidate(
  character: StoryCharacter,
  candidateIds: string[],
  nodeById: Map<string, CanvasNodeData>,
) {
  const names = [character.name, ...(character.aliases || [])]
    .map((value) => stringValue(value).toLowerCase())
    .filter(Boolean);
  if (!names.length) return undefined;
  return (
    candidateIds.find((id) => {
      const node = nodeById.get(id);
      const haystack = `${node?.title || ""}\n${node?.metadata?.prompt || ""}`.toLowerCase();
      return names.some((name) => haystack.includes(name));
    }) || undefined
  );
}

function sceneReferenceNodes(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
): Array<{ node: CanvasNodeData; entityId?: string; label: string }> {
  const scene = storyDirector.metadata?.storyScenes?.find((candidate) => candidate.id === shot.sceneId);
  const sceneName = stringValue(scene?.name);
  const boundSceneNode = imageNodeById(nodeById, scene?.referenceNodeId)[0];
  if (boundSceneNode) {
    return [{
      node: boundSceneNode,
      ...(scene ? { entityId: scene.id } : {}),
      label: `场景图：${sceneName || stringValue(boundSceneNode.title) || boundSceneNode.id}`,
    }];
  }

  const globalSceneNodes = uniqueImageNodes([
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:scene", nodeById, connections),
    ...storyDirectorSourceImageNodes(storyDirector, "scene", nodeById),
  ]);
  if (sceneName) {
    const loweredName = sceneName.toLowerCase();
    const matches = globalSceneNodes.filter((node) =>
      `${node.title || ""}\n${node.metadata?.prompt || ""}`.toLowerCase().includes(loweredName),
    );
    if (matches.length === 1) {
      return [{
        node: matches[0],
        ...(scene ? { entityId: scene.id } : {}),
        label: `场景图：${sceneName}`,
      }];
    }
  }
  return [];
}

function propReferenceNodes(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
) {
  const shotText = [shot.visualContent, shot.imagePrompt, shot.finalPrompt, shot.action]
    .map(stringValue)
    .join("\n")
    .toLowerCase();
  return uniqueImageNodes([
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:prop", nodeById, connections),
    ...storyDirectorSourceImageNodes(storyDirector, "prop", nodeById),
  ]).filter((node) => {
    const labels = [node.title, node.metadata?.storyLabel]
      .map(stringValue)
      .map((value) => value.toLowerCase())
      .filter(Boolean);
    return labels.some((label) => shotText.includes(label));
  });
}

function storyDirectorSourceImageNodes(
  storyDirector: CanvasNodeData,
  kind: StoryDirectorInputKind,
  nodeById: Map<string, CanvasNodeData>,
) {
  return storyDirectorSourceIdsForKind(storyDirector, kind).flatMap((nodeId) => imageNodeById(nodeById, nodeId));
}

function storyDirectorSourceIdsForKind(storyDirector: CanvasNodeData, kind: StoryDirectorInputKind) {
  if (kind === "scene") return storyDirector.metadata?.storySceneSourceImageNodeIds || [];
  if (kind === "prop") return storyDirector.metadata?.storyPropSourceImageNodeIds || [];
  if (kind === "character") return storyDirector.metadata?.storyCharacterSourceImageNodeIds || [];
  return storyDirector.metadata?.storySourceImageNodeIds?.length
    ? storyDirector.metadata.storySourceImageNodeIds
    : storyDirector.metadata?.storySourceImageNodeId
      ? [storyDirector.metadata.storySourceImageNodeId]
      : [];
}

function imageNodeById(nodeById: Map<string, CanvasNodeData>, nodeId?: string) {
  const node = nodeId ? nodeById.get(nodeId) : undefined;
  return isUsableImageReference(node) ? [node] : [];
}

function storyControllerConnectionId(workflowId: string, placeholderId: string) {
  return `conn-seedance2-story-controller-${workflowId}-${placeholderId}`;
}

function storyReferenceConnectionId(workflowId: string, placeholderId: string, sourceId: string) {
  return `conn-seedance2-story-ref-${workflowId}-${placeholderId}-${sourceId}`;
}

function placeholderPosition(
  workflowNode: CanvasNodeData,
  size: { width: number; height: number },
  index: number,
) {
  return {
    x: workflowNode.position.x + workflowNode.width + 140 + (index % 3) * (size.width + 40),
    y: workflowNode.position.y + Math.floor(index / 3) * (size.height + 60),
  };
}

function storyShotTitle(shot: StoryShot) {
  return stringValue(shot.title) || `第${shot.index}镜`;
}

function parseStoryShotIndex(value: unknown) {
  const text = stringValue(value);
  if (!text) return 0;
  const match = text.match(/第\s*(\d+)\s*镜/) || text.match(/镜头\s*(\d+)/);
  return positiveInteger(match?.[1]);
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isUsableImageReference(node: CanvasNodeData | undefined): node is CanvasNodeData {
  return Boolean(node && node.type === CanvasNodeType.Image && imageReferenceValue(node));
}

function imageReferenceValue(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  return [metadata.storageKey, metadata.backendUrl, metadata.content, metadata.backendRel]
    .map((value) => stringValue(value))
    .find((value) => value && !value.startsWith("blob:"));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueId(baseId: string, usedIds: Set<string>) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function safeIdPart(value: string) {
  return String(value || "node")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";
}
