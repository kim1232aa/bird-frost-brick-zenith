import type {
    CanvasImageOperation,
} from "../types";

export type StoryImageReferenceDeliveryReasonCode =
    | "character_not_found"
    | "character_reference_missing"
    | "character_derived_view_missing"
    | "turnaround_sheet_retained"
    | "reference_storage_key_missing"
    | "reference_media_missing"
    | "scene_reference_unclassified"
    | "scene_reference_mismatch"
    | "ambiguous_other_reference_retained"
    | "duplicate_reference_retained"
    | "reference_count_limited"
    | "references_unsupported"
    | "references_unknown"
    | "not_submitted";

export type StoryImageReferenceDeliverySnapshot = {
    version: 1;
    state: "ready" | "blocked";
    route: {
        providerId: string;
        providerLabel: string;
        model: string;
    };
    operation: CanvasImageOperation;
    referenceIntent: boolean;
    blockReason?: StoryImageReferenceDeliveryReasonCode;
    counts: {
        candidates: number;
        submitted: number;
        notSubmitted: number;
    };
    referenceCapacity:
        | { state: "verified"; max: number }
        | { state: "official-unpublished" }
        | { state: "unverified" };
    candidates: Array<{
        candidateKey: string;
        originalOrder: number;
        id: string;
        sourceNodeId: string;
        storageKey?: string;
        mediaSource: "storage-key" | "content" | "backend-url" | "missing";
        role: "identity" | "scene" | "prop" | "story" | "style";
        entityId?: string;
        angle?: "front" | "side" | "back" | "portrait" | "identity";
        label: string;
        status: "submitted" | "not_submitted";
        imageNumber?: number;
        reasonCode?: StoryImageReferenceDeliveryReasonCode;
    }>;
};
import type {
    StoryImageReferenceDescriptor,
    StoryImageReferenceSelection,
    SubmittedStoryImageReference,
} from "./story-image-reference-selection";

export type StoryImageTransportReference = {
    id: string;
    sourceNodeId: string;
    role: StoryImageReferenceDescriptor["role"];
    entityId?: string;
    angle?: StoryImageReferenceDescriptor["angle"];
    name: string;
    type: string;
    dataUrl: string;
    storageKey?: string;
    url?: string;
};

export type StoryImageReferenceDeliveryOptions = {
    readonly providerId: string;
    readonly providerLabel: string;
    readonly model: string;
    readonly operation?: CanvasImageOperation;
    readonly referenceCapacity: StoryImageReferenceDeliverySnapshot["referenceCapacity"];
};

export function buildStoryImageReferenceDelivery(
    selection: StoryImageReferenceSelection,
    options: StoryImageReferenceDeliveryOptions,
): {
    references: StoryImageTransportReference[];
    sourceNodeIds: string[];
    snapshot: StoryImageReferenceDeliverySnapshot;
} {
    if (!options.providerId.trim() || !options.providerLabel.trim() || !options.model.trim() || !options.referenceCapacity) {
        throw new Error("Story image reference delivery requires an exact safe provider/model route and capacity");
    }
    const allCandidates = [
        ...selection.submitted.map((descriptor) => ({ descriptor, status: "submitted" as const })),
        ...selection.retainedButNotSubmitted.map((descriptor) => ({ descriptor, status: "not_submitted" as const })),
    ].sort((left, right) => left.descriptor.originalOrder - right.descriptor.originalOrder);
    const warningByCandidateKey = deliveryReasonsByCandidateKey(allCandidates, selection.warnings);
    const blockReason = selection.submissionPlan.state === "blocked"
        ? selection.submissionPlan.reasonCode
        : undefined;
    const sourceNodeIds = Array.from(new Set(allCandidates.map(({ descriptor }) => descriptor.sourceNodeId)));
    return {
        references: selection.submitted.map(transportReference),
        sourceNodeIds,
        snapshot: {
            version: 1,
            state: selection.submissionPlan.state,
            route: {
                providerId: options.providerId,
                providerLabel: options.providerLabel,
                model: options.model,
            },
            operation: options.operation || selection.submissionPlan.operation,
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
                    ? { imageNumber: (descriptor as SubmittedStoryImageReference).imageNumber }
                    : {
                        reasonCode: warningByCandidateKey.get(descriptor.candidateKey) || blockReason || "not_submitted",
                    }),
            })),
        },
    };
}

type DeliveryCandidate = {
    descriptor: StoryImageReferenceDescriptor;
    status: "submitted" | "not_submitted";
};

function deliveryReasonsByCandidateKey(
    candidates: readonly DeliveryCandidate[],
    warnings: StoryImageReferenceSelection["warnings"],
) {
    const reasonByCandidateKey = new Map<string, StoryImageReferenceDeliveryReasonCode>();
    const usedWarningIndexes = new Set<number>();
    for (const { descriptor, status } of candidates) {
        if (status !== "not_submitted") continue;
        const warningIndex = warnings.findIndex((warning, index) => {
            if (usedWarningIndexes.has(index)) return false;
            const explicitCandidateKey = (warning as typeof warning & { readonly candidateKey?: string }).candidateKey;
            if (explicitCandidateKey) return explicitCandidateKey === descriptor.candidateKey;
            if (
                warning.referenceId &&
                warning.referenceId !== descriptor.id &&
                warning.referenceId !== descriptor.sourceNodeId
            ) return false;
            if (warning.entityId && warning.entityId !== descriptor.entityId) return false;
            return reasonMatchesCandidate(warning.code, descriptor);
        });
        if (warningIndex < 0) continue;
        usedWarningIndexes.add(warningIndex);
        reasonByCandidateKey.set(descriptor.candidateKey, warnings[warningIndex]!.code);
    }
    return reasonByCandidateKey;
}

function reasonMatchesCandidate(
    reason: StoryImageReferenceDeliveryReasonCode,
    candidate: StoryImageReferenceDescriptor,
) {
    if (reason === "character_not_found" || reason === "character_reference_missing") {
        return candidate.role === "identity";
    }
    if (reason === "character_derived_view_missing") return candidate.role === "identity";
    if (reason === "scene_reference_unclassified" || reason === "scene_reference_mismatch") {
        return candidate.role === "scene";
    }
    if (reason === "ambiguous_other_reference_retained") return candidate.role === "story";
    if (reason === "duplicate_reference_retained") return /:[1-9]\d*$/u.test(candidate.candidateKey);
    return true;
}

function transportReference(descriptor: SubmittedStoryImageReference): StoryImageTransportReference {
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
