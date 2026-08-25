import type {
  CanvasConnection,
  CanvasNodeData,
  Seedance2ReferenceSlotBinding,
  Seedance2ReferenceSlotKey,
  Seedance2ReferenceSlotUseAs,
  VideoReferenceRole,
} from "../types";
import { CanvasNodeType } from "../types";

export const SEEDANCE2_MAX_REFERENCE_SLOT_COUNT = 12;

export const SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER = [
  "upstream_hd_frame",
  "current_shot",
  "character",
  "scene",
] as const satisfies readonly Seedance2ReferenceSlotKey[];

export const SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY = {
  upstream_hd_frame: "上游高清参考帧",
  current_shot: "当前分镜图",
  character: "角色图",
  scene: "场景图",
} as const satisfies Record<Seedance2ReferenceSlotKey, string>;

export type Seedance2CustomerReferenceSource =
  | "semantic"
  | "extra"
  | "connected";

export type Seedance2CustomerReferenceLike = {
  id?: string;
  referenceId?: string;
  label: string;
  value: string;
  nodeId: string;
  useAs?: Seedance2ReferenceSlotUseAs;
  role?: VideoReferenceRole;
  slotSource?: Seedance2CustomerReferenceSource;
  slotOrderIndex?: number;
};

export type Seedance2ResolvedReferenceSlotSource =
  | "manual"
  | "connected"
  | "pending"
  | "empty";

export type Seedance2ResolvedReferenceSlot = {
  slotIndex: number;
  source: Seedance2ResolvedReferenceSlotSource;
  label: string;
  value: string;
  previewValue?: string;
  nodeId?: string;
  connectionId?: string;
  referenceId?: string;
  referenceSequence?: number;
  referenceOrigin?: CanvasConnection["referenceOrigin"];
  useAs: Seedance2ReferenceSlotUseAs;
  role?: VideoReferenceRole;
};

export type Seedance2ReferenceSlotResolveOptions = {
  placeholder: CanvasNodeData;
  nodes: readonly CanvasNodeData[];
  connections: readonly CanvasConnection[];
  visibleSlotCount?: number;
  visibleSlotPurposes?: readonly Seedance2ReferenceSlotUseAs[];
  automaticConnectionPurpose?: Seedance2ReferenceSlotUseAs | null;
};

export type Seedance2ResolvedCustomerReference = {
  id?: string;
  referenceId?: string;
  label: string;
  value: string;
  nodeId: string;
  useAs: Seedance2ReferenceSlotUseAs;
  role: VideoReferenceRole;
  referenceOrigin?: CanvasConnection["referenceOrigin"];
};

const SEEDANCE2_SLOT_KEY_REFERENCE_ROLES: Record<
  Seedance2ReferenceSlotKey,
  VideoReferenceRole
> = {
  upstream_hd_frame: "upstream_frame",
  current_shot: "current_shot",
  character: "character",
  scene: "scene",
};

export function normalizeSeedance2StoryReferenceRole(
  value: unknown,
): VideoReferenceRole | undefined {
  return value === "current_shot" ||
    value === "character" ||
    value === "scene" ||
    value === "prop" ||
    value === "other" ||
    value === "upstream_frame"
    ? value
    : undefined;
}

const SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK: Record<
  Seedance2CustomerReferenceSource,
  number
> = {
  semantic: 0,
  connected: 1,
  extra: 2,
};

function normalizeSeedance2CustomerReferenceSource(
  source: Seedance2CustomerReferenceSource | undefined,
  fallback: Seedance2CustomerReferenceSource,
): Seedance2CustomerReferenceSource {
  return source === "semantic" || source === "extra" || source === "connected"
    ? source
    : fallback;
}

function safeSeedance2OrderIndex(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : fallback;
}

export function normalizeSeedance2ReferenceSlotUseAs(
  value: unknown,
): Seedance2ReferenceSlotUseAs {
  return value === "first_frame" || value === "last_frame" || value === "keyframe" ? value : "reference_image";
}

export function assignExclusiveSeedance2ReferenceUseAs<
  T extends { id: string; useAs?: Seedance2ReferenceSlotUseAs | string },
