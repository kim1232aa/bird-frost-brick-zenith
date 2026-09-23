export function buildStoryImageReferenceDelivery(selection, options = {}) {
  if (!String(options.providerId || "").trim() || !String(options.providerLabel || "").trim() || !String(options.model || "").trim() || !options.referenceCapacity) {
    throw new Error("Story image reference delivery requires an exact safe provider/model route and capacity");
  }
  const allCandidates = [
    ...selection.submitted.map((descriptor) => ({ descriptor, status: "submitted" })),
    ...selection.retainedButNotSubmitted.map((descriptor) => ({ descriptor, status: "not_submitted" })),
  ].sort((left, right) => left.descriptor.originalOrder - right.descriptor.originalOrder);
  const warningByCandidateKey = deliveryReasonsByCandidateKey(allCandidates, selection.warnings);
  const blockReason = selection.submissionPlan.state === "blocked"
    ? selection.submissionPlan.reasonCode
    : undefined;
  const requestedOperation = options.operation || selection.submissionPlan.operation;
  const operation = requestedOperation === 'edit' && selection.submitted.length === 0
    ? 'generate'
    : requestedOperation;
  return {
    references: selection.submitted.map(transportReference),
    sourceNodeIds: Array.from(new Set(allCandidates.map(({ descriptor }) => descriptor.sourceNodeId))),
    snapshot: {
      version: 1,
      state: selection.submissionPlan.state,
      route: {
        providerId: options.providerId,
        providerLabel: options.providerLabel,
        model: options.model,
      },
      operation,
      referenceIntent: selection.submissionPlan.referenceIntent,
      ...(blockReason ? { blockReason } : {}),
      counts: {
        candidates: allCandidates.length,
        submitted: selection.submitted.length,
        notSubmitted: selection.retainedButNotSubmitted.length,
      },
      referenceCapacity: options.referenceCapacity,
      candidates: allCandidates.map(({ descriptor, status }) => ({
        candidateKey: descriptor.candidateKey,
        originalOrder: descriptor.originalOrder,
        id: descriptor.id,
        sourceNodeId: descriptor.sourceNodeId,
        mediaSource: descriptor.mediaSource,
        role: descriptor.role,
        ...(descriptor.entityId ? { entityId: descriptor.entityId } : {}),
        ...(descriptor.angle ? { angle: descriptor.angle } : {}),
        label: descriptor.label,
        status,
        ...(status === "submitted"
          ? { imageNumber: descriptor.imageNumber }
          : { reasonCode: warningByCandidateKey.get(descriptor.candidateKey) || blockReason || "not_submitted" }),
      })),
    },
  };
}

function deliveryReasonsByCandidateKey(candidates, warnings) {
  const reasonByCandidateKey = new Map();
  const usedWarningIndexes = new Set();
  for (const { descriptor, status } of candidates) {
    if (status !== "not_submitted") continue;
    const warningIndex = warnings.findIndex((warning, index) => {
      if (usedWarningIndexes.has(index)) return false;
      if (warning.candidateKey) return warning.candidateKey === descriptor.candidateKey;
      if (warning.referenceId && warning.referenceId !== descriptor.id && warning.referenceId !== descriptor.sourceNodeId) return false;
      if (warning.entityId && warning.entityId !== descriptor.entityId) return false;
      return reasonMatchesCandidate(warning.code, descriptor);
    });
    if (warningIndex < 0) continue;
    usedWarningIndexes.add(warningIndex);
    reasonByCandidateKey.set(descriptor.candidateKey, warnings[warningIndex].code);
  }
  return reasonByCandidateKey;
}

function reasonMatchesCandidate(reason, candidate) {
  if (reason === "character_not_found" || reason === "character_reference_missing") return candidate.role === "identity";
  if (reason === "character_derived_view_missing") return candidate.role === "identity";
  if (reason === "scene_reference_unclassified" || reason === "scene_reference_mismatch") {
    return candidate.role === "scene";
  }
  if (reason === "ambiguous_other_reference_retained") return candidate.role === "story";
  if (reason === "duplicate_reference_retained") return /:[1-9]\d*$/.test(candidate.candidateKey);
  return true;
}

function transportReference(descriptor) {
  return {
    id: descriptor.id,
    sourceNodeId: descriptor.sourceNodeId,
    role: descriptor.role,
    ...(descriptor.entityId ? { entityId: descriptor.entityId } : {}),
    ...(descriptor.angle ? { angle: descriptor.angle } : {}),
    name: descriptor.label,
    type: descriptor.mimeType || "image/png",
    dataUrl: descriptor.dataUrl || "",
    ...(descriptor.storageKey ? { storageKey: descriptor.storageKey } : {}),
    ...(descriptor.url ? { url: descriptor.url } : {}),
  };
}
