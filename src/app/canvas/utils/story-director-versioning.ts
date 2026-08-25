import type {
  CanvasConnection,
  CanvasNodeData,
  CanvasNodeMetadata,
  StoryReferenceRole,
  StoryReferenceSnapshot,
  StoryVersionRole,
} from "../types";

export type StoryReferenceSnapshotSource = {
  sourceNodeId: string;
  role: StoryReferenceRole;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  content?: string;
  storageKey?: string;
};

export async function createStoryReferenceSnapshots(
  draftId: string,
  sources: StoryReferenceSnapshotSource[],
  options: { now?: string; createId?: (index: number) => string } = {},
): Promise<StoryReferenceSnapshot[]> {
  const now = options.now || new Date().toISOString();
  return Promise.all(sources.map(async (source, index) => {
    if (!source.content && !source.storageKey) {
      throw new Error(`Reference ${source.sourceNodeId} has no immutable content or storage key`);
    }
    const content = source.content;
    const hashInput = content || `storage:${source.storageKey}`;
    return {
      snapshotId: options.createId?.(index) || `${draftId}-reference-${index + 1}`,
      sourceNodeId: source.sourceNodeId,
      role: source.role,
      name: source.name,
      mimeType: source.mimeType,
      width: source.width,
      height: source.height,
      content,
      storageKey: source.storageKey,
      sha256: await sha256(hashInput),
      stableOrder: index,
      createdAt: now,
    };
  }));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type CloneStoryVersionInput = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  sourceDirectorNodeId: string;
  sourceNodeIds: string[];
  referenceSnapshots: StoryReferenceSnapshot[];
  versionId: string;
  versionNumber: number;
  parentVersionId?: string;
  now?: string;
  createNodeId: () => string;
  createConnectionId: () => string;
};

export type ClonedStoryVersion = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  idMap: Record<string, string>;
  activeDirectorNodeId: string;
};

export type StoryResultSubgraph = {
  nodeIds: string[];
  connectionIds: string[];
};

export function clearLiveStoryDraftMetadata(metadata: CanvasNodeMetadata | undefined): CanvasNodeMetadata {
  const next = structuredClone(metadata || {});
  delete next.storyStagedDraftId;
  delete next.storyStageId;
  delete next.storyDraftNode;
  delete next.storyAssetRole;
  delete next.storyDraftAssetId;
  return next;
}

export function collectStoryResultSubgraph(input: {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  sourceDirectorNodeId: string;
  draftId?: string;
}): StoryResultSubgraph {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, CanvasConnection[]>();
  for (const connection of input.connections) {
    const list = outgoing.get(connection.fromNodeId) || [];
    list.push(connection);
    outgoing.set(connection.fromNodeId, list);
  }
  const selected = new Set<string>([input.sourceDirectorNodeId]);
  const queue = [input.sourceDirectorNodeId];
  while (queue.length) {
    const parentId = queue.shift() as string;
    const parent = nodeById.get(parentId);
    for (const connection of outgoing.get(parentId) || []) {
      const child = nodeById.get(connection.toNodeId);
      if (!child || selected.has(child.id) || !isStoryResultNode(child, parent, input)) continue;
      selected.add(child.id);
      queue.push(child.id);
    }
  }
  return {
    nodeIds: input.nodes.filter((node) => selected.has(node.id)).map((node) => node.id),
    connectionIds: input.connections
      .filter((connection) => selected.has(connection.fromNodeId) && selected.has(connection.toNodeId))
      .map((connection) => connection.id),
  };
}

function isStoryResultNode(
  node: CanvasNodeData,
  parent: CanvasNodeData | undefined,
  input: { sourceDirectorNodeId: string; draftId?: string },
) {
  const metadata = node.metadata || {};
  if (input.draftId && metadata.storyStagedDraftId === input.draftId) return true;
  if (node.type === "image") {
    return Boolean(
      metadata.storyLabel ||
      metadata.storyGrid9GroupIndex ||
      String(metadata.sourceImageTaskId || "").startsWith("canvas-story-") ||
      ["character", "scene", "prop", "shot"].includes(String(metadata.storyVersionRole || "")),
    );
  }
  if (node.type === "seedance2_workflow") {
    return metadata.seedanceStoryDirectorNodeId === input.sourceDirectorNodeId;
  }
  if (node.type === "video") {
    return Boolean(
      metadata.seedanceStoryDirectorNodeId === input.sourceDirectorNodeId ||
      (parent?.type === "seedance2_workflow" && metadata.seedanceWorkflowRole === "placeholder") ||
      metadata.storyVersionRole === "video",
    );
  }
  return false;
}