>(
  items: readonly T[],
  targetId: string,
  nextUseAs: Seedance2ReferenceSlotUseAs,
): T[] {
  return items.map((item) => {
    if (item.id === targetId) {
      return item.useAs === nextUseAs ? item : { ...item, useAs: nextUseAs };
    }
    if (
      (nextUseAs === "first_frame" || nextUseAs === "last_frame") &&
      normalizeSeedance2ReferenceSlotUseAs(item.useAs) === nextUseAs
    ) {
      return { ...item, useAs: "reference_image" };
    }
    return item;
  });
}

export function buildSeedance2ReferenceSlotKeysFromOrder(
  referenceOrder?: readonly string[] | null,
): Seedance2ReferenceSlotKey[] {
  const seenSlotKeys = new Set<Seedance2ReferenceSlotKey>();
  const orderedSlotKeys: Seedance2ReferenceSlotKey[] = [];
  const labels = Array.isArray(referenceOrder) ? referenceOrder : [];
  labels.forEach((label) => {
    const key = SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.find(
      (slotKey) => SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[slotKey] === label,
    );
    if (!key || seenSlotKeys.has(key)) return;
    seenSlotKeys.add(key);
    orderedSlotKeys.push(key);
  });
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.forEach((key) => {
    if (seenSlotKeys.has(key)) return;
    seenSlotKeys.add(key);
    orderedSlotKeys.push(key);
  });
  return orderedSlotKeys;
}

export function parseSeedance2ExtraReferenceSlotIndex(
  key: string,
  maxSlotCount = Number.MAX_SAFE_INTEGER,
): number | null {
  const normalizedKey = String(key || "");
  const match = normalizedKey.match(/^reference_(\d+)$/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  const minExtraSlotIndex = SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.length + 1;
  const safeMaxSlotCount = Number.isFinite(maxSlotCount)
    ? Math.max(0, Math.floor(maxSlotCount))
    : Number.MAX_SAFE_INTEGER;
  if (
    !Number.isSafeInteger(index) ||
    index < minExtraSlotIndex ||
    index > safeMaxSlotCount ||
    normalizedKey !== `reference_${index}`
  ) {
    return null;
  }
  return index;
}

export function seedance2BoundExtraSlotStats(
  extraBindings?:
    | Partial<
        Record<
          string,
          Pick<Seedance2ReferenceSlotBinding, "nodeId" | "value"> | undefined
        >
      >
    | null,
) {
  let boundSlotCount = 0;
  let highestSlotIndex = 0;
  Object.entries(extraBindings || {}).forEach(([key, binding]) => {
    if (!binding?.value && !binding?.nodeId) return;
    const index = parseSeedance2ExtraReferenceSlotIndex(key);
    if (index === null) return;
    boundSlotCount += 1;
    highestSlotIndex = Math.max(highestSlotIndex, index);
  });
  return { boundSlotCount, highestSlotIndex };
}

export function mergeSeedance2OrderedCustomerReferences<
  T extends Seedance2CustomerReferenceLike,
>(
  slotReferences: readonly T[] = [],
  connectedReferences: readonly T[] = [],
): Array<Omit<T, "slotSource" | "slotOrderIndex">> {
  const candidates = [
    ...slotReferences.map((reference, index) => ({
      reference,
      source: normalizeSeedance2CustomerReferenceSource(
        reference.slotSource,
        "semantic",
      ),
      orderIndex: safeSeedance2OrderIndex(reference.slotOrderIndex, index),
      originalIndex: index,
    })),
    ...connectedReferences.map((reference, index) => ({
      reference,
      source: "connected" as const,
      orderIndex: safeSeedance2OrderIndex(reference.slotOrderIndex, index),
      originalIndex: slotReferences.length + index,
    })),
  ].sort(
    (left, right) =>
      SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK[left.source] -
        SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK[right.source] ||
      left.orderIndex - right.orderIndex ||
      left.originalIndex - right.originalIndex,
  );

  const seenReferenceIds = new Set<string>();
  const references: Array<Omit<T, "slotSource" | "slotOrderIndex">> = [];
  candidates.forEach(({ reference }) => {
    const nodeId = String(reference.nodeId || "").trim();
    const referenceId = String(reference.referenceId || reference.id || nodeId).trim();
    const value = String(reference.value || "").trim();
    if (!value) return;
    if (referenceId && seenReferenceIds.has(referenceId)) return;
    if (referenceId) seenReferenceIds.add(referenceId);
    const { slotSource, slotOrderIndex, ...publicReference } = reference;
    references.push(publicReference as Omit<T, "slotSource" | "slotOrderIndex">);
  });
  return references;
}

export function getSeedance2FirstFrameReference<
  T extends { useAs?: unknown },
>(references: readonly T[] = []) {
  return references.find(
    (reference) => normalizeSeedance2ReferenceSlotUseAs(reference.useAs) === "first_frame",
  );
}

type Seedance2DirectImageConnection = {
  connection: CanvasConnection;
  node: CanvasNodeData;
  originalIndex: number;
  referenceSequence?: number;
};

type Seedance2ManualReference = Pick<
  Seedance2ResolvedReferenceSlot,
  "slotIndex" | "label" | "value" | "nodeId" | "referenceId" | "useAs" | "role"
> & { useAsExplicit: boolean };

function seedance2UsableReferenceValue(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized && !normalized.startsWith("blob:") ? normalized : "";
}

function seedance2ManualReferenceValue(value: unknown) {
  return String(value || "").trim();
}

function seedance2ReferenceSequence(value: unknown) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : undefined;
}

