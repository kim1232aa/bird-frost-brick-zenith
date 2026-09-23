import type { ResolvedVideoModelCapability } from "@/services/api/video-model-capabilities";
import type { VideoReferenceSubmissionOperation } from "@/services/api/video-reference-slot-contract";

/**
 * When a video node or its upstream connection has a purpose that does not match
 * what the current model/operation actually accepts (e.g. a story connection marked
 * "first_frame" when the model only accepts ordinary "reference_image" in R2V mode),
 * this function automatically adapts the purpose so the reference is submitted
 * rather than rejected with a blocking error.
 */
export function adaptVideoReferencePurposeForOperation<T extends { useAs?: string; role?: string }>(
  reference: T,
  capability: ResolvedVideoModelCapability | undefined,
  operation: VideoReferenceSubmissionOperation | undefined,
): T {
  if (!capability || !operation) return reference;
  const currentUseAs = reference.useAs;

  // Case 1: reference-to-video mode on a model that does not accept first_frame in R2V
  // (e.g. Grok, Seedance without explicit first-frame in R2V).
  // If the upstream connection was tagged as "first_frame" (from story director),
  // adapt it to "reference_image" so the model actually submits it.
  if (operation === "reference-to-video") {
    const acceptsFirstInR2V =
      capability.intentPolicy === "r2v-with-first" ||
      capability.intentPolicy === "reference-set-with-frames";
    if (!acceptsFirstInR2V && (currentUseAs === "first_frame" || currentUseAs === "keyframe")) {
      return { ...reference, useAs: "reference_image" };
    }
  }

  // Case 2: image-to-video mode requires first_frame. If an unmarked reference or
  // "reference_image" is attached, adapt to "first_frame".
  if (operation === "image-to-video" && capability.supportsFirstFrame) {
    if (currentUseAs === "reference_image" || !currentUseAs) {
      return { ...reference, useAs: "first_frame" };
    }
  }

  // Case 3: keyframes-to-video mode requires keyframes or first/last frames.
  if (operation === "keyframes-to-video" && capability.supportsKeyframeSequence) {
    if (currentUseAs === "reference_image") {
      return { ...reference, useAs: "keyframe" };
    }
  }

  return reference;
}

export function adaptVideoReferenceListForOperation<T extends { useAs?: string; role?: string }>(
  references: readonly T[],
  capability: ResolvedVideoModelCapability | undefined,
  operation: VideoReferenceSubmissionOperation | undefined,
): T[] {
  return references.map((ref) => adaptVideoReferencePurposeForOperation(ref, capability, operation));
}