export function committedStoryDirectorMetadata(
  metadata: CanvasNodeMetadata | undefined,
  committed: { draftId: string; versionId: string; versionNumber: number },
): CanvasNodeMetadata {
  const next = clearLiveStoryDraftMetadata(metadata);
  delete next.storyStagedDraft;
  delete next.storyStagedDraftId;
  return {
    ...next,
    storyCommittedDraftId: committed.draftId,
    storyVersionId: committed.versionId,
    storyVersionNumber: committed.versionNumber,
  };
}

const inferRole = (node: CanvasNodeData, directorId: string): StoryVersionRole => {
  if (node.id === directorId) return "director";
  if (node.type === "video") return "video";
  const source = String(node.metadata?.source || "");
  const label = `${node.title} ${node.metadata?.storyLabel || ""} ${source}`.toLowerCase();
  if (label.includes("character") || label.includes("角色") || label.includes("人物")) return "character";
  if (label.includes("scene") || label.includes("场景")) return "scene";
  if (label.includes("prop") || label.includes("道具")) return "prop";
  return "shot";
};

const rewriteIds = (value: unknown, idMap: Readonly<Record<string, string>>): unknown => {
  if (typeof value === "string") return idMap[value] || value;
  if (Array.isArray(value)) return value.map((item) => rewriteIds(item, idMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteIds(item, idMap)]));
  }
  return value;
};

const versionMetadata = (
  metadata: CanvasNodeMetadata | undefined,
  role: StoryVersionRole,
  sourceNodeId: string,
  input: CloneStoryVersionInput,
): CanvasNodeMetadata => ({
  ...(rewriteIds(metadata || {}, {}) as CanvasNodeMetadata),
  storyVersionId: input.versionId,
  storyVersionNumber: input.versionNumber,
  storyVersionParentId: input.parentVersionId,
  storyVersionSourceNodeId: sourceNodeId,
  storyVersionRole: role,
  storyVersionCreatedAt: input.now || new Date().toISOString(),
});

export function cloneStoryVersion(input: CloneStoryVersionInput): ClonedStoryVersion {
  const sourceNodeSet = new Set(input.sourceNodeIds);
  sourceNodeSet.add(input.sourceDirectorNodeId);
  const sourceById = new Map(input.nodes.map((node) => [node.id, node]));
  const idMap: Record<string, string> = {};
  for (const snapshot of input.referenceSnapshots) idMap[snapshot.sourceNodeId] = input.createNodeId();
  for (const node of input.nodes) {
    if (sourceNodeSet.has(node.id) && !idMap[node.id]) idMap[node.id] = input.createNodeId();
  }

  const referenceNodes: CanvasNodeData[] = input.referenceSnapshots.map((snapshot) => {
    const original = sourceById.get(snapshot.sourceNodeId);
    const metadata = versionMetadata(clearLiveStoryDraftMetadata(original?.metadata), "reference", snapshot.sourceNodeId, input);
    return {
      id: idMap[snapshot.sourceNodeId],
      type: "image" as CanvasNodeData["type"],
      title: snapshot.name,
      position: original ? { ...original.position } : { x: 0, y: 0 },
      width: original?.width || snapshot.width || 320,
      height: original?.height || snapshot.height || 320,
      metadata: {
        ...metadata,
        content: snapshot.content,
        storageKey: snapshot.storageKey,
        mimeType: snapshot.mimeType,
        naturalWidth: snapshot.width,
        naturalHeight: snapshot.height,
        storyReferenceSnapshotId: snapshot.snapshotId,
        storyReferenceSnapshotIds: [snapshot.snapshotId],
      },
    };
  });

  const clonedNodes = input.nodes
    .filter((node) => sourceNodeSet.has(node.id) && !input.referenceSnapshots.some((snapshot) => snapshot.sourceNodeId === node.id))
    .map((node) => {
      const role = inferRole(node, input.sourceDirectorNodeId);
      const rewritten = rewriteIds(node.metadata || {}, idMap) as CanvasNodeMetadata;
      const committedMetadata = role === "director" ? rewritten : clearLiveStoryDraftMetadata(rewritten);
      return {
        ...structuredClone(node),
        id: idMap[node.id],
        position: { x: node.position.x + 80, y: node.position.y + 80 },
        metadata: {
          ...committedMetadata,
          ...versionMetadata(undefined, role, node.id, input),
          storyReferenceSnapshotIds: input.referenceSnapshots.map((snapshot) => snapshot.snapshotId),
        },
      };
    });

  const connections = input.connections.flatMap((connection) => {
    const fromNodeId = idMap[connection.fromNodeId];
    const toNodeId = idMap[connection.toNodeId];
    if (!fromNodeId || !toNodeId) return [];
    return [{ ...structuredClone(connection), id: input.createConnectionId(), fromNodeId, toNodeId }];
  });
  const nodes = [...referenceNodes, ...clonedNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (connections.some((connection) => !nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId))) {
    throw new Error("Cloned story version contains an external connection");
  }
  return { nodes, connections, idMap, activeDirectorNodeId: idMap[input.sourceDirectorNodeId] };
}