function seedance2DirectImageConnections(
  placeholderId: string,
  nodes: readonly CanvasNodeData[],
  connections: readonly CanvasConnection[],
): Seedance2DirectImageConnection[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const directConnections: Seedance2DirectImageConnection[] = [];
  connections.forEach((connection, originalIndex) => {
    if (connection.toNodeId !== placeholderId) return;
    const node = nodesById.get(connection.fromNodeId);
    if (!node || node.type !== CanvasNodeType.Image) return;
    if (!seedance2CanOccupyReferenceSlot(node)) return;
    directConnections.push({
      connection,
      node,
      originalIndex,
      referenceSequence: seedance2ReferenceSequence(connection.referenceSequence),
    });
  });
  return directConnections;
}

function seedance2ConnectionOrder(
  connection: Pick<Seedance2DirectImageConnection, "originalIndex" | "referenceSequence">,
) {
  return connection.referenceSequence ?? connection.originalIndex + 1;
}

function seedance2ManualReferences(placeholder: CanvasNodeData) {
  const metadata = placeholder.metadata;
  const semanticBindings = metadata?.seedanceReferenceSlotBindings || {};
  const references = new Map<number, Seedance2ManualReference>();
  buildSeedance2ReferenceSlotKeysFromOrder(metadata?.seedanceReferenceOrder).forEach((key, index) => {
    const binding = semanticBindings[key];
    if (!binding) return;
    const value = seedance2ManualReferenceValue(binding.value);
    const nodeId = seedance2OptionalNodeId(binding.nodeId);
    if (!nodeId && !value) return;
    const slotIndex = index + 1;
    references.set(slotIndex, {
      slotIndex,
      label: String(binding?.label || SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[key]).trim() || `参考图 ${slotIndex}`,
      value,
      nodeId,
      referenceId: seedance2OptionalNodeId(binding.referenceId) || nodeId || `manual-slot:${slotIndex}`,
      useAs: normalizeSeedance2ReferenceSlotUseAs(binding?.useAs),
      useAsExplicit: binding?.useAs !== undefined,
      role: SEEDANCE2_SLOT_KEY_REFERENCE_ROLES[key],
    });
  });
  Object.entries(metadata?.seedanceReferenceExtraSlotBindings || {}).forEach(([key, binding]) => {
    const slotIndex = parseSeedance2ExtraReferenceSlotIndex(key);
    if (slotIndex === null || !binding) return;
    const value = seedance2ManualReferenceValue(binding.value);
    const nodeId = seedance2OptionalNodeId(binding.nodeId);
    if (!nodeId && !value) return;
    references.set(slotIndex, {
      slotIndex,
      label: String(binding?.label || `参考图 ${slotIndex}`).trim() || `参考图 ${slotIndex}`,
      value,
      nodeId,
      referenceId: seedance2OptionalNodeId(binding.referenceId) || nodeId || `manual-slot:${slotIndex}`,
      useAs: normalizeSeedance2ReferenceSlotUseAs(binding?.useAs),
      useAsExplicit: binding?.useAs !== undefined,
      role: "other",
    });
  });
  return [...references.values()];
}

