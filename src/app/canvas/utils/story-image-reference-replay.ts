import type {
    CanvasNodeData,
} from "../types";
import type { StoryImageReferenceDeliverySnapshot } from "./story-image-reference-delivery";
import type { StoryImageTransportReference } from "./story-image-reference-delivery";

type ResolveStorageKey = (storageKey: string) => Promise<string | undefined>;

/**
 * Rehydrates the exact references recorded by a Story image delivery ledger.
 * The replay is atomic: a missing submitted candidate fails the whole replay,
 * and lineage nodes are never substituted for the recorded media source.
 */
export async function resolveStoryImageReferenceReplay(
    snapshot: StoryImageReferenceDeliverySnapshot | undefined,
    _nodes: readonly CanvasNodeData[],
    resolveStorageKey: ResolveStorageKey,
): Promise<StoryImageTransportReference[] | null> {
    if (!snapshot || snapshot.state === "blocked") return null;

    const submitted = snapshot.candidates
        .filter((candidate) => candidate.status === "submitted")
        .sort((left, right) => left.originalOrder - right.originalOrder);
    if (!submitted.length) {
        return snapshot.referenceIntent || snapshot.operation !== "generate" ? null : [];
    }
    // Legacy content/backend ledgers did not persist bytes or a fingerprint.
    // Reading the current source node would silently change the retry input.
    if (submitted.some((candidate) => candidate.mediaSource !== "storage-key" || !candidate.storageKey)) {
        return null;
    }

    const references = await Promise.all(
        submitted.map(async (candidate): Promise<StoryImageTransportReference | null> => {
            const dataUrl = (await resolveStorageKey(candidate.storageKey!)) || "";
            if (!dataUrl) return null;

            return {
                id: candidate.id,
                sourceNodeId: candidate.sourceNodeId,
                role: candidate.role,
                ...(candidate.entityId ? { entityId: candidate.entityId } : {}),
                ...(candidate.angle ? { angle: candidate.angle } : {}),
                name: candidate.label,
                type: "image/png",
                dataUrl,
                storageKey: candidate.storageKey,
            };
        }),
    );

    return references.every(Boolean)
        ? (references as StoryImageTransportReference[])
        : null;
}
