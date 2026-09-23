const CanvasNodeType = {
  Image: "image",
  Video: "video",
  StoryDirector: "story_director",
  Seedance2Workflow: "seedance2_workflow"
};
import { resolveVideoReferenceSlotContract } from "../../../services/api/video-reference-slot-contract.mjs";
import { isCharacterAssetForbiddenForVideo } from "./character-video-guard.mjs";
import {
  LOCAL_SEEDANCE2_API_ENDPOINT,
  createSeedance2VideoPlaceholderMetadata,
  normalizeSeedance2Duration,
  normalizeSeedance2Resolution,
  resolveSeedance2WorkflowRatio,
  resolveSeedance2WorkflowRatioSelection,
  seedance2PlaceholderSize
} from "./seedance2-workflow.mjs";
const STORY_SLICE_REFERENCE_ORDER = ["\u5F53\u524D\u5206\u955C\u56FE", "\u89D2\u8272\u56FE", "\u573A\u666F\u56FE", "\u5176\u5B83\u53C2\u8003\u56FE"];
function packStoryVideoRequestWindows(options) {
  const pairs = options.shots.flatMap((shot, index) => {
    const image = options.images[index];
    if (!image) return [];
    return [{ shot, image, prompt: options.prompts?.[index] || "" }];
  });
  const operation = resolveRequestedStoryPackOperation(options.policy, pairs.length, options.operation, options.packMode);
  const titled = (shots) => {
    const first = shots[0];
    const last = shots[shots.length - 1];
    if (!first) return "\u6545\u4E8B\u89C6\u9891";
    if (shots.length === 1) return storyShotTitle(first);
    return `${storyShotTitle(first)}\u2013${storyShotTitle(last || first)}`;
  };
  const windowOf = (items, windowOperation) => ({
    shots: items.map((item) => item.shot),
    images: items.map((item) => item.image),
    prompts: items.map((item) => item.prompt),
    operation: windowOperation,
    shotIndex: items[0]?.shot.index || 1,
    shotTitle: titled(items.map((item) => item.shot))
  });
  if (operation === "text-to-video") {
    return options.shots.map((shot, index) => ({
      shots: [shot],
      images: [],
      prompts: [options.prompts?.[index] || ""],
      operation,
      shotIndex: shot.index,
      shotTitle: storyShotTitle(shot)
    }));
  }
  if (operation === "image-to-video" || operation === "first-last-frame-to-video") {
    if (operation === "first-last-frame-to-video") {
      const windows = [];
      for (let index = 0; index + 1 < pairs.length; index += 2) {
        windows.push(windowOf(pairs.slice(index, index + 2), operation));
      }
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
    if (options.packMode === "per_shot") {
      return pairs.map((item) => windowOf([item], "reference-to-video"));
    }
    return packNonOverlappingWindows(pairs, minimum, Math.max(maximum, minimum)).map((items) => windowOf(items, "reference-to-video"));
  }
  return pairs.map((item) => windowOf([item], operation));
}
function resolveRequestedStoryPackOperation(policy, imageCount, requested, packMode) {
  if (
    packMode !== "per_shot" &&
    imageCount > 1 &&
    (!requested || requested === "image-to-video" || requested === "reference-to-video") &&
    ((policy.referenceImagePolicy?.supported && (policy.referenceImagePolicy.max ?? 0) > 1) ||
      policy.intentPolicy === "frames-or-reference-set" ||
      policy.intentPolicy === "reference-set" ||
      policy.intentPolicy === "r2v-with-first" ||
      policy.intentPolicy === "reference-set-with-frames")
  ) {
    return "reference-to-video";
  }
  const auto = defaultStoryPackOperation(policy, imageCount);
  return requested || auto;
}
function defaultStoryPackOperation(policy, imageCount) {
  if (imageCount <= 0) return "text-to-video";
  if (policy.requiresFirstLastFrame) return "first-last-frame-to-video";
  if (policy.intentPolicy === "none") return "text-to-video";
  if (policy.intentPolicy === "keyframes" && policy.supportsKeyframeSequence) return "keyframes-to-video";
  if (policy.intentPolicy === "frames-or-reference-set" || policy.intentPolicy === "reference-set" || policy.intentPolicy === "r2v-with-first" || policy.intentPolicy === "reference-set-with-frames") {
    return "reference-to-video";
  }
  return "image-to-video";
}
function packNonOverlappingWindows(items, minimum, maximum) {
  const windows = [];
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
function resolveSeedance2StoryDirectorSource(workflowNode, nodes, connections) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connectedSources = /* @__PURE__ */ new Map();
  for (const connection of connections) {
    if (connection.toNodeId !== workflowNode.id) continue;
    const source = nodeById.get(connection.fromNodeId);
    if (source?.type === CanvasNodeType.StoryDirector) connectedSources.set(source.id, source);
  }
  if (connectedSources.size > 1) return { status: "ambiguous" };
  if (connectedSources.size === 1) return { status: "connected", source: [...connectedSources.values()][0] };
  const metadataSourceId = workflowNode.metadata?.seedanceStoryDirectorNodeId;
  const metadataSource = metadataSourceId ? nodeById.get(metadataSourceId) : void 0;
  if (metadataSource?.type === CanvasNodeType.StoryDirector) return { status: "bound", source: metadataSource };
  const storyDirectors = nodes.filter((node) => node.type === CanvasNodeType.StoryDirector);
  if (storyDirectors.length === 1) return { status: "suggested", source: storyDirectors[0] };
  return { status: storyDirectors.length > 1 ? "ambiguous" : "missing" };
}
function findSeedance2StoryDirectorSource(workflowNode, nodes, connections) {
  return resolveSeedance2StoryDirectorSource(workflowNode, nodes, connections).source;
}
function seedance2StoryShotCountDisplay(resolution) {
  const count = resolution.source?.metadata?.storyShots?.length || 0;
  return { count, label: resolution.source ? `${count} 镜 · 跟随故事导演` : "0 镜 · 等待绑定" };
}
function bindSeedance2StoryDirectorSource(options) {
  const { workflowNode, storyDirector, nodes, connections } = options;
  if (workflowNode.type !== CanvasNodeType.Seedance2Workflow) throw new Error("只能为 Seedance2 工作流绑定故事导演");
  if (storyDirector.type !== CanvasNodeType.StoryDirector) throw new Error("Seedance2 工作流来源必须是故事导演");
  const boundWorkflow = {
    ...workflowNode,
    metadata: {
      ...workflowNode.metadata,
      seedanceStoryDirectorNodeId: storyDirector.id,
      ...(storyDirector.metadata?.storyShots?.length > 0 ? { seedanceShotCount: storyDirector.metadata.storyShots.length } : {})
    }
  };
  const nextNodes = nodes.map((node) => node.id === workflowNode.id ? boundWorkflow : node);
  const hasVisibleEdge = connections.some((connection) => connection.fromNodeId === storyDirector.id && connection.toNodeId === workflowNode.id);
  if (hasVisibleEdge) return { nodes: nextNodes, connections, workflowNode: boundWorkflow };
  const usedIds = new Set(connections.map((connection) => connection.id));
  const connectionId = uniqueId(`conn-seedance2-story-source-${safeIdPart(storyDirector.id)}-${safeIdPart(workflowNode.id)}`, usedIds);
  return {
    nodes: nextNodes,
    connections: [...connections, { id: connectionId, fromNodeId: storyDirector.id, toNodeId: workflowNode.id }],
    workflowNode: boundWorkflow
  };
}
function commitSeedance2PlaceholderSetAtomic(options) {
  if (!options.sessionActive) return { status: "stale-session", nodes: options.nodes, connections: options.connections };
  const orderedCreatedNodes = [...options.built.createdNodes].sort((left, right) => Number(left.metadata?.seedanceStoryShotIndex || 0) - Number(right.metadata?.seedanceStoryShotIndex || 0));
  if (!orderedCreatedNodes.length || orderedCreatedNodes.some((node) => node.metadata?.seedanceWorkflowRole !== "placeholder" || Number(node.metadata?.seedanceStoryShotIndex || 0) <= 0)) {
    throw new Error("Seedance2 视频占位框集合不完整，未写入画布");
  }
  const createdIds = new Set(orderedCreatedNodes.map((node) => node.id));
  if (createdIds.size !== orderedCreatedNodes.length) throw new Error("Seedance2 视频占位框集合包含重复节点，未写入画布");
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
          storyPlaceholderCanReconcile(node)
      )
      .map((node) => node.id)
  );
  const existingIds = new Set(
    options.nodes.filter((node) => !supersededIds.has(node.id)).map((node) => node.id)
  );
  const nextNodes = options.nodes
    .filter((node) => !supersededIds.has(node.id))
    .map((node) => node.id === options.workflowNodeId && options.workflowMetadataPatch ? { ...node, metadata: { ...node.metadata, ...options.workflowMetadataPatch } } : node);
  for (const node of orderedCreatedNodes) {
    if (!existingIds.has(node.id)) {
      nextNodes.push(node);
      existingIds.add(node.id);
    }
  }
  const nextConnections = options.connections.filter(
    (connection) => !supersededIds.has(connection.fromNodeId) && !supersededIds.has(connection.toNodeId)
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
function buildSeedance2StoryShotPrompt(shot, context = {}) {
  const storyTitle = stringValue(context.storyTitle) || "\u5F53\u524D\u6545\u4E8B";
  const shotContent = stringValue(shot.visualContent) || stringValue(shot.imagePrompt) || stringValue(shot.title) || `\u7B2C${shot.index}\u955C`;
  const storySummary = stringValue(context.storySummary) || shotContent;
  const action = stringValue(shot.action);
  const camera = stringValue(shot.camera) || "\u7535\u5F71\u611F\u4E2D\u666F";
  const emotion = stringValue(shot.emotion);
  const voiceover = stringValue(shot.voiceover) || "\u65E0";
  const characters = (context.characters || []).map(stringValue).filter(Boolean).join("\u3001") || "\u65E0\u660E\u786E\u89D2\u8272";
  const plotPosition = stringValue(context.plotPosition) || `\u7B2C ${shot.index} \u955C`;
  const characterState = stringValue(context.characterState) || emotion || "\u6309\u5F53\u524D\u5206\u955C\u72B6\u6001";
  return `\u3010\u6545\u4E8B\u80CC\u666F\u3011
\u8FD9\u662F\u300A${storyTitle}\u300B\u4E2D\u7684\u7B2C ${shot.index} \u955C\u3002
\u6545\u4E8B\u8BB2\u8FF0\uFF1A${storySummary}

\u3010\u672C\u955C\u5934\u5185\u5BB9\u3011
\u672C\u955C\u5934\u8BB2\u8FF0\uFF1A${shotContent}
\u5F53\u524D\u5267\u60C5\u8FDB\u5C55\uFF1A${plotPosition}

\u3010\u9996\u5E27\u753B\u9762\u3011
\u4EE5\u5F53\u524D\u5206\u955C\u56FE\u4F5C\u4E3A\u9996\u5E27\uFF0C\u753B\u9762\u4E2D\u5305\u542B\uFF1A${shotContent}
\u82E5\u65E0\u5206\u955C\u56FE\uFF0C\u5219\u4EE5\u573A\u666F\u56FE\u4F5C\u4E3A\u9996\u5E27\u3002

\u3010\u51FA\u573A\u89D2\u8272\u3011
\u672C\u955C\u5934\u51FA\u573A\u89D2\u8272\uFF1A${characters}
\u89D2\u8272\u5F53\u524D\u72B6\u6001\uFF1A${characterState}

\u3010\u753B\u9762\u52A8\u4F5C\u3011
${action}

\u3010\u955C\u5934\u8FD0\u52A8\u3011
${camera}

\u3010\u60C5\u7EEA\u6C1B\u56F4\u3011
${emotion}

\u3010\u5BF9\u767D/\u8868\u6F14\u3011
${voiceover}

\u753B\u9762\u65E0\u5B57\u5E55`;
}
function seedance2UserPromptPatch(prompt) {
  return {
    prompt,
    seedancePromptEditedByUser: true
  };
}
function seedance2RegeneratePromptPatch(metadata) {
  return {
    prompt: stringValue(metadata?.seedanceAutoPrompt) || stringValue(metadata?.prompt),
    seedancePromptEditedByUser: false
  };
}
function buildStoryDirectorSlicePlaceholders(options) {
  const { workflowNode, nodes, connections } = options;
  const storyDirector = options.storyDirector?.type === CanvasNodeType.StoryDirector ? options.storyDirector : findSeedance2StoryDirectorSource(workflowNode, nodes, connections);
  if (!storyDirector) {
    return { nodes, connections, storyDirector: void 0, missingCurrentShotIndexes: [] };
  }
  const shots = [...storyDirector.metadata?.storyShots || []].sort((left, right) => left.index - right.index);
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
      ratioTouched: workflowMetadata.seedanceRatioTouched
    }),
    upstreamRatio: storyDirector.metadata?.storyAspectRatio
  });
  const duration = normalizeSeedance2Duration(workflowMetadata.seedanceDuration || workflowMetadata.seconds);
  const resolution = normalizeSeedance2Resolution(workflowMetadata.seedanceResolution || workflowMetadata.vquality);
  const model = workflowMetadata.seedanceModel || workflowMetadata.model || "";
  const apiEndpoint = workflowMetadata.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const generateCount = 1;
  const videoSize = seedance2PlaceholderSize(ratio);
  const nextNodes = [];
  const placeholderConnections = [];
  const missingCurrentShotIndexes = [];
  const updatedNodesById = /* @__PURE__ */ new Map();
  const policy = resolveStoryReferencePrefillPolicy(options.capability, options.referencePolicy);
  const shotImages = shots.map((shot) => {
    const currentShotCandidate = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    const currentShot = currentShotCandidate && imageReferenceValue(currentShotCandidate) ? currentShotCandidate : void 0;
    if (!currentShot) missingCurrentShotIndexes.push(shot.index);
    return currentShot;
  });
  const requestWindows = packStoryVideoRequestWindows({
    shots,
    images: shotImages,
    operation: storyReferenceSubmissionOperation(workflowMetadata),
    policy
  });
  requestWindows.forEach((window, orderIndex) => {
    const shot = window.shots[0];
    if (!shot) return;
    const shotTitle = window.shotTitle;
    const currentShot = window.images[0];
    const existingPlaceholder = existingPlaceholderByShotIndex.get(window.shotIndex);
    const placeholderId = existingPlaceholder?.id || uniqueId(
      `video-seedance2-story-${safeIdPart(workflowNode.id)}-${safeIdPart(shot.id || String(window.shotIndex))}-${now}`,
      existingNodeIds
    );
    existingNodeIds.add(placeholderId);
    if (existingPlaceholder && !storyPlaceholderCanReconcile(existingPlaceholder)) {
      updatedNodesById.set(existingPlaceholder.id, existingPlaceholder);
      return;
    }
    const windowScope = {
      ...(workflowMetadata.videoGenerationScope || {}),
      operation: window.operation
    };
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
      operation: window.operation
    });
    const storyMetadata = buildStoryPlaceholderMetadata({
      workflowNode,
      storyDirector,
      shot,
      shotTitle,
      currentShot,
      generatedPrompt: window.shots.map((item) => buildSeedance2StoryShotPrompt(item, storyPromptContext(item, storyDirector))).filter(Boolean).join("\n\n"),
      referencePlan
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
      referenceOrder: [...STORY_SLICE_REFERENCE_ORDER]
    });
    const metadata = mergePlaceholderMetadata(
      existingPlaceholder?.metadata,
      { ...baseMetadata, ...workflowVideoGenerationSnapshot(workflowMetadata), videoGenerationScope: windowScope },
      storyMetadata,
      { ...workflowMetadata, videoGenerationScope: windowScope }
    );
    const placeholder = existingPlaceholder ? {
      ...existingPlaceholder,
      type: CanvasNodeType.Video,
      title: existingPlaceholder.title || `${shotTitle} Seedance2 \u89C6\u9891`,
      width: existingPlaceholder.width,
      height: existingPlaceholder.height,
      metadata
    } : {
      id: placeholderId,
      type: CanvasNodeType.Video,
      title: `${shotTitle} Seedance2 \u89C6\u9891`,
      position: placeholderPosition(workflowNode, videoSize, orderIndex),
      width: videoSize.width,
      height: videoSize.height,
      metadata
    };
    updatedNodesById.set(placeholder.id, placeholder);
    placeholderConnections.push({
      id: storyControllerConnectionId(workflowNode.id, placeholder.id),
      fromNodeId: workflowNode.id,
      toNodeId: placeholder.id
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
    referencePolicy: options.referencePolicy
  });
  return {
    nodes: nextNodes,
    connections: nextConnections,
    storyDirector,
    missingCurrentShotIndexes
  };
}
function collectSeedance2StoryRewriteInput(options) {
  const { storyDirector, nodes, connections } = options;
  const storyValue = storyDirector.metadata?.storyText ?? storyDirector.metadata?.content ?? "";
  const story = typeof storyValue === "string" ? storyValue : "";
  if (!story.trim()) throw new Error("Seedance2 \u6574\u6279\u6539\u5199\u7F3A\u5C11\u5B8C\u6574\u6545\u4E8B\u5185\u5BB9");
  const allStoryShots = [...storyDirector.metadata?.storyShots || []].sort((left, right) => left.index - right.index);
  const requestedShotId = stringValue(options.shotId);
  const requestedShotIndex = positiveInteger(options.shotIndex);
  const requestedShot = allStoryShots.find((shot) => requestedShotId && shot.id === requestedShotId) || allStoryShots.find((shot) => requestedShotIndex && shot.index === requestedShotIndex);
  const storyShots = requestedShotId || requestedShotIndex ? requestedShot ? [requestedShot] : [] : allStoryShots;
  if (!storyShots.length) throw new Error("Seedance2 \u6574\u6279\u6539\u5199\u6CA1\u6709\u53EF\u7528\u5206\u955C");
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const shots = storyShots.map((shot) => {
    const currentShot = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    if (!currentShot) throw new Error(`Seedance2 \u7B2C ${shot.index} \u955C\u7F3A\u5C11\u5F53\u524D\u5206\u955C\u56FE`);
    const directorRunId = storyDirector.metadata?.storyRunId;
    const imageRunId = currentShot.metadata?.storyRunId;
    const isMatchingRun = !directorRunId || !imageRunId || directorRunId === imageRunId;
    const currentPrompt = isMatchingRun && typeof currentShot.metadata?.prompt === "string" && currentShot.metadata.prompt.trim()
      ? currentShot.metadata.prompt
      : stringValue(shot.imagePrompt) || stringValue(shot.visualContent) || (typeof currentShot.metadata?.prompt === "string" ? currentShot.metadata.prompt : "");
    const storyContext = {
      sceneId: stringValue(shot.sceneId) || void 0,
      appearingCharacterIds: Array.isArray(shot.appearingCharacterIds) ? shot.appearingCharacterIds : [],
      excludedCharacterIds: Array.isArray(shot.excludedCharacterIds) ? shot.excludedCharacterIds : [],
      action: stringValue(shot.action),
      camera: stringValue(shot.camera),
      emotion: stringValue(shot.emotion) || void 0,
      continuityNote: stringValue(shot.continuityNote) || void 0,
      characterState: stringValue(shot.characterState) || void 0,
      visualContent: stringValue(shot.visualContent) || void 0,
      voiceover: stringValue(shot.voiceover) || void 0,
      imagePrompt: stringValue(shot.imagePrompt),
      finalPrompt: stringValue(shot.finalPrompt) || void 0
    };
    const hasStoryContext = Object.values(storyContext).some(
      (value) => Array.isArray(value) ? value.length > 0 : Boolean(value)
    );
    return {
      shotId: shot.id,
      shotIndex: shot.index,
      title: storyShotTitle(shot),
      sourceImageNodeId: currentShot.id,
      sourceImage: imageReferenceValue(currentShot),
      currentPrompt,
      ...hasStoryContext ? { storyContext } : {}
    };
  });
  return { story, shots, template: options.template };
}
function createSeedance2SequentialPlaceholderRun(options) {
  const ordered = [...options.rewrittenShots].sort((left, right) => left.shotIndex - right.shotIndex);
  const startShotIndex = options.startShotIndex ?? ordered[0]?.shotIndex ?? 1;
  const createdShotIndexes = [];
  for (const shot of ordered) {
    if (shot.shotIndex < startShotIndex) continue;
    try {
      options.appendShot(shot);
      createdShotIndexes.push(shot.shotIndex);
    } catch (error) {
      return {
        createdShotIndexes,
        nextShotIndex: shot.shotIndex,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  return {
    createdShotIndexes,
    nextShotIndex: null,
    error: null
  };
}
function buildVersionedStoryDirectorSlicePlaceholders(options) {
  const { workflowNode, storyDirector, nodes, connections } = options;
  if (storyDirector.type !== CanvasNodeType.StoryDirector) {
    throw new Error("Seedance2 \u6574\u6279\u6539\u5199\u7F3A\u5C11\u6545\u4E8B\u5BFC\u6F14\u6765\u6E90");
  }
  const shots = [...storyDirector.metadata?.storyShots || []].sort((left, right) => left.index - right.index);
  if (!shots.length) throw new Error("Seedance2 \u6574\u6279\u6539\u5199\u6CA1\u6709\u53EF\u7528\u5206\u955C");
  assertStoryVideoPlaceholderCapability(options.capability, options.referencePolicy);
  const rewrittenByShot = /* @__PURE__ */ new Map();
  options.rewrittenShots.forEach((shot) => {
    rewrittenByShot.set(shot.shotId || `index:${shot.shotIndex}`, shot);
    rewrittenByShot.set(`index:${shot.shotIndex}`, shot);
  });
  const rewrittenInOrder = shots.map((shot) => {
    const rewritten = rewrittenByShot.get(shot.id) || rewrittenByShot.get(`index:${shot.index}`);
    if (!rewritten) throw new Error(`Seedance2 \u6574\u6279\u63D0\u793A\u8BCD\u7F3A\u5C11 ${shot.id || `\u7B2C ${shot.index} \u955C`}`);
    const prompt = stringValue(rewritten.prompt);
    if (!prompt) throw new Error(`Seedance2 \u6574\u6279\u63D0\u793A\u8BCD\u4E2D ${shot.id || `\u7B2C ${shot.index} \u955C`} \u7684 prompt \u4E3A\u7A7A`);
    return { shot, prompt };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const currentShots = rewrittenInOrder.map(({ shot }) => findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections));
  const workflowMetadata = workflowNode.metadata || {};
  const policy = resolveStoryReferencePrefillPolicy(options.capability, options.referencePolicy);
  const packMode = workflowMetadata.seedanceStoryPackMode || "per_shot";
  const requestWindows = packStoryVideoRequestWindows({
    shots: rewrittenInOrder.map(({ shot }) => shot),
    images: currentShots,
    prompts: rewrittenInOrder.map(({ prompt }) => prompt),
    operation: storyReferenceSubmissionOperation(workflowMetadata),
    policy,
    packMode
  });
  if (!requestWindows.length) throw new Error("\u5F53\u524D\u5206\u955C\u56FE\u4E0D\u8DB3\u4EE5\u6309\u6A21\u578B\u80FD\u529B\u7EC4\u6210\u4E00\u6B21\u89C6\u9891\u8BF7\u6C42");
  const rewriteModel = stringValue(options.rewriteModel);
  if (!rewriteModel) throw new Error("Seedance2 \u6574\u6279\u6539\u5199\u7F3A\u5C11\u6587\u672C\u6A21\u578B");
  const now = options.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const setVersion = nextSeedancePlaceholderSetVersion(workflowNode.id, nodes);
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const ratio = resolveSeedance2WorkflowRatio({
    storedRatio: workflowMetadata.seedanceRatio || workflowMetadata.size,
    selection: resolveSeedance2WorkflowRatioSelection({
      selection: workflowMetadata.seedanceRatioSelection,
      inheritSourceRatio: workflowMetadata.seedanceInheritSourceRatio,
      ratioTouched: workflowMetadata.seedanceRatioTouched
    }),
    upstreamRatio: storyDirector.metadata?.storyAspectRatio
  });
  const duration = normalizeSeedance2Duration(workflowMetadata.seedanceDuration || workflowMetadata.seconds);
  const resolution = normalizeSeedance2Resolution(workflowMetadata.seedanceResolution || workflowMetadata.vquality);
  const model = workflowMetadata.seedanceModel || workflowMetadata.model || "";
  const apiEndpoint = workflowMetadata.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const generateCount = 1;
  const videoSize = seedance2PlaceholderSize(ratio);
  const groupStartY = nextSeedancePlaceholderGroupY(workflowNode, nodes);
  const createdNodes = [];
  const createdConnections = [];
  requestWindows.forEach((window, orderIndex) => {
    const shot = window.shots[0];
    if (!shot) return;
    const currentShot = window.images[0];
    const prompt = window.prompts.filter(Boolean).join("\n\n") || rewrittenInOrder.find((item) => item.shot.id === shot.id)?.prompt || "";
    const shotTitle = window.shotTitle;
    const placeholderId = uniqueId(
      `video-seedance2-story-${safeIdPart(workflowNode.id)}-v${setVersion}-${safeIdPart(shot.id || String(window.shotIndex))}-${now}`,
      existingNodeIds
    );
    const windowScope = {
      ...(workflowMetadata.videoGenerationScope || {}),
      operation: window.operation
    };
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
      operation: window.operation
    });
    const storyMetadata = buildStoryPlaceholderMetadata({
      workflowNode,
      storyDirector,
      shot,
      shotTitle,
      currentShot,
      generatedPrompt: prompt,
      referencePlan
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
      referenceOrder: [...STORY_SLICE_REFERENCE_ORDER]
    });
    const placeholder = {
      id: placeholderId,
      type: CanvasNodeType.Video,
      title: `${shotTitle} Seedance2 \u89C6\u9891 V${setVersion}`,
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
        seedancePromptRewriteCreatedAt: createdAt
      }
    };
    createdNodes.push(placeholder);
    createdConnections.push({
      id: storyControllerConnectionId(workflowNode.id, placeholder.id),
      fromNodeId: workflowNode.id,
      toNodeId: placeholder.id
    });
    appendStoryReferenceConnections(createdConnections, workflowNode.id, placeholder.id, referencePlan);
  });
  const nextNodes = [...nodes, ...createdNodes];
  const nextConnections = reconcileSeedance2StoryPlaceholderReferences({
    nodes: nextNodes,
    connections: [...connections, ...createdConnections],
    capability: options.capability,
    referencePolicy: options.referencePolicy
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
    setVersion
  };
}
function findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections) {
  const directOutputIds = new Set(
    connections.filter((connection) => connection.fromNodeId === storyDirector.id).map((connection) => connection.toNodeId)
  );
  const isCurrentShotMatch = (node) => isUsableImageReference(node) && storyShotIndexesFromImageNode(node).includes(shot.index);
  const targetRunId = storyDirector.metadata?.storyRunId;
  const bestCurrentShotMatch = (candidates) => {
    const matches = candidates.filter(isCurrentShotMatch);
    if (!matches.length) return void 0;
    if (targetRunId) {
      const runMatched = matches.filter((node) => node.metadata?.storyRunId === targetRunId);
      if (runMatched.length) {
        return runMatched.find((node) => {
          const indexes = storyShotIndexesFromImageNode(node);
          return indexes.length === 1 && indexes[0] === shot.index;
        }) || runMatched[0];
      }
    }
    return matches.find((node) => {
      const indexes = storyShotIndexesFromImageNode(node);
      return indexes.length === 1 && indexes[0] === shot.index;
    }) || matches[0];
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
    connections
  ));
}
function storyShotIndexesFromImageNode(node) {
  const metadata = node.metadata || {};
  const rangeStart = positiveInteger(metadata.storyGrid9ShotStart);
  const rangeEnd = positiveInteger(metadata.storyGrid9ShotEnd);
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset);
  }
  const parsedIndex = parseStoryShotIndex(metadata.storyLabel) || parseStoryShotIndex(node.title);
  return parsedIndex ? [parsedIndex] : [];
}
function existingSeedancePlaceholdersByShotIndex(workflowNode, nodes) {
  const byShotIndex = /* @__PURE__ */ new Map();
  nodes.filter((node) => isStoryPlaceholderForWorkflow(node, workflowNode.id)).forEach((node) => {
    const shotIndex = seedancePlaceholderShotIndex(node);
    if (!shotIndex) return;
    if (!byShotIndex.has(shotIndex)) byShotIndex.set(shotIndex, node);
  });
  return byShotIndex;
}
function isStoryPlaceholderForWorkflow(node, workflowNodeId) {
  return node.metadata?.seedanceWorkflowNodeId === workflowNodeId && node.metadata?.seedanceWorkflowRole === "placeholder";
}
function seedancePlaceholderShotIndex(node) {
  return positiveInteger(node.metadata?.seedanceStoryShotIndex) || positiveInteger(node.metadata?.seedanceShotIndex);
}
function buildStoryPlaceholderMetadata(options) {
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
    seedanceStoryPackedImageNodeIds: options.referencePlan.drawable.filter((reference) => reference.role === "current_shot" || reference.role === "upstream_frame").map((reference) => reference.node.id).filter((id, index, ids) => ids.indexOf(id) === index),
    seedanceReferenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    seedanceRequiredReferences: ["\u5F53\u524D\u5206\u955C\u56FE"],
    seedanceStoryAutoReferenceOmittedCount: options.referencePlan.omittedCount,
    ...options.referencePlan.notice ? { seedanceStoryAutoReferenceNotice: options.referencePlan.notice } : {},
    seedanceAutoPrompt: options.generatedPrompt,
    seedancePromptEditedByUser: false,
    seedancePromptPanelMode: "compact",
    prompt: options.generatedPrompt
  };
}
function mergePlaceholderMetadata(existingMetadata, baseMetadata, storyMetadata, workflowMetadata) {
  if (!existingMetadata) return { ...baseMetadata, ...storyMetadata };
  const next = { ...baseMetadata, ...storyMetadata, ...existingMetadata };
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
    seedanceAutoPrompt: storyMetadata.seedanceAutoPrompt
  });
  applyWorkflowVideoGenerationSnapshot(next, baseMetadata, workflowMetadata);
  if (!storyMetadata.seedanceStoryAutoReferenceNotice) delete next.seedanceStoryAutoReferenceNotice;
  next.seedanceReferenceSlotBindings = mergeProtectedReferenceSlotBindings(
    existingMetadata.seedanceReferenceSlotBindings,
    existingMetadata.seedanceStorySourceImageNodeId,
    storyMetadata.seedanceStorySourceImageNodeId
  );
  next.seedancePromptPanelMode = existingMetadata.seedancePromptPanelMode === "inline" || existingMetadata.seedancePromptEditedByUser === true ? "inline" : "compact";
  return next;
}
function workflowVideoGenerationSnapshot(metadata) {
  const snapshot = {};
  if (metadata.videoGenerationSettings !== void 0) snapshot.videoGenerationSettings = metadata.videoGenerationSettings;
  if (metadata.videoGenerationScope !== void 0) snapshot.videoGenerationScope = metadata.videoGenerationScope;
  if (metadata.videoGenerationCapabilityId !== void 0) snapshot.videoGenerationCapabilityId = metadata.videoGenerationCapabilityId;
  if (metadata.videoWireFormat !== void 0) snapshot.videoWireFormat = metadata.videoWireFormat;
  if (metadata.videoGenerationOperationMigration !== void 0) snapshot.videoGenerationOperationMigration = metadata.videoGenerationOperationMigration;
  return snapshot;
}
const VIDEO_REFERENCE_SUBMISSION_OPERATIONS = /* @__PURE__ */ new Set([
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "first-last-frame-to-video",
  "keyframes-to-video",
  "continuation",
  "video-edit"
]);
function storyReferenceSubmissionOperation(metadata) {
  const operation = metadata?.videoGenerationScope?.operation;
  return VIDEO_REFERENCE_SUBMISSION_OPERATIONS.has(operation) ? operation : void 0;
}
function applyWorkflowVideoGenerationSnapshot(target, baseMetadata, workflowMetadata) {
  target.model = baseMetadata.model;
  target.seedanceModel = baseMetadata.seedanceModel;
  target.seedanceApiProvider = baseMetadata.seedanceApiProvider;
  target.seedanceApiEndpoint = baseMetadata.seedanceApiEndpoint;
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationSettings");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationScope");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationCapabilityId");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoWireFormat");
  applyOptionalWorkflowSnapshotField(target, workflowMetadata, "videoGenerationOperationMigration");
}
function applyOptionalWorkflowSnapshotField(target, source, key) {
  if (source[key] === void 0) {
    delete target[key];
    return;
  }
  target[key] = source[key];
}
function assignDefinedMetadata(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    if (value !== void 0) target[key] = value;
  });
}
function mergeProtectedReferenceSlotBindings(existing, previousStorySourceImageNodeId, nextStorySourceImageNodeId) {
  const next = { ...existing || {} };
  const legacyCurrentShotNodeId = next.current_shot?.nodeId;
  if (legacyCurrentShotNodeId && (legacyCurrentShotNodeId === previousStorySourceImageNodeId || legacyCurrentShotNodeId === nextStorySourceImageNodeId)) {
    delete next.current_shot;
  }
  return next;
}
function storyPromptContext(shot, storyDirector) {
  const characterById = new Map(
    (storyDirector.metadata?.storyCharacters || []).map((character) => [character.id, character.name])
  );
  const directorTitle = stringValue(storyDirector.title);
  return {
    storyTitle: directorTitle === "\u6545\u4E8B\u5BFC\u6F14" ? void 0 : directorTitle,
    storySummary: stringValue(storyDirector.metadata?.storyText) || stringValue(storyDirector.metadata?.content),
    characters: (shot.appearingCharacterIds || []).map((id) => stringValue(characterById.get(id))).filter(Boolean),
    plotPosition: `\u7B2C ${shot.index} \u955C`,
    characterState: stringValue(shot.characterState) || stringValue(shot.emotion)
  };
}
function connectionEndpointKey(connection) {
  const assetId = connection.referenceAssetId && connection.referenceAssetStorageKey ? connection.referenceAssetId : "parent";
  return `${connection.fromNodeId}->${connection.toNodeId}:${assetId}`;
}
function nextSeedancePlaceholderSetVersion(workflowNodeId, nodes) {
  let maximumVersion = 0;
  nodes.filter((node) => isStoryPlaceholderForWorkflow(node, workflowNodeId)).forEach((node) => {
    const savedVersion = positiveInteger(node.metadata?.seedancePlaceholderSetVersion);
    maximumVersion = Math.max(maximumVersion, savedVersion || 1);
  });
  return maximumVersion + 1;
}
function nextSeedancePlaceholderGroupY(workflowNode, nodes) {
  const existingPlaceholders = nodes.filter((node) => isStoryPlaceholderForWorkflow(node, workflowNode.id));
  if (!existingPlaceholders.length) return workflowNode.position.y;
  return Math.max(...existingPlaceholders.map((node) => node.position.y + node.height)) + 60;
}
function versionedPlaceholderPosition(workflowNode, size, index, groupStartY) {
  return {
    x: workflowNode.position.x + workflowNode.width + 140 + index % 3 * (size.width + 40),
    y: groupStartY + Math.floor(index / 3) * (size.height + 60)
  };
}
function resolveStoryReferencePrefillPolicy(capability, policy) {
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
      generationParameters: capability.generationParameters
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
    generationParameters: undefined
  };
}
function assertStoryVideoPlaceholderCapability(capability, policy) {
  const resolved = resolveStoryReferencePrefillPolicy(capability, policy);
  if ((capability || policy) && resolved.videoInputPolicy?.supported && resolved.videoInputPolicy.min > 0) {
    throw new Error(`\u5F53\u524D\u89C6\u9891\u6A21\u578B\u8981\u6C42\u81F3\u5C11 ${resolved.videoInputPolicy.min} \u4E2A\u6E90\u89C6\u9891\uFF0C\u6545\u4E8B\u5BFC\u6F14\u5DE5\u4F5C\u6D41\u65E0\u6CD5\u521B\u5EFA\u53EF\u7528\u5360\u4F4D\u6846`);
  }
  return resolved;
}
function assertStoryReferencePlanRequirements({ policy, references, videos, shotIndex, contractState, contractReason, enforceContractState }) {
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
  if (["single-frame", "i2v", "keyframes"].includes(policy.intentPolicy) && !first) {
    throw new Error(`第 ${shotIndex} 镜选择的模型需要首帧，但当前故事分镜没有可用首帧`);
  }
  const minimum = policy.referenceImagePolicy.supported ? policy.referenceImagePolicy.min : 0;
  const enforcePublishedMinimum = policy.id !== "ark-unknown";
  if (enforcePublishedMinimum && policy.storyAutoReferencePolicy !== "disabled" && ["reference-set", "r2v-with-first"].includes(policy.intentPolicy)) {
    if (ordinary < minimum) throw new Error(`第 ${shotIndex} 镜选择的模型至少需要 ${minimum} 张普通参考图，当前只准备了 ${ordinary} 张`);
  } else if (enforcePublishedMinimum && policy.intentPolicy === "frames-or-reference-set" && first === 0 && ordinary < minimum) {
    throw new Error(`第 ${shotIndex} 镜选择的模型需要首帧或至少 ${minimum} 张普通参考图`);
  } else if (enforcePublishedMinimum && policy.intentPolicy === "reference-set-with-frames" && first + last + ordinary < minimum) {
    throw new Error(`第 ${shotIndex} 镜选择的模型至少需要 ${minimum} 张参考图或帧`);
  }
}
function completeStoryReferencePolicy(policy) {
  const temporal = policy.intentPolicy === "single-frame" || policy.intentPolicy === "i2v" || policy.intentPolicy === "keyframes";
  return {
    id: policy.id || "ark-unknown",
    intentPolicy: policy.intentPolicy,
    referenceImagePolicy: policy.referenceImagePolicy,
    autoCharacterDerivedViewPolicy: policy.autoCharacterDerivedViewPolicy,
    storyAutoReferencePolicy: policy.storyAutoReferencePolicy,
    supportsFirstFrame: policy.supportsFirstFrame ?? temporal,
    supportsFirstLastFrame: policy.supportsFirstLastFrame ?? false,
    supportsKeyframeSequence: policy.supportsKeyframeSequence ?? policy.intentPolicy === "keyframes",
    keyframeImageMinimum: policy.keyframeImageMinimum,
    keyframeImageLimit: policy.keyframeImageLimit,
    supportsReferenceSetWithFirst: policy.supportsReferenceSetWithFirst ?? policy.intentPolicy === "r2v-with-first",
    supportsReferenceSetWithFrames: policy.supportsReferenceSetWithFrames ?? policy.intentPolicy === "reference-set-with-frames",
    requiresFirstLastFrame: policy.requiresFirstLastFrame,
    requiresExplicitProfile: policy.requiresExplicitProfile,
    referenceContractBlockReason: policy.referenceContractBlockReason,
    videoInputPolicy: policy.videoInputPolicy || { supported: false },
    sharedImageVideoMaximum: policy.sharedImageVideoMaximum,
    generationParameters: policy.generationParameters
  };
}
function referenceNodesForShot(options) {
  const { shot, storyDirector, nodeById, connections, policy, operation } = options;
  const packedImages = (options.packedImages || []).filter(isUsableImageReference);
  const currentShot = packedImages[0] || options.currentShot;
  const packedShots = options.packedShots?.length ? options.packedShots : (shot ? [shot] : []);
  const currentShotTemporalPolicy = policy.intentPolicy === "single-frame" || policy.intentPolicy === "keyframes" || policy.intentPolicy === "i2v" || policy.intentPolicy === "frames-or-reference-set" && operation !== "reference-to-video";
  const operationSupportsSemanticReferences = operation === "reference-to-video" && ["reference-set", "r2v-with-first", "frames-or-reference-set", "reference-set-with-frames"].includes(policy.intentPolicy);
  const temporalReferences = [];
  const ordinaryCandidates = [];
  const seenValues = /* @__PURE__ */ new Set();
  const pushReference = (target, node, role, label, entityId, useAs = "reference_image", asset) => {
    if (!isUsableImageReference(node)) return;
    const value = asset?.storageKey || imageReferenceValue(node);
    const identity = asset?.id || `node:${node.id}`;
    if (seenValues.has(identity) || value && seenValues.has(`value:${value}`)) return;
    seenValues.add(identity);
    if (value) seenValues.add(`value:${value}`);
    target.push({
      node,
      role,
      label,
      ...entityId ? { entityId } : {},
      useAs,
      ...asset ? { referenceAssetId: asset.id, referenceAssetStorageKey: asset.storageKey } : {}
    });
  };
  const isTextOnlyOperation = operation === "text-to-video";
  if (!isTextOnlyOperation && (currentShotTemporalPolicy || policy.intentPolicy === "r2v-with-first" || policy.intentPolicy === "reference-set-with-frames" || policy.intentPolicy === "blocked" || policy.intentPolicy === "none")) {
    pushReference(temporalReferences, currentShot, "current_shot", "当前分镜图", void 0, "first_frame");
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
    const wantsKeyframe = operation ? operation === "keyframes-to-video" : policy.intentPolicy === "keyframes" && policy.supportsKeyframeSequence;
    const wantsLastFrame = operation ? operation === "first-last-frame-to-video" ? Boolean(policy.supportsFirstLastFrame) : operation === "image-to-video" && policy.intentPolicy === "i2v" && Boolean(policy.supportsFirstLastFrame) : policy.intentPolicy === "i2v" && policy.supportsFirstLastFrame;
    if (wantsKeyframe && policy.supportsKeyframeSequence) {
      const following = packedImages.length > 1
        ? packedImages.slice(1)
        : followingOrderedStoryShotImages({ shot, storyDirector, nodeById, connections, limit: 1 });
      following.forEach((image, index) => {
        pushReference(temporalReferences, image, "upstream_frame", index === 0 ? "下一分镜图" : `后续关键帧 ${index + 2}`, void 0, "keyframe");
      });
    } else if (wantsLastFrame && policy.supportsFirstLastFrame) {
      const nextShotImage = packedImages[1] || followingOrderedStoryShotImages({ shot, storyDirector, nodeById, connections, limit: 1 })[0];
      pushReference(temporalReferences, nextShotImage, "upstream_frame", "下一分镜图", void 0, "last_frame");
    }
  }
  let notice;
  const extraViewsByCharacter = [];
  if (packedShots.length && storyDirector) {
    const characterPlan = appearingCharacterReferenceNodesForShots(packedShots, storyDirector, nodeById, connections, "multi-view");
    characterPlan.primary.forEach((reference) => {
      pushReference(ordinaryCandidates, reference.node, "character", reference.label, reference.entityId, "reference_image", reference.asset);
    });
    extraViewsByCharacter.push(...characterPlan.extraByCharacter);
    if (characterPlan.notices.length) notice = characterPlan.notices.join("\uFF1B");
    sceneReferenceNodes(shot, storyDirector, nodeById, connections).forEach((reference) => {
      pushReference(ordinaryCandidates, reference.node, "scene", reference.label, reference.entityId);
    });
    propReferenceNodes(shot, storyDirector, nodeById, connections).forEach((node) => {
      pushReference(ordinaryCandidates, node, "prop", `\u5176\u5B83\u53C2\u8003\u56FE\uFF1A${stringValue(node.title) || node.id}`);
    });
  }
  if (currentShot) {
    orderedImageInputConnections(currentShot.id, nodeById, connections).forEach(({ node }) => {
      pushReference(ordinaryCandidates, node, "upstream_frame", stringValue(node.title) || "\u4E0A\u6E38\u53C2\u8003\u56FE");
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
        storageKey: assetStorageKey
      });
    });
  }
  const orderedCandidates = [...temporalReferences, ...ordinaryCandidates];
  const workflowExcluded = [];
  const derivedEntityIds = /* @__PURE__ */ new Set();
  const eligibleCandidates = orderedCandidates.filter((reference) => {
    if (policy.storyAutoReferencePolicy === "disabled") {
      workflowExcluded.push({ reference, reasonCode: "workflow-policy", reason: "\u5F53\u524D service \u672A\u542F\u7528 Story \u81EA\u52A8\u53C2\u8003\u63D0\u4EA4\uFF0C\u8BE5\u5019\u9009\u4E0D\u4F1A\u63D0\u4EA4" });
      return false;
    }
    if (policy.storyAutoReferencePolicy === "current-shot" && !operationSupportsSemanticReferences && reference.role !== "current_shot" && reference.useAs === "reference_image") {
      workflowExcluded.push({ reference, reasonCode: "workflow-policy", reason: "\u5F53\u524D\u6A21\u578B\u53EA\u81EA\u52A8\u63D0\u4EA4\u5F53\u524D\u5206\u955C\u7684\u65F6\u5E8F\u56FE\uFF0C\u8BE5\u8BED\u4E49\u5019\u9009\u4E0D\u4F1A\u63D0\u4EA4" });
      return false;
    }
    if (reference.referenceAssetId && policy.autoCharacterDerivedViewPolicy === "disabled") {
      workflowExcluded.push({ reference, reasonCode: "workflow-policy", reason: "\u5F53\u524D\u6A21\u578B\u672A\u542F\u7528\u6D3E\u751F\u89D2\u8272\u89C6\u56FE\u81EA\u52A8\u63D0\u4EA4\uFF0C\u8BE5\u5019\u9009\u4E0D\u4F1A\u63D0\u4EA4" });
      return false;
    }
    if (reference.referenceAssetId && policy.autoCharacterDerivedViewPolicy === "single-view" && !operationSupportsSemanticReferences) {
      const entityId = reference.entityId || reference.node.id;
      if (derivedEntityIds.has(entityId)) {
        workflowExcluded.push({ reference, reasonCode: "workflow-policy", reason: "\u5F53\u524D\u6A21\u578B\u6BCF\u4E2A\u89D2\u8272\u53EA\u81EA\u52A8\u63D0\u4EA4\u4E00\u4E2A\u6D3E\u751F\u89C6\u56FE\uFF0C\u5176\u5B83\u89C6\u56FE\u4E0D\u4F1A\u63D0\u4EA4" });
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
      keyframeImageMinimum: void 0,
      id: policy.id || "ark-unknown",
      provider: "ark",
      label: policy.id,
      providerLabel: policy.id,
      model: policy.id,
      profileConfigured: true,
      generationParameters: {}
    },
    operation,
    references: eligibleCandidates,
    videos: connections.flatMap((connection) => {
      if (!options.targetNodeId || connection.toNodeId !== options.targetNodeId) return [];
      if (nodeById.get(connection.fromNodeId)?.type !== CanvasNodeType.Video) return [];
      return [{ useAs: connection.videoUseAs }];
    })
  });
  const notSubmitted = [...workflowExcluded, ...contract.notSubmitted];
  const omittedCount = notSubmitted.length;
  if (omittedCount > 0) {
    const reasons = Array.from(new Set(notSubmitted.map((item) => item.reason))).join("\uFF1B");
    notice = [notice, `\u5F53\u524D\u63D0\u4EA4\u8BA1\u5212\u4E0D\u76F4\u4F20 ${omittedCount} \u4E2A\u76F8\u5173\u5019\u9009\uFF1A${reasons}\u3002`].filter(Boolean).join("\uFF1B");
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
    ...contract.reason ? { contractReason: contract.reason } : {},
    ...notice ? { notice } : {}
  };
}
function appendStoryReferenceConnections(target, workflowId, placeholderId, plan) {
  plan.drawable.forEach((reference) => {
    target.push(storySemanticReferenceConnection(workflowId, placeholderId, reference));
  });
}