function seedance2OptionalNodeId(nodeId: unknown) {
  const normalized = String(nodeId || "").trim();
  return normalized || undefined;
}

function seedance2VisibleSlotCapacity(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function seedance2ConnectedImageValue(node: CanvasNodeData) {
  const metadata = node.metadata;
  const localStorageKey = seedance2UsableReferenceValue(metadata?.storageKey);
  if (localStorageKey.startsWith("image:")) return localStorageKey;
  return [metadata?.backendUrl, metadata?.content, metadata?.backendRel, metadata?.storageKey]
    .map(seedance2UsableReferenceValue)
    .find(Boolean) || "";
}

function seedance2ConnectionReferenceValue(connection: CanvasConnection, node: CanvasNodeData) {
  return connection.referenceAssetId && connection.referenceAssetStorageKey
    ? seedance2UsableReferenceValue(connection.referenceAssetStorageKey)
    : seedance2ConnectedImageValue(node);
}

function seedance2ConnectedImagePreviewValue(node: CanvasNodeData) {
  const metadata = node.metadata;
  const localStorageKey = seedance2UsableReferenceValue(metadata?.storageKey);
  if (localStorageKey.startsWith("image:")) {
    return String(metadata?.content || "").trim();
  }
  return [metadata?.backendUrl, metadata?.content, metadata?.backendRel]
    .map((value) => String(value || "").trim())
    .find(Boolean) || "";
}

function seedance2PendingImageReference(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  const status = String(metadata.status || "").trim();
  return status === "loading" || status === "generating" || Boolean(metadata.sourceImageTaskId);
}

export function seedance2CanOccupyReferenceSlot(node: CanvasNodeData | undefined | null) {
  if (!node || node.type !== CanvasNodeType.Image) return false;
  return Boolean(seedance2ConnectedImageValue(node) || seedance2ConnectedImagePreviewValue(node) || seedance2PendingImageReference(node));
}

function seedance2IsUpstreamHdFrame(node: CanvasNodeData) {
  const metadata = node.metadata;
  if (
    metadata?.seedanceReferenceSlot === "upstream_hd_frame" ||
    metadata?.source === "seedance2-frame-extraction"
  ) return true;
  const text = `${node.title || ""}\n${metadata?.storyLabel || ""}\n${metadata?.source || ""}`.toLowerCase();
  return /\u4e0a\u6e38|\u9ad8\u6e05\u53c2\u8003|\u53c2\u8003\u5e27|\u4e0a\u4e00|\u524d\u4e00|previous|upstream/.test(text);
}

function seedance2ConnectedImageUseAs(node: CanvasNodeData): Seedance2ReferenceSlotUseAs {
  return seedance2IsUpstreamHdFrame(node) ? "first_frame" : "reference_image";
}

export function nextSeedance2ReferenceSequence(
  placeholderId: string,
  nodes: readonly CanvasNodeData[],
  connections: readonly CanvasConnection[],
) {
  return seedance2DirectImageConnections(placeholderId, nodes, connections).reduce(
    (nextSequence, connection) => Math.max(nextSequence, seedance2ConnectionOrder(connection) + 1),
    1,
  );
}

export function seedance2ManualReferenceHighestSlotIndex(placeholder: CanvasNodeData) {
  return seedance2ManualReferences(placeholder).reduce(
    (highestSlotIndex, reference) => Math.max(highestSlotIndex, reference.slotIndex),
    0,
  );
}

export function planSeedance2ReferenceConnection({
  connection,
  placeholderId,
  nodes,
  connections,
}: {
  connection: Pick<CanvasConnection, "fromNodeId" | "toNodeId">;
  placeholderId: string;
  nodes: readonly CanvasNodeData[];
  connections: readonly CanvasConnection[];
  visibleSlotCount: number;
}): { accepted: true; referenceSequence: number } | { accepted: false; reason: "full" } {
  const source = nodes.find((node) => node.id === connection.fromNodeId);
  const placeholder = nodes.find((node) => node.id === placeholderId);
  if (
    connection.toNodeId !== placeholderId ||
    source?.type !== CanvasNodeType.Image ||
    !placeholder
  ) {
    return { accepted: true, referenceSequence: 0 };
  }

  // `visibleSlotCount` controls empty placeholders only. A real connection is
  // user data and must be accepted; the resolved slot list grows with it and
  // provider-specific limits are validated later by the selected capability.
  return {
    accepted: true,
    referenceSequence: nextSeedance2ReferenceSequence(
      placeholderId,
      nodes,
      connections,
    ),
  };
}

export function resolveSeedance2ReferenceSlots({
  placeholder,
  nodes,
  connections,
  visibleSlotCount,
  visibleSlotPurposes,
  automaticConnectionPurpose,
}: Seedance2ReferenceSlotResolveOptions): Seedance2ResolvedReferenceSlot[] {
  const manualReferences = seedance2ManualReferences(placeholder);
  const directConnections = seedance2DirectImageConnections(placeholder.id, nodes, connections)
    .sort((left, right) => (
      seedance2ConnectionOrder(left) - seedance2ConnectionOrder(right) ||
      left.originalIndex - right.originalIndex
    ));
  const matchedManualByConnectionId = new Map<string, Seedance2ManualReference>();
  const consumedManualReferences = new Set<Seedance2ManualReference>();
  directConnections.forEach(({ connection, node }) => {
    const matched = manualReferences.find((manual) => (
      !consumedManualReferences.has(manual) &&
      seedance2ManualAndConnectionShareAsset(manual, connection, node)
    ));
    if (!matched) return;
    matchedManualByConnectionId.set(connection.id, matched);
    consumedManualReferences.add(matched);
  });
  // Keep presentation placeholders dense, but preserve saved slot indexes as
  // sparse data. One high index must not allocate every empty item before it.
  const slotsByIndex = new Map<number, Seedance2ResolvedReferenceSlot>();
  const emptyPurposes = visibleSlotPurposes?.length
    ? visibleSlotPurposes.map(normalizeSeedance2ReferenceSlotUseAs)
    : Array.from({ length: seedance2VisibleSlotCapacity(visibleSlotCount) }, () => "reference_image" as const);
  emptyPurposes.forEach((useAs, index) => {
      const slotIndex = index + 1;
      slotsByIndex.set(slotIndex, {
        slotIndex,
        source: "empty",
        label: seedance2EmptySlotLabel(useAs, slotIndex),
        value: "",
        useAs,
      });
    });

  manualReferences.filter((reference) => !consumedManualReferences.has(reference)).forEach((reference) => {
    slotsByIndex.set(reference.slotIndex, { ...reference, source: "manual" });
  });
  directConnections.forEach((directConnection) => {
    const existingEmptySlotIndex = [...slotsByIndex.entries()]
      .sort(([left], [right]) => left - right)
      .find(([, slot]) => slot.source === "empty")?.[0];
    let slotIndex = existingEmptySlotIndex;
    if (slotIndex === undefined) {
      slotIndex = 1;
      while (slotsByIndex.has(slotIndex)) slotIndex += 1;
    }
    const matchedManual = matchedManualByConnectionId.get(directConnection.connection.id);
    const emptySlotPurpose = slotIndex === undefined
      ? undefined
      : slotsByIndex.get(slotIndex)?.useAs;
    const value = seedance2ConnectionReferenceValue(directConnection.connection, directConnection.node) || matchedManual?.value || "";
    const isStoryCurrentShot = directConnection.node.id === placeholder.metadata?.seedanceStorySourceImageNodeId;
    const connectionRole = normalizeSeedance2StoryReferenceRole(directConnection.connection.referenceRole);
    slotsByIndex.set(slotIndex, {
      slotIndex,
      source: value ? "connected" : "pending",
      label:
        String(directConnection.connection.referenceLabel || "").trim() ||
        matchedManual?.label ||
        (isStoryCurrentShot
          ? SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY.current_shot
          : String(directConnection.node.title || `参考图 ${slotIndex}`).trim() || `参考图 ${slotIndex}`),
      value,
      previewValue: seedance2ConnectedImagePreviewValue(directConnection.node),
      nodeId: directConnection.node.id,
      connectionId: directConnection.connection.id,
      referenceId:
        (directConnection.connection.referenceAssetId && directConnection.connection.referenceAssetStorageKey
          ? seedance2OptionalNodeId(directConnection.connection.referenceAssetId)
          : undefined) ||
        seedance2OptionalNodeId(matchedManual?.referenceId) ||
        directConnection.node.id,
      referenceSequence: directConnection.referenceSequence,
      referenceOrigin: directConnection.connection.referenceOrigin,
      useAs:
        directConnection.connection.referenceUseAsExplicit === true && seedance2IsExplicitReferencePurpose(directConnection.connection.useAs)
          ? directConnection.connection.useAs
          : matchedManual?.useAsExplicit
            ? matchedManual.useAs
            : seedance2IsExplicitReferencePurpose(directConnection.connection.useAs)
              ? directConnection.connection.useAs
              : (matchedManual ? automaticConnectionPurpose : undefined) || matchedManual?.useAs || emptySlotPurpose || seedance2ConnectedImageUseAs(directConnection.node),
      role:
        connectionRole ||
        matchedManual?.role ||
        (isStoryCurrentShot
          ? "current_shot"
          : seedance2IsUpstreamHdFrame(directConnection.node)
            ? "upstream_frame"
            : "other"),
    });
  });
  return [...slotsByIndex.values()].sort((left, right) => left.slotIndex - right.slotIndex);
}

function seedance2IsExplicitReferencePurpose(value: unknown): value is Seedance2ReferenceSlotUseAs {
  return value === "first_frame" || value === "last_frame" || value === "keyframe" || value === "reference_image";
}

function seedance2ManualAndConnectionShareAsset(
  manual: Seedance2ManualReference,
  connection: CanvasConnection,
  node: CanvasNodeData,
) {
  const manualAssetId = seedance2OptionalNodeId(manual.referenceId);
  const connectedAssetId = connection.referenceAssetId && connection.referenceAssetStorageKey
    ? seedance2OptionalNodeId(connection.referenceAssetId)
    : undefined;
  if (connectedAssetId && manualAssetId && manualAssetId !== manual.nodeId) {
    return connectedAssetId === manualAssetId;
  }
  if (connectedAssetId) return false;
  return Boolean(manual.nodeId && manual.nodeId === node.id);
}

function seedance2EmptySlotLabel(useAs: Seedance2ReferenceSlotUseAs, slotIndex: number) {
  if (useAs === "first_frame") return "首帧";
  if (useAs === "last_frame") return "尾帧";
  if (useAs === "keyframe") return `关键帧 ${slotIndex}`;
  return `参考图 ${slotIndex}`;
}

export function seedance2ResolvedSlotsToCustomerReferences(
  slots: readonly Seedance2ResolvedReferenceSlot[],
): Seedance2ResolvedCustomerReference[] {
  return [...slots]
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .flatMap((slot) => {
      if (slot.source === "empty") return [];
      const value = seedance2ManualReferenceValue(slot.value);
      const referenceId = seedance2OptionalNodeId(slot.referenceId) ||
        seedance2OptionalNodeId(slot.connectionId) ||
        seedance2OptionalNodeId(slot.nodeId) ||
        `seedance2-reference-slot-${slot.slotIndex}`;
      return [{
        id: referenceId,
        referenceId,
        label: String(slot.label || `参考图 ${slot.slotIndex}`).trim() || `参考图 ${slot.slotIndex}`,
        value,
        nodeId: seedance2OptionalNodeId(slot.nodeId) || `seedance2-reference-slot-${slot.slotIndex}`,
        useAs: normalizeSeedance2ReferenceSlotUseAs(slot.useAs),
        role: normalizeSeedance2StoryReferenceRole(slot.role) || "other",
        referenceOrigin: slot.referenceOrigin,
      }];
    });
}
