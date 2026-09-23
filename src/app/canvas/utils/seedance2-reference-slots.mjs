const CanvasNodeType = { Image: "image" };
const SEEDANCE2_MAX_REFERENCE_SLOT_COUNT = 12;
const SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER = [
  "upstream_hd_frame",
  "current_shot",
  "character",
  "scene"
];
const SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY = {
  upstream_hd_frame: "\u4E0A\u6E38\u9AD8\u6E05\u53C2\u8003\u5E27",
  current_shot: "\u5F53\u524D\u5206\u955C\u56FE",
  character: "\u89D2\u8272\u56FE",
  scene: "\u573A\u666F\u56FE"
};
const SEEDANCE2_SLOT_KEY_REFERENCE_ROLES = {
  upstream_hd_frame: "upstream_frame",
  current_shot: "current_shot",
  character: "character",
  scene: "scene"
};
function normalizeSeedance2StoryReferenceRole(value) {
  return value === "current_shot" || value === "character" || value === "scene" || value === "prop" || value === "other" || value === "upstream_frame" ? value : void 0;
}
const SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK = {
  semantic: 0,
  connected: 1,
  extra: 2
};
function normalizeSeedance2CustomerReferenceSource(source, fallback) {
  return source === "semantic" || source === "extra" || source === "connected" ? source : fallback;
}
function safeSeedance2OrderIndex(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : fallback;
}
function normalizeSeedance2ReferenceSlotUseAs(value) {
  return value === "first_frame" || value === "last_frame" || value === "keyframe" ? value : "reference_image";
}
function assignExclusiveSeedance2ReferenceUseAs(items, targetId, nextUseAs) {
  return items.map((item) => {
    if (item.id === targetId) {
      return item.useAs === nextUseAs ? item : { ...item, useAs: nextUseAs };
    }
    if ((nextUseAs === "first_frame" || nextUseAs === "last_frame") && normalizeSeedance2ReferenceSlotUseAs(item.useAs) === nextUseAs) {
      return { ...item, useAs: "reference_image" };
    }
    return item;
  });
}
function buildSeedance2ReferenceSlotKeysFromOrder(referenceOrder) {
  const seenSlotKeys = /* @__PURE__ */ new Set();
  const orderedSlotKeys = [];
  const labels = Array.isArray(referenceOrder) ? referenceOrder : [];
  labels.forEach((label) => {
    const key = SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.find(
      (slotKey) => SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[slotKey] === label
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
function parseSeedance2ExtraReferenceSlotIndex(key, maxSlotCount = Number.MAX_SAFE_INTEGER) {
  const normalizedKey = String(key || "");
  const match = normalizedKey.match(/^reference_(\d+)$/);
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  const minExtraSlotIndex = SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.length + 1;
  const safeMaxSlotCount = Number.isFinite(maxSlotCount) ? Math.max(0, Math.floor(maxSlotCount)) : Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(index) || index < minExtraSlotIndex || index > safeMaxSlotCount || normalizedKey !== `reference_${index}`) {
    return null;
  }
  return index;
}
function seedance2BoundExtraSlotStats(extraBindings) {
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
function mergeSeedance2OrderedCustomerReferences(slotReferences = [], connectedReferences = []) {
  const candidates = [
    ...slotReferences.map((reference, index) => ({
      reference,
      source: normalizeSeedance2CustomerReferenceSource(
        reference.slotSource,
        "semantic"
      ),
      orderIndex: safeSeedance2OrderIndex(reference.slotOrderIndex, index),
      originalIndex: index
    })),
    ...connectedReferences.map((reference, index) => ({
      reference,
      source: "connected",
      orderIndex: safeSeedance2OrderIndex(reference.slotOrderIndex, index),
      originalIndex: slotReferences.length + index
    }))
  ].sort(
    (left, right) => SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK[left.source] - SEEDANCE2_CUSTOMER_REFERENCE_SOURCE_RANK[right.source] || left.orderIndex - right.orderIndex || left.originalIndex - right.originalIndex
  );
  const seenReferenceIds = /* @__PURE__ */ new Set();
  const references = [];
  candidates.forEach(({ reference }) => {
    const nodeId = String(reference.nodeId || "").trim();
    const referenceId = String(reference.referenceId || reference.id || nodeId).trim();
    const value = String(reference.value || "").trim();
    if (!value) return;
    if (referenceId && seenReferenceIds.has(referenceId)) return;
    if (referenceId) seenReferenceIds.add(referenceId);
    const { slotSource, slotOrderIndex, ...publicReference } = reference;
    references.push(publicReference);
  });
  return references;
}
function getSeedance2FirstFrameReference(references = []) {
  return references.find(
    (reference) => normalizeSeedance2ReferenceSlotUseAs(reference.useAs) === "first_frame"
  );
}
function seedance2UsableReferenceValue(value) {
  const normalized = String(value || "").trim();
  return normalized && !normalized.startsWith("blob:") ? normalized : "";
}
function seedance2ManualReferenceValue(value) {
  return String(value || "").trim();
}
function seedance2ReferenceSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : void 0;
}
function seedance2DirectImageConnections(placeholderId, nodes, connections) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const directConnections = [];
  connections.forEach((connection, originalIndex) => {
    if (connection.toNodeId !== placeholderId) return;
    const node = nodesById.get(connection.fromNodeId);
    if (!node || node.type !== CanvasNodeType.Image) return;
    if (!seedance2CanOccupyReferenceSlot(node)) return;
    directConnections.push({
      connection,
      node,
      originalIndex,
      referenceSequence: seedance2ReferenceSequence(connection.referenceSequence)
    });
  });
  return directConnections;
}
function seedance2ConnectionOrder(connection) {
  return connection.referenceSequence ?? connection.originalIndex + 1;
}
function seedance2ManualReferences(placeholder) {
  const metadata = placeholder.metadata;
  const semanticBindings = metadata?.seedanceReferenceSlotBindings || {};
  const references = /* @__PURE__ */ new Map();
  buildSeedance2ReferenceSlotKeysFromOrder(metadata?.seedanceReferenceOrder).forEach((key, index) => {
    const binding = semanticBindings[key];
    if (!binding) return;
    const value = seedance2ManualReferenceValue(binding.value);
    const nodeId = seedance2OptionalNodeId(binding.nodeId);
    if (!nodeId && !value) return;
    const slotIndex = index + 1;
    references.set(slotIndex, {
      slotIndex,
      label: String(binding?.label || SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[key]).trim() || `\u53C2\u8003\u56FE ${slotIndex}`,
      value,
      nodeId,
      referenceId: seedance2OptionalNodeId(binding.referenceId) || nodeId || `manual-slot:${slotIndex}`,
      useAs: normalizeSeedance2ReferenceSlotUseAs(binding?.useAs),
      useAsExplicit: binding?.useAs !== void 0,
      role: SEEDANCE2_SLOT_KEY_REFERENCE_ROLES[key]
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
      label: String(binding?.label || `\u53C2\u8003\u56FE ${slotIndex}`).trim() || `\u53C2\u8003\u56FE ${slotIndex}`,
      value,
      nodeId,
      referenceId: seedance2OptionalNodeId(binding.referenceId) || nodeId || `manual-slot:${slotIndex}`,
      useAs: normalizeSeedance2ReferenceSlotUseAs(binding?.useAs),
      useAsExplicit: binding?.useAs !== void 0,
      role: "other"
    });
  });
  return [...references.values()];
}
function seedance2OptionalNodeId(nodeId) {
  const normalized = String(nodeId || "").trim();
  return normalized || void 0;
}
function seedance2VisibleSlotCapacity(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
}
function seedance2ConnectedImageValue(node) {
  const metadata = node.metadata;
  const backend = [metadata?.backendUrl, metadata?.content, metadata?.backendRel]
    .map(seedance2UsableReferenceValue)
    .find((v) => v && (v.startsWith("/works/") || v.startsWith("works/") || /^https?:\/\//i.test(v)));
  if (backend) return backend;
  const localStorageKey = seedance2UsableReferenceValue(metadata?.storageKey);
  if (localStorageKey.startsWith("image:")) return localStorageKey;
  return [metadata?.backendUrl, metadata?.content, metadata?.backendRel, metadata?.storageKey].map(seedance2UsableReferenceValue).find(Boolean) || "";
}
function seedance2ConnectionReferenceValue(connection, node) {
  return connection.referenceAssetId && connection.referenceAssetStorageKey ? seedance2UsableReferenceValue(connection.referenceAssetStorageKey) : seedance2ConnectedImageValue(node);
}
function seedance2ConnectedImagePreviewValue(node) {
  const metadata = node.metadata;
  const localStorageKey = seedance2UsableReferenceValue(metadata?.storageKey);
  if (localStorageKey.startsWith("image:")) {
    return seedance2UsableReferenceValue(metadata?.content) || localStorageKey;
  }
  return [metadata?.backendUrl, metadata?.content, metadata?.backendRel].map((value) => String(value || "").trim()).find(Boolean) || "";
}
function seedance2PendingImageReference(node) {
  const metadata = node.metadata || {};
  const status = String(metadata.status || "").trim();
  return status === "loading" || status === "generating" || Boolean(metadata.sourceImageTaskId);
}
function seedance2CanOccupyReferenceSlot(node) {
  if (!node || node.type !== CanvasNodeType.Image) return false;
  return Boolean(seedance2ConnectedImageValue(node) || seedance2ConnectedImagePreviewValue(node) || seedance2PendingImageReference(node));
}
function seedance2IsUpstreamHdFrame(node) {
  const metadata = node.metadata;
  if (metadata?.seedanceReferenceSlot === "upstream_hd_frame" || metadata?.source === "seedance2-frame-extraction") return true;
  const text = `${node.title || ""}
${metadata?.storyLabel || ""}
${metadata?.source || ""}`.toLowerCase();
  return /\u4e0a\u6e38|\u9ad8\u6e05\u53c2\u8003|\u53c2\u8003\u5e27|\u4e0a\u4e00|\u524d\u4e00|previous|upstream/.test(text);
}
function seedance2ConnectedImageUseAs(node) {
  return seedance2IsUpstreamHdFrame(node) ? "first_frame" : "reference_image";
}
function nextSeedance2ReferenceSequence(placeholderId, nodes, connections) {
  return seedance2DirectImageConnections(placeholderId, nodes, connections).reduce(
    (nextSequence, connection) => Math.max(nextSequence, seedance2ConnectionOrder(connection) + 1),
    1
  );
}
function seedance2ManualReferenceHighestSlotIndex(placeholder) {
  return seedance2ManualReferences(placeholder).reduce(
    (highestSlotIndex, reference) => Math.max(highestSlotIndex, reference.slotIndex),
    0
  );
}
function planSeedance2ReferenceConnection({
  connection,
  placeholderId,
  nodes,
  connections
}) {
  const source = nodes.find((node) => node.id === connection.fromNodeId);
  const placeholder = nodes.find((node) => node.id === placeholderId);
  if (connection.toNodeId !== placeholderId || source?.type !== CanvasNodeType.Image || !placeholder) {
    return { accepted: true, referenceSequence: 0 };
  }
  return {
    accepted: true,
    referenceSequence: nextSeedance2ReferenceSequence(
      placeholderId,
      nodes,
      connections
    )
  };
}
function resolveSeedance2ReferenceSlots({
  placeholder,
  nodes,
  connections,
  visibleSlotCount,
  visibleSlotPurposes,
  automaticConnectionPurpose
}) {
  const manualReferences = seedance2ManualReferences(placeholder);
  const directConnections = seedance2DirectImageConnections(placeholder.id, nodes, connections).sort((left, right) => seedance2ConnectionOrder(left) - seedance2ConnectionOrder(right) || left.originalIndex - right.originalIndex);
  const matchedManualByConnectionId = /* @__PURE__ */ new Map();
  const consumedManualReferences = /* @__PURE__ */ new Set();
  directConnections.forEach(({ connection, node }) => {
    const matched = manualReferences.find((manual) => !consumedManualReferences.has(manual) && seedance2ManualAndConnectionShareAsset(manual, connection, node));
    if (!matched) return;
    matchedManualByConnectionId.set(connection.id, matched);
    consumedManualReferences.add(matched);
  });
  const slotsByIndex = /* @__PURE__ */ new Map();
  const emptyPurposes = visibleSlotPurposes?.length ? visibleSlotPurposes.map(normalizeSeedance2ReferenceSlotUseAs) : Array.from({ length: seedance2VisibleSlotCapacity(visibleSlotCount) }, () => "reference_image");
  emptyPurposes.forEach((useAs, index) => {
    const slotIndex = index + 1;
    slotsByIndex.set(slotIndex, {
      slotIndex,
      source: "empty",
      label: seedance2EmptySlotLabel(useAs, slotIndex),
      value: "",
      useAs
    });
  });
  manualReferences.filter((reference) => !consumedManualReferences.has(reference)).forEach((reference) => {
    slotsByIndex.set(reference.slotIndex, { ...reference, source: "manual" });
  });
  directConnections.forEach((directConnection) => {
    const existingEmptySlotIndex = [...slotsByIndex.entries()].sort(([left], [right]) => left - right).find(([, slot]) => slot.source === "empty")?.[0];
    let slotIndex = existingEmptySlotIndex;
    if (slotIndex === void 0) {
      slotIndex = 1;
      while (slotsByIndex.has(slotIndex)) slotIndex += 1;
    }
    const matchedManual = matchedManualByConnectionId.get(directConnection.connection.id);
    const emptySlotPurpose = slotIndex === void 0 ? void 0 : slotsByIndex.get(slotIndex)?.useAs;
    const value = seedance2ConnectionReferenceValue(directConnection.connection, directConnection.node) || matchedManual?.value || "";
    const isStoryCurrentShot = directConnection.node.id === placeholder.metadata?.seedanceStorySourceImageNodeId;
    const connectionRole = normalizeSeedance2StoryReferenceRole(directConnection.connection.referenceRole);
    slotsByIndex.set(slotIndex, {
      slotIndex,
      source: value ? "connected" : "pending",
      label: String(directConnection.connection.referenceLabel || "").trim() || matchedManual?.label || (isStoryCurrentShot ? SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY.current_shot : String(directConnection.node.title || `\u53C2\u8003\u56FE ${slotIndex}`).trim() || `\u53C2\u8003\u56FE ${slotIndex}`),
      value,
      previewValue: seedance2ConnectedImagePreviewValue(directConnection.node),
      nodeId: directConnection.node.id,
      connectionId: directConnection.connection.id,
      referenceId: (directConnection.connection.referenceAssetId && directConnection.connection.referenceAssetStorageKey ? seedance2OptionalNodeId(directConnection.connection.referenceAssetId) : void 0) || seedance2OptionalNodeId(matchedManual?.referenceId) || directConnection.node.id,
      referenceSequence: directConnection.referenceSequence,
      referenceOrigin: directConnection.connection.referenceOrigin,
      useAs: directConnection.connection.referenceUseAsExplicit === true && seedance2IsExplicitReferencePurpose(directConnection.connection.useAs) ? directConnection.connection.useAs : matchedManual?.useAsExplicit ? matchedManual.useAs : seedance2IsExplicitReferencePurpose(directConnection.connection.useAs) ? directConnection.connection.useAs : (matchedManual ? automaticConnectionPurpose : void 0) || matchedManual?.useAs || emptySlotPurpose || seedance2ConnectedImageUseAs(directConnection.node),
      role: connectionRole || matchedManual?.role || (isStoryCurrentShot ? "current_shot" : seedance2IsUpstreamHdFrame(directConnection.node) ? "upstream_frame" : "other")
    });
  });
  return [...slotsByIndex.values()].sort((left, right) => left.slotIndex - right.slotIndex);
}
function seedance2IsExplicitReferencePurpose(value) {
  return value === "first_frame" || value === "last_frame" || value === "keyframe" || value === "reference_image";
}
function seedance2ManualAndConnectionShareAsset(manual, connection, node) {
  const manualAssetId = seedance2OptionalNodeId(manual.referenceId);
  const connectedAssetId = connection.referenceAssetId && connection.referenceAssetStorageKey ? seedance2OptionalNodeId(connection.referenceAssetId) : void 0;
  if (connectedAssetId && manualAssetId && manualAssetId !== manual.nodeId) {
    return connectedAssetId === manualAssetId;
  }
  if (connectedAssetId) return false;
  return Boolean(manual.nodeId && manual.nodeId === node.id);
}
function seedance2EmptySlotLabel(useAs, slotIndex) {
  if (useAs === "first_frame") return "\u9996\u5E27";
  if (useAs === "last_frame") return "\u5C3E\u5E27";
  if (useAs === "keyframe") return `\u5173\u952E\u5E27 ${slotIndex}`;
  return `\u53C2\u8003\u56FE ${slotIndex}`;
}
function seedance2ResolvedSlotsToCustomerReferences(slots) {
  return [...slots].sort((left, right) => left.slotIndex - right.slotIndex).flatMap((slot) => {
    if (slot.source === "empty") return [];
    const value = seedance2ManualReferenceValue(slot.value);
    const referenceId = seedance2OptionalNodeId(slot.referenceId) || seedance2OptionalNodeId(slot.connectionId) || seedance2OptionalNodeId(slot.nodeId) || `seedance2-reference-slot-${slot.slotIndex}`;
    return [{
      id: referenceId,
      referenceId,
      label: String(slot.label || `\u53C2\u8003\u56FE ${slot.slotIndex}`).trim() || `\u53C2\u8003\u56FE ${slot.slotIndex}`,
      value,
      nodeId: seedance2OptionalNodeId(slot.nodeId) || `seedance2-reference-slot-${slot.slotIndex}`,
      useAs: normalizeSeedance2ReferenceSlotUseAs(slot.useAs),
      role: normalizeSeedance2StoryReferenceRole(slot.role) || "other",
      referenceOrigin: slot.referenceOrigin
    }];
  });
}
export {
  SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER,
  SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY,
  assignExclusiveSeedance2ReferenceUseAs,
  buildSeedance2ReferenceSlotKeysFromOrder,
  getSeedance2FirstFrameReference,
  mergeSeedance2OrderedCustomerReferences,
  nextSeedance2ReferenceSequence,
  normalizeSeedance2ReferenceSlotUseAs,
  normalizeSeedance2StoryReferenceRole,
  parseSeedance2ExtraReferenceSlotIndex,
  planSeedance2ReferenceConnection,
  resolveSeedance2ReferenceSlots,
  seedance2BoundExtraSlotStats,
  seedance2CanOccupyReferenceSlot,
  seedance2ManualReferenceHighestSlotIndex,
  seedance2ResolvedSlotsToCustomerReferences
};