function followingOrderedStoryShotImages(options) {
  const { shot, storyDirector, nodeById, connections, limit = 1 } = options;
  if (!shot || !storyDirector) return [];
  const orderedShots = [...storyDirector.metadata?.storyShots || []].sort((left, right) => left.index - right.index);
  const position = orderedShots.findIndex((candidate) => shot.id && candidate.id === shot.id || candidate.index === shot.index);
  if (position < 0) return [];
  const images = [];
  const imageNodes = [...nodeById.values()].filter((node) => node.type === CanvasNodeType.Image);
  for (let index = position + 1; index < orderedShots.length && images.length < limit; index += 1) {
    const image = findCurrentShotImageForStoryShot(orderedShots[index], storyDirector, imageNodes, connections);
    if (image) images.push(image);
  }
  return images;
}
function storySemanticReferenceConnection(workflowId, placeholderId, reference, referenceSequence) {
  return {
    id: storyReferenceConnectionId(workflowId, placeholderId, reference.referenceAssetId || reference.node.id),
    fromNodeId: reference.node.id,
    toNodeId: placeholderId,
    ...referenceSequence ? { referenceSequence } : {},
    referenceRole: reference.role,
    referenceLabel: reference.label,
    ...reference.entityId ? { referenceEntityId: reference.entityId } : {},
    useAs: reference.useAs,
    referenceOrigin: "story_auto",
    ...reference.referenceAssetId && reference.referenceAssetStorageKey ? {
      referenceAssetId: reference.referenceAssetId,
      referenceAssetStorageKey: reference.referenceAssetStorageKey
    } : {}
  };
}
function reconcileSeedance2StoryPlaceholderReferences(options) {
  const { nodes, connections } = options;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const placeholders = nodes.filter((node) => {
    const currentShotId = node.metadata?.seedanceStorySourceImageNodeId;
    return node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder" && typeof currentShotId === "string" && nodeById.get(currentShotId)?.type === CanvasNodeType.Image && storyPlaceholderCanReconcile(node) && (options.shouldReconcilePlaceholder?.(node) ?? true);
  });
  if (!placeholders.length) return connections;
  const placeholderIds = new Set(placeholders.map((placeholder) => placeholder.id));
  const retainedByPlaceholderId = /* @__PURE__ */ new Map();
  const addedConnections = [];
  placeholders.forEach((placeholder) => {
    const currentShotId = placeholder.metadata?.seedanceStorySourceImageNodeId;
    const currentShot = typeof currentShotId === "string" ? nodeById.get(currentShotId) : void 0;
    if (!currentShot || currentShot.type !== CanvasNodeType.Image) return;
    const storyDirector = storyDirectorForPlaceholder(placeholder, nodeById);
    const shot = storyShotForPlaceholder(placeholder, storyDirector);
    const placeholderCapability = options.capabilityForPlaceholder?.(placeholder);
    const workflowNodeId = stringValue(placeholder.metadata?.seedanceWorkflowNodeId);
    // Legacy placeholders may lack their own operation scope; inherit the
    // workflow's scope so the wiring still mirrors the real request.
    const effectiveOperation = storyReferenceSubmissionOperation(placeholder.metadata) ?? (workflowNodeId ? storyReferenceSubmissionOperation(nodeById.get(workflowNodeId)?.metadata) : void 0);
    const packedImageIds = placeholder.metadata?.seedanceStoryPackedImageNodeIds || [];
    const packedImages = uniqueImageNodes(
      packedImageIds.length
        ? packedImageIds.map((id) => nodeById.get(id))
        : connections
            .filter((connection) => connection.toNodeId === placeholder.id && connection.referenceOrigin === "story_auto" && (connection.useAs === "first_frame" || connection.useAs === "keyframe" || connection.useAs === "last_frame" || connection.referenceRole === "current_shot"))
            .sort((left, right) => {
              const rank = (useAs) => useAs === "first_frame" ? 0 : useAs === "keyframe" || useAs === "last_frame" ? 1 : 2;
              return rank(left.useAs) - rank(right.useAs);
            })
            .map((connection) => nodeById.get(connection.fromNodeId))
    );
    const semanticPlan = referenceNodesForShot({
      shot,
      packedShots: storyDirector
        ? [...storyDirector.metadata?.storyShots || []].sort((left, right) => left.index - right.index).filter((item) => packedImages.some((image) => storyShotIndexesFromImageNode(image).includes(item.index)))
        : shot ? [shot] : [],
      storyDirector,
      nodeById,
      connections,
      currentShot,
      packedImages: packedImages.length ? packedImages : void 0,
      targetNodeId: placeholder.id,
      policy: resolveStoryReferencePrefillPolicy(
        placeholderCapability || options.capability,
        placeholderCapability ? void 0 : options.referencePolicy
      ),
      operation: effectiveOperation
    });
    const semanticReferences = semanticPlan.drawable;
    const directConnections = orderedImageInputConnections(placeholder.id, nodeById, connections);
    const manualConnections = directConnections.filter(
      ({ connection }) => !isStoryReferenceConnection(connection) || connection.referenceUseAsExplicit === true || connection.referenceOrigin === "manual"
    );
    const manualReferences = manualConnections.map(({ node, connection }) => ({
      node,
      role: normalizeVideoReferenceRole(connection.referenceRole) || "other",
      label: stringValue(connection.referenceLabel) || stringValue(node.title) || node.id,
      ...stringValue(connection.referenceEntityId) ? { entityId: stringValue(connection.referenceEntityId) } : {},
      useAs: normalizeConnectionUseAs(connection.useAs),
      sourceConnectionId: connection.id,
      ...connection.referenceAssetId && connection.referenceAssetStorageKey ? {
        referenceAssetId: connection.referenceAssetId,
        referenceAssetStorageKey: connection.referenceAssetStorageKey
      } : {}
    }));
    const targetReferences = [];
    const seenReferenceIds = /* @__PURE__ */ new Set();
    const seenValues = /* @__PURE__ */ new Set();
    const manualReferenceIds = new Set(manualReferences.map(referenceIdentity));
    const manualValues = new Set(manualReferences.map((reference) => reference.referenceAssetStorageKey || imageReferenceValue(reference.node)).filter(Boolean));
    semanticReferences.forEach((reference) => {
      const value = reference.referenceAssetStorageKey || imageReferenceValue(reference.node);
      const referenceId = reference.referenceAssetId || `node:${reference.node.id}`;
      if (manualReferenceIds.has(referenceId) || value && manualValues.has(value)) return;
      if (seenReferenceIds.has(referenceId) || value && seenValues.has(value)) return;
      seenReferenceIds.add(referenceId);
      if (value) seenValues.add(value);
      targetReferences.push(reference);
    });
    targetReferences.push(...manualReferences);
    const targetReferenceIds = new Set(targetReferences.filter((reference) => !reference.sourceConnectionId).map(referenceIdentity));
    const targetConnectionIds = new Set(targetReferences.map((reference) => reference.sourceConnectionId).filter(Boolean));
    const singleExplicitFrameOwner = (useAs) => {
      const ownerNodeIds = new Set(
        directConnections.filter(({ node, connection }) => (targetConnectionIds.has(connection.id) || targetReferenceIds.has(connectionReferenceIdentity(connection, node.id))) && normalizeConnectionUseAs(connection.useAs) === useAs && (connection.referenceUseAsExplicit === true || !isStoryReferenceConnection(connection))).map(({ node, connection }) => connection.id || connectionReferenceIdentity(connection, node.id))
      );
      return ownerNodeIds.size === 1 ? [...ownerNodeIds][0] : void 0;
    };
    const explicitFirstFrameOwner = singleExplicitFrameOwner("first_frame");
    const explicitLastFrameOwner = singleExplicitFrameOwner("last_frame");
    const exclusiveUseAs = (referenceId, useAs) => {
      if (useAs === "first_frame" && explicitFirstFrameOwner && explicitFirstFrameOwner !== referenceId) return "reference_image";
      if (useAs === "last_frame" && explicitLastFrameOwner && explicitLastFrameOwner !== referenceId) return "reference_image";
      return useAs;
    };
    const retainedByConnectionId = /* @__PURE__ */ new Map();
    targetReferences.forEach((reference, index) => {
      const candidates = directConnections.filter(({ node, connection }) => reference.sourceConnectionId ? connection.id === reference.sourceConnectionId : connectionReferenceIdentity(connection, node.id) === referenceIdentity(reference));
      const existing = candidates.find(
        ({ connection }) => !isStoryReferenceConnection(connection) || connection.referenceUseAsExplicit === true || connection.referenceOrigin === "manual"
      ) || candidates[0];
      if (existing) {
        if (isStoryReferenceConnection(existing.connection) && existing.connection.referenceUseAsExplicit !== true && existing.connection.referenceOrigin !== "manual") {
          const semanticConnection2 = storySemanticReferenceConnection(
            String(placeholder.metadata?.seedanceWorkflowNodeId || "story"),
            placeholder.id,
            reference,
            index + 1
          );
          const retainedUseAs = normalizeConnectionUseAs(semanticConnection2.useAs);
          retainedByConnectionId.set(existing.connection.id, {
            ...semanticConnection2,
            id: existing.connection.id,
            useAs: exclusiveUseAs(reference.sourceConnectionId || referenceIdentity(reference), retainedUseAs)
          });
        } else {
          retainedByConnectionId.set(existing.connection.id, {
            ...existing.connection,
            referenceSequence: index + 1,
            referenceOrigin: "manual"
          });
        }
        return;
      }
      const semanticConnection = storySemanticReferenceConnection(
        String(placeholder.metadata?.seedanceWorkflowNodeId || "story"),
        placeholder.id,
        reference,
        index + 1
      );
      addedConnections.push({
        ...semanticConnection,
        useAs: exclusiveUseAs(reference.sourceConnectionId || referenceIdentity(reference), normalizeConnectionUseAs(semanticConnection.useAs))
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
function storyPlaceholderCanReconcile(node) {
  const metadata = node.metadata;
  if (!metadata) return true;
  if (metadata.content) return false;
  const status = stringValue(metadata.status).toLowerCase();
  if (status === "loading" || status === "generating") return false;
  const taskStatus = stringValue(metadata.seedanceGenerationTaskState?.status).toLowerCase();
  if (taskStatus === "loading" || taskStatus === "generating") return false;
  return true;
}

function retainStoryAutoConnectionsForSupportedTargets(
  connections,
  _supportedTargetNodeIds,
) {
  return connections;
}
function storyDirectorForPlaceholder(placeholder, nodeById) {
  const directorId = stringValue(placeholder.metadata?.seedanceStoryDirectorNodeId);
  const director = directorId ? nodeById.get(directorId) : void 0;
  return director?.type === CanvasNodeType.StoryDirector ? director : void 0;
}
function storyShotForPlaceholder(placeholder, storyDirector) {
  const shots = storyDirector?.metadata?.storyShots || [];
  const shotId = stringValue(placeholder.metadata?.seedanceStoryShotId);
  const shotIndex = positiveInteger(placeholder.metadata?.seedanceStoryShotIndex) || positiveInteger(placeholder.metadata?.seedanceShotIndex);
  return shots.find((shot) => shotId && shot.id === shotId) || shots.find((shot) => shotIndex && shot.index === shotIndex);
}
function normalizeVideoReferenceRole(value) {
  return value === "current_shot" || value === "character" || value === "scene" || value === "prop" || value === "other" || value === "upstream_frame" ? value : void 0;
}
function normalizeConnectionUseAs(value) {
  return value === "first_frame" || value === "last_frame" || value === "keyframe" ? value : "reference_image";
}
function orderedImageInputConnections(targetNodeId, nodeById, connections) {
  return connections.map((connection, originalIndex) => ({
    connection,
    node: nodeById.get(connection.fromNodeId),
    originalIndex
  })).filter(
    (entry) => entry.connection.toNodeId === targetNodeId && entry.node?.type === CanvasNodeType.Image
  ).sort((left, right) => {
    const leftSequence = validReferenceSequence(left.connection.referenceSequence) ?? left.originalIndex + 1;
    const rightSequence = validReferenceSequence(right.connection.referenceSequence) ?? right.originalIndex + 1;
    return leftSequence - rightSequence || left.originalIndex - right.originalIndex;
  });
}
function uniqueImageNodes(nodes) {
  const seen = /* @__PURE__ */ new Set();
  return nodes.filter((node) => {
    if (node?.type !== CanvasNodeType.Image || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}
function isStoryReferenceConnection(connection) {
  return connection.referenceOrigin === "story_auto" || String(connection.id || "").startsWith("conn-seedance2-story-ref-");
}
function referenceIdentity(reference) {
  return reference.referenceAssetId || `node:${reference.node.id}`;
}
function connectionReferenceIdentity(connection, parentNodeId) {
  return connection.referenceAssetId && connection.referenceAssetStorageKey ? connection.referenceAssetId : `node:${parentNodeId}`;
}
function validReferenceSequence(value) {
  const sequence = Number(value);
  return Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : void 0;
}
function sameConnections(left, right) {
  return left.length === right.length && left.every((connection, index) => {
    const other = right[index];
    if (!other) return false;
    const connectionValues = connection;
    const otherValues = other;
    const keys = /* @__PURE__ */ new Set([...Object.keys(connectionValues), ...Object.keys(otherValues)]);
    return [...keys].every((key) => connectionValues[key] === otherValues[key]);
  });
}
function appearingCharacterReferenceNodes(shot, storyDirector, nodeById, connections, _derivedViewPolicy) {
  const characterById = new Map(
    (storyDirector.metadata?.storyCharacters || []).map((character) => [character.id, character])
  );
  const appearingCharacters = (shot.appearingCharacterIds || []).map((characterId) => characterById.get(characterId)).filter((character) => Boolean(character));
  if (!appearingCharacters.length) return { primary: [], extraByCharacter: [], notices: [] };
  const candidateNodes = uniqueImageNodes([
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:character", nodeById, connections),
    ...storyDirectorSourceImageNodes(storyDirector, "character", nodeById),
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:reference", nodeById, connections)
  ]);
  const candidateIds = candidateNodes.map((node) => node.id);
  const primary = [];
  const extraByCharacter = [];
  const notices = [];
  appearingCharacters.forEach((character) => {
    const boundNode = imageNodeById(nodeById, character.referenceNodeId)[0];
    const matchedNode = boundNode || imageNodeById(nodeById, findCharacterReferenceCandidate(character, candidateIds, nodeById))[0];
    if (!matchedNode) return;
    const label = `\u89D2\u8272\u56FE\uFF1A${stringValue(character.name) || stringValue(matchedNode.title) || matchedNode.id}`;
    if (isCharacterAssetForbiddenForVideo(matchedNode)) {
      notices.push(`${label} \u662F\u89D2\u8272\u56DB\u8C61/\u6D3E\u751F\u89C6\u56FE\uFF0C\u6309\u89C4\u5219\u4E0D\u8FDB\u5165\u89C6\u9891\u53C2\u8003\uFF0C\u8BE5\u5019\u9009\u4E0D\u4F1A\u63D0\u4EA4\u3002`);
      return;
    }
    primary.push({
      node: matchedNode,
      entityId: character.id,
      label
    });
  });
  return { primary, extraByCharacter, notices };
}
function appearingCharacterReferenceNodesForShots(shots, storyDirector, nodeById, connections, derivedViewPolicy) {
  const merged = { primary: [], extraByCharacter: [], notices: [] };
  const seenPrimary = /* @__PURE__ */ new Set();
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
function storyDirectorConnectedInputImageNodes(storyDirector, toHandleId, nodeById, connections) {
  return connections.filter((connection) => connection.toNodeId === storyDirector.id && connection.toHandleId === toHandleId).flatMap((connection) => imageNodeById(nodeById, connection.fromNodeId)).filter((node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index);
}
function findCharacterReferenceCandidate(character, candidateIds, nodeById) {
  const names = [character.name, ...character.aliases || []].map((value) => stringValue(value).toLowerCase()).filter(Boolean);
  if (!names.length) return void 0;
  return candidateIds.find((id) => {
    const node = nodeById.get(id);
    const haystack = `${node?.title || ""}
${node?.metadata?.prompt || ""}`.toLowerCase();
    return names.some((name) => haystack.includes(name));
  }) || void 0;
}
function sceneReferenceNodes(shot, storyDirector, nodeById, connections) {
  const scene = storyDirector.metadata?.storyScenes?.find((candidate) => candidate.id === shot.sceneId);
  const sceneName = stringValue(scene?.name);
  const boundSceneNode = imageNodeById(nodeById, scene?.referenceNodeId)[0];
  if (boundSceneNode) {
    return [{
      node: boundSceneNode,
      ...scene ? { entityId: scene.id } : {},
      label: `\u573A\u666F\u56FE\uFF1A${sceneName || stringValue(boundSceneNode.title) || boundSceneNode.id}`
    }];
  }
  const globalSceneNodes = uniqueImageNodes([
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:scene", nodeById, connections),
    ...storyDirectorSourceImageNodes(storyDirector, "scene", nodeById)
  ]);
  if (sceneName) {
    const loweredName = sceneName.toLowerCase();
    const matches = globalSceneNodes.filter(
      (node) => `${node.title || ""}
${node.metadata?.prompt || ""}`.toLowerCase().includes(loweredName)
    );
    if (matches.length === 1) {
      return [{
        node: matches[0],
        ...scene ? { entityId: scene.id } : {},
        label: `\u573A\u666F\u56FE\uFF1A${sceneName}`
      }];
    }
  }
  return [];
}
function propReferenceNodes(shot, storyDirector, nodeById, connections) {
  const shotText = [shot.visualContent, shot.imagePrompt, shot.finalPrompt, shot.action].map(stringValue).join("\n").toLowerCase();
  return uniqueImageNodes([
    ...storyDirectorConnectedInputImageNodes(storyDirector, "story:prop", nodeById, connections),
    ...storyDirectorSourceImageNodes(storyDirector, "prop", nodeById)
  ]).filter((node) => {
    const labels = [node.title, node.metadata?.storyLabel].map(stringValue).map((value) => value.toLowerCase()).filter(Boolean);
    return labels.some((label) => shotText.includes(label));
  });
}
function storyDirectorSourceImageNodes(storyDirector, kind, nodeById) {
  return storyDirectorSourceIdsForKind(storyDirector, kind).flatMap((nodeId) => imageNodeById(nodeById, nodeId));
}
function storyDirectorSourceIdsForKind(storyDirector, kind) {
  if (kind === "scene") return storyDirector.metadata?.storySceneSourceImageNodeIds || [];
  if (kind === "prop") return storyDirector.metadata?.storyPropSourceImageNodeIds || [];
  if (kind === "character") return storyDirector.metadata?.storyCharacterSourceImageNodeIds || [];
  return storyDirector.metadata?.storySourceImageNodeIds?.length ? storyDirector.metadata.storySourceImageNodeIds : storyDirector.metadata?.storySourceImageNodeId ? [storyDirector.metadata.storySourceImageNodeId] : [];
}
function imageNodeById(nodeById, nodeId) {
  const node = nodeId ? nodeById.get(nodeId) : void 0;
  return isUsableImageReference(node) ? [node] : [];
}
function storyControllerConnectionId(workflowId, placeholderId) {
  return `conn-seedance2-story-controller-${workflowId}-${placeholderId}`;
}
function storyReferenceConnectionId(workflowId, placeholderId, sourceId) {
  return `conn-seedance2-story-ref-${workflowId}-${placeholderId}-${sourceId}`;
}
function placeholderPosition(workflowNode, size, index) {
  return {
    x: workflowNode.position.x + workflowNode.width + 140 + index % 3 * (size.width + 40),
    y: workflowNode.position.y + Math.floor(index / 3) * (size.height + 60)
  };
}
function storyShotTitle(shot) {
  return stringValue(shot.title) || `\u7B2C${shot.index}\u955C`;
}
function parseStoryShotIndex(value) {
  const text = stringValue(value);
  if (!text) return 0;
  const match = text.match(/第\s*(\d+)\s*镜/) || text.match(/镜头\s*(\d+)/);
  return positiveInteger(match?.[1]);
}
function positiveInteger(value) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
function isUsableImageReference(node) {
  return Boolean(node && node.type === CanvasNodeType.Image && imageReferenceValue(node));
}
function imageReferenceValue(node) {
  const metadata = node.metadata || {};
  return [metadata.storageKey, metadata.backendUrl, metadata.content, metadata.backendRel].map((value) => stringValue(value)).find((value) => value && !value.startsWith("blob:"));
}
function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
function uniqueId(baseId, usedIds) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}
function safeIdPart(value) {
  return String(value || "node").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "node";
}
export {
  STORY_SLICE_REFERENCE_ORDER,
  assertStoryVideoPlaceholderCapability,
  bindSeedance2StoryDirectorSource,
  buildSeedance2StoryShotPrompt,
  buildStoryDirectorSlicePlaceholders,
  buildVersionedStoryDirectorSlicePlaceholders,
  packStoryVideoRequestWindows,
  collectSeedance2StoryRewriteInput,
  commitSeedance2PlaceholderSetAtomic,
  createSeedance2SequentialPlaceholderRun,
  findCurrentShotImageForStoryShot,
  findSeedance2StoryDirectorSource,
  reconcileSeedance2StoryPlaceholderReferences,
  retainStoryAutoConnectionsForSupportedTargets,
  resolveStoryReferencePrefillPolicy,
  resolveSeedance2StoryDirectorSource,
  seedance2StoryShotCountDisplay,
  seedance2RegeneratePromptPatch,
  seedance2UserPromptPatch,
  storyShotIndexesFromImageNode
};
