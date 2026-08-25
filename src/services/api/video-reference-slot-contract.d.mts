import type {
  ResolvedVideoModelCapability,
  VideoInputUseAs,
  VideoReferenceUseAs,
} from "./video-model-capabilities";

export type VideoReferenceContractState = "known" | "blocked" | "unbounded";
export type VideoReferenceSubmissionOperation =
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "first-last-frame-to-video"
  | "keyframes-to-video"
  | "continuation"
  | "video-edit";
export type VideoReferenceNotSubmittedReasonCode =
  | "blocked-contract"
  | "operation-required"
  | "unsupported-operation"
  | "operation-does-not-accept-images"
  | "workflow-policy"
  | "mixed-operation"
  | "unsupported-purpose"
  | "slot-occupied"
  | "capacity"
  | "missing-first-frame"
  | "missing-required-frame"
  | "operation-does-not-accept-videos"
  | "unsupported-video-purpose"
  | "video-cardinality";
export type VideoReferenceSlotPurpose = "first_frame" | "last_frame" | "keyframe" | "reference_image";
export type VideoReferenceContractItem = { useAs?: VideoReferenceUseAs | string; role?: string; referenceOrigin?: string };
export type VideoReferenceVideoItem = { useAs?: VideoInputUseAs | string; role?: string; referenceOrigin?: string; label?: string; name?: string };
export type VideoReferenceMediaCandidate<T extends VideoReferenceContractItem = VideoReferenceContractItem, V extends VideoReferenceVideoItem = VideoReferenceVideoItem> =
  | { mediaType: "image"; reference: T }
  | { mediaType: "video"; reference: V; useAs: string };

export type VideoReferenceSlotContract<T extends VideoReferenceContractItem = VideoReferenceContractItem> = {
  state: VideoReferenceContractState;
  recoverable: boolean;
  reason?: string;
  operation?: VideoReferenceSubmissionOperation;
  mode: "frames" | "references" | null;
  candidates: T[];
  visibleImageSlotPurposes: VideoReferenceSlotPurpose[];
  nextImageConnectionPurpose: VideoReferenceSlotPurpose | null;
  ordinaryReferenceMaximum: number | null;
  temporalSlots: { firstFrame: boolean; lastFrame: boolean; keyframes: boolean; keyframeMaximum: number | null };
  videoSlots: { useAs: VideoInputUseAs; minimum: number; maximum: number | null }[];
  sharedImageVideoMaximum: number | null;
  sharedRemainingCapacity: number | null;
  submitted: T[];
  notSubmitted: Array<{ reference: T; reasonCode: VideoReferenceNotSubmittedReasonCode; reason: string }>;
  mediaCandidates?: VideoReferenceMediaCandidate<T>[];
  mediaSubmitted?: VideoReferenceMediaCandidate<T>[];
  mediaNotSubmitted?: Array<{ candidate: VideoReferenceMediaCandidate<T>; reasonCode: VideoReferenceNotSubmittedReasonCode; reason: string }>;
};

export function resolveVideoReferenceSlotContract<T extends VideoReferenceContractItem>(options: {
  capability: ResolvedVideoModelCapability;
  operation?: VideoReferenceSubmissionOperation;
  references?: readonly T[];
  videos?: readonly VideoReferenceVideoItem[];
}): VideoReferenceSlotContract<T>;

export function blockUnverifiedVideoMediaContract<T extends VideoReferenceContractItem>(options: {
  references?: readonly T[];
  videos?: readonly VideoReferenceVideoItem[];
  operation?: VideoReferenceSubmissionOperation;
  reason?: string;
}): VideoReferenceSlotContract<T>;
