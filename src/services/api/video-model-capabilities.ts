import type { ReferenceImage } from "@/types/image";
import { resolveCivitaiVideoMediaContract } from "./civitai-video-media-contract.mjs";
import { resolveVideoReferenceSlotContract } from "./video-reference-slot-contract.mjs";
import type { VideoReferenceSubmissionOperation } from "./video-reference-slot-contract";

export type VideoReferenceRole = "current_shot" | "character" | "scene" | "prop" | "other" | "upstream_frame";
export type VideoReferenceUseAs = "first_frame" | "last_frame" | "keyframe" | "reference_image";

export type VideoReferenceImage = ReferenceImage & {
    role?: VideoReferenceRole;
    useAs?: VideoReferenceUseAs;
    label?: string;
    nodeId?: string;
    referenceOrigin?: "story_auto" | string;
};

export type VideoReferenceIntent<T = VideoReferenceImage> =
    | { kind: "none" }
    | { kind: "last_frame"; lastFrame: T }
    | { kind: "first_frame"; firstFrame: T }
    | { kind: "first_last_frame"; firstFrame: T; lastFrame: T }
    | { kind: "keyframes"; keyframes: T[] }
    | { kind: "reference_set"; references: T[]; softFirstFrame?: boolean }
    | { kind: "reference_set_with_first"; firstFrame: T; references: T[] }
    | { kind: "reference_set_with_frames"; firstFrame?: T; lastFrame?: T; references: T[] };

export type VideoCapabilityProfileId =
    | "agnes-video-v2"
    | "agnes-unknown"
    | "dashscope-wan27-i2v"
    | "dashscope-wan26-i2v"
    | "dashscope-wan-kf2v"
    | "dashscope-wan27-r2v"
    | "dashscope-wan26-r2v"
    | "dashscope-happyhorse-i2v"
    | "dashscope-happyhorse-r2v"
    | "dashscope-wan27-video-edit"
    | "dashscope-happyhorse-video-edit"
    | "dashscope-wan30-video"
    | "dashscope-t2v"
    | "dashscope-unknown"
    | "ark-seedance-2"
    | "ark-seedance-2-fast"
    | "ark-seedance-2-mini"
    | "ark-seedance-1-0-pro-fast"
    | "ark-seedance-legacy"
    | "ark-unknown"
    | "civitai-text-video"
    | "civitai-i2v"
    | "civitai-first-last"
    | "civitai-source-images"
    | "civitai-untyped-images"
    | "civitai-reference-images"
    | "civitai-reference-videos"
    | "civitai-happyhorse-r2v"
    | "civitai-frames-or-references"
    | "civitai-multimodal"
    | "civitai-unknown"
    | "openai-video"
    | "openai-unknown"
    | "xai-imagine-video"
    | "fal-kling3-pro"
    | "fal-kling3-standard"
    | "fal-kling3-turbo"
    | "fal-kling3-turbo-pro"
    | "fal-hailuo-2-3"
    | "fal-veo-3-1"
    | "fal-wan-pro"
    | "fal-minimax-h3"
    | "fal-unknown";

export const VIDEO_CAPABILITY_PROFILE_IDS: readonly VideoCapabilityProfileId[] = [
    "agnes-video-v2",
    "agnes-unknown",
    "dashscope-wan27-i2v",
    "dashscope-wan26-i2v",
    "dashscope-wan-kf2v",
    "dashscope-wan27-r2v",
    "dashscope-wan26-r2v",
    "dashscope-happyhorse-i2v",
    "dashscope-happyhorse-r2v",
    "dashscope-wan27-video-edit",
    "dashscope-happyhorse-video-edit",
    "dashscope-wan30-video",
    "dashscope-t2v",
    "dashscope-unknown",
    "ark-seedance-2",
    "ark-seedance-2-fast",
    "ark-seedance-2-mini",
    "ark-seedance-1-0-pro-fast",
    "ark-seedance-legacy",
    "ark-unknown",
    "civitai-text-video",
    "civitai-i2v",
    "civitai-first-last",
    "civitai-source-images",
    "civitai-untyped-images",
    "civitai-reference-images",
    "civitai-reference-videos",
    "civitai-happyhorse-r2v",
    "civitai-frames-or-references",
    "civitai-multimodal",
    "civitai-unknown",
    "openai-video",
    "openai-unknown",
    "xai-imagine-video",
    "fal-kling3-pro",
    "fal-kling3-standard",
    "fal-kling3-turbo",
    "fal-kling3-turbo-pro",
    "fal-hailuo-2-3",
    "fal-veo-3-1",
    "fal-wan-pro",
    "fal-minimax-h3",
    "fal-unknown",
];

export type VideoReferenceImagePolicy =
    | { supported: false }
    | { supported: true; min: number; /** null means the official schema publishes no maximum. */ max: number | null };

export type AutoCharacterDerivedViewPolicy = "disabled" | "single-view" | "multi-view";
export type StoryAutoReferencePolicy = "disabled" | "current-shot" | "semantic-references";
export type VideoInputUseAs = "reference_video" | "first_clip" | "source_video";
export type VideoInputPolicy =
    | { supported: false }
    | { supported: true; min: number; /** null means no published maximum. */ max: number | null; uses: readonly VideoInputUseAs[] };

export type VideoCapabilityProfile = {
    id: VideoCapabilityProfileId;
    provider: "agnes" | "dashscope" | "ark" | "civitai" | "openai" | "fal";
    label: string;
    supportsFirstFrame: boolean;
    supportsFirstLastFrame: boolean;
    /** The operation requires both temporal endpoints; a lone first frame is invalid. */
    requiresFirstLastFrame?: boolean;
    supportsKeyframeSequence?: boolean;
    /** Minimum ordered images required by the exact keyframe operation when verified. */
    keyframeImageMinimum?: number;
    /** null means the provider documents an array but does not publish a maximum. */
    keyframeImageLimit?: number | null;
    referenceImagePolicy: VideoReferenceImagePolicy;
    videoInputPolicy: VideoInputPolicy;
    /** One combined capacity consumed by ordinary reference images and reference videos. */
    sharedImageVideoMaximum?: number | null;
    /** Narrow legacy compatibility: an absent useAs is serialized as this purpose. */
    legacyUndefinedVideoUseAs?: VideoInputUseAs;
    /** Exact service intent allow-list, when the provider exposes several services through one shared profile. */
    allowedReferenceIntentKinds?: readonly VideoReferenceIntent["kind"][];
    /** Exact-operation evidence gate; never infer this from generic reference-image capacity. */
    autoCharacterDerivedViewPolicy: AutoCharacterDerivedViewPolicy;
    /** Exact service evidence for automatic story prefill; manual references remain independent. */
    storyAutoReferencePolicy?: StoryAutoReferencePolicy;
    supportsReferenceSetWithFirst: boolean;
    supportsReferenceSetWithFrames?: boolean;
    /** Exact paid operations exposed by a multi-operation endpoint. */
    supportedOperations?: readonly (
        | "text-to-video"
        | "image-to-video"
        | "reference-to-video"
        | "first-last-frame-to-video"
        | "keyframes-to-video"
        | "continuation"
        | "video-edit"
    )[];
    referenceContractBlockReason?: string;
    requiresExplicitProfile?: boolean;
    intentPolicy:
        | "single-frame"
        | "keyframes"
        | "i2v"
        | "r2v-with-first"
        | "reference-set"
        | "frames-or-reference-set"
        | "reference-set-with-frames"
        | "blocked"
        | "none";
};

export type VideoCapabilityProvider = {
    id?: string;
    name?: string;
    /** Local-only, duplicate-safe presentation name supplied by the configured provider list. */
    displayName?: string;
    baseUrl?: string;
    adapterType?: string;
    videoCapabilityProfiles?: Record<string, VideoCapabilityProfileId | string>;
};

export const VIDEO_GENERATION_PARAMETER_NAMES = [
    "duration",
    "frames",
    "fps",
    "resolution",
    "dimensions",
    "aspectRatio",
    "audio",
    "audioMode",
    "watermark",
    "returnLastFrame",
    "negativePrompt",
    "seed",
    "steps",
    "guidance",
    "sampler",
    "scheduler",
    "quantity",
    "modelVariant",
    "mode",
    "promptExpansion",
    "safetyChecker",
    "frameGuideStrength",
    "shift",
    "turbo",
    "usePro",
] as const;

export type VideoGenerationParameterName = (typeof VIDEO_GENERATION_PARAMETER_NAMES)[number];
export type VideoGenerationDimensions = { width: number; height: number } | string;
export type VideoGenerationParameterValue = string | number | boolean | readonly string[] | VideoGenerationDimensions;
export type VideoGenerationParameters = Partial<Record<VideoGenerationParameterName, VideoGenerationParameterValue>>;

export type VideoGenerationParameterStatus = "supported" | "unsupported" | "unpublished" | "conflict";
export type VideoGenerationParameterValueType = "integer" | "number" | "string" | "boolean" | "string-array" | "dimensions";

export type VideoGenerationParameterFieldContract = {
    status: VideoGenerationParameterStatus;
    description: string;
    valueType?: VideoGenerationParameterValueType;
    transportName?: string;
    required?: boolean;
    enumValues?: readonly (string | number | boolean)[];
    minimum?: number;
    maximum?: number;
    integer?: boolean;
    defaultValue?: string | number | boolean;
    maxLength?: number;
    fixedOutputValue?: string | number | boolean;
    offsetMultiple?: { offset: number; multiple: number };
    derivedFrom?: readonly VideoGenerationParameterName[];
};

export type VideoGenerationParameterContract = {
    id: string;
    evidence: readonly string[];
    strict: true;
    durationMaximumWhenReferenceVideo?: number;
} & Record<VideoGenerationParameterName, VideoGenerationParameterFieldContract>;

export type VideoGenerationParameterDescriptor = VideoGenerationParameterFieldContract & {
    name: VideoGenerationParameterName;
    label: string;
    options: readonly { value: string | number | boolean; label: string }[];
};

export type VideoGenerationParameterValidationContext = {
    hasReferenceVideo?: boolean;
};

export type ResolvedVideoModelCapability = VideoCapabilityProfile & {
    model: string;
    providerLabel: string;
    profileConfigured: boolean;
    generationParameters: VideoGenerationParameterContract;
};

type VideoCapabilityProfileDeclaration = Omit<VideoCapabilityProfile, "autoCharacterDerivedViewPolicy" | "videoInputPolicy"> &
    Partial<Pick<VideoCapabilityProfile, "autoCharacterDerivedViewPolicy" | "videoInputPolicy">>;

function defineVideoCapabilityProfiles(
    profiles: Record<VideoCapabilityProfileId, VideoCapabilityProfileDeclaration>,
): Record<VideoCapabilityProfileId, VideoCapabilityProfile> {
    return Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, {
        autoCharacterDerivedViewPolicy: "disabled" as const,
        videoInputPolicy: { supported: false } as const,
        ...profile,
    }])) as Record<VideoCapabilityProfileId, VideoCapabilityProfile>;
}

const VIDEO_CAPABILITY_PROFILES = defineVideoCapabilityProfiles({
    "agnes-video-v2": {
        id: "agnes-video-v2",
        provider: "agnes",
        label: "Agnes Video v2",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        supportsKeyframeSequence: true,
        keyframeImageMinimum: 2,
        keyframeImageLimit: 3,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        storyAutoReferencePolicy: "current-shot",
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video", "keyframes-to-video"],
        intentPolicy: "keyframes",
    },
    "agnes-unknown": {
        id: "agnes-unknown",
        provider: "agnes",
        label: "Agnes 未知视频模型",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        requiresExplicitProfile: true,
        intentPolicy: "none",
    },
    "dashscope-wan27-i2v": {
        id: "dashscope-wan27-i2v",
        provider: "dashscope",
        label: "DashScope Wan2.7 I2V",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: false },
        videoInputPolicy: { supported: true, min: 0, max: 1, uses: ["first_clip"] },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["image-to-video", "first-last-frame-to-video", "continuation"],
        intentPolicy: "i2v",
    },
    "dashscope-wan26-i2v": {
        id: "dashscope-wan26-i2v",
        provider: "dashscope",
        label: "DashScope Wan2.6 I2V",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "i2v",
    },
    "dashscope-wan-kf2v": {
        id: "dashscope-wan-kf2v",
        provider: "dashscope",
        label: "DashScope Wan KF2V",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        requiresFirstLastFrame: true,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["first-last-frame-to-video"],
        intentPolicy: "i2v",
    },
    "dashscope-wan27-r2v": {
        id: "dashscope-wan27-r2v",
        provider: "dashscope",
        label: "DashScope Wan2.7 R2V",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: 5 },
        videoInputPolicy: { supported: true, min: 0, max: 5, uses: ["reference_video"] },
        sharedImageVideoMaximum: 5,
        legacyUndefinedVideoUseAs: "reference_video",
        autoCharacterDerivedViewPolicy: "multi-view",
        supportsReferenceSetWithFirst: true,
        intentPolicy: "r2v-with-first",
    },
    "dashscope-wan26-r2v": {
        id: "dashscope-wan26-r2v",
        provider: "dashscope",
        label: "DashScope Wan2.6 R2V",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 0, max: 5 },
        videoInputPolicy: { supported: true, min: 0, max: 3, uses: ["reference_video"] },
        sharedImageVideoMaximum: 5,
        legacyUndefinedVideoUseAs: "reference_video",
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "reference-set",
    },
    "dashscope-happyhorse-i2v": {
        id: "dashscope-happyhorse-i2v",
        provider: "dashscope",
        label: "DashScope HappyHorse I2V",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "i2v",
    },
    "dashscope-happyhorse-r2v": {
        id: "dashscope-happyhorse-r2v",
        provider: "dashscope",
        label: "DashScope HappyHorse R2V",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: 9 },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "reference-set",
    },
    "dashscope-wan27-video-edit": {
        id: "dashscope-wan27-video-edit",
        provider: "dashscope",
        label: "DashScope Wan2.7 VideoEdit",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 0, max: 4 },
        videoInputPolicy: { supported: true, min: 1, max: 1, uses: ["source_video"] },
        storyAutoReferencePolicy: "disabled",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "reference-set",
        supportedOperations: ["video-edit"],
    },
    "dashscope-happyhorse-video-edit": {
        id: "dashscope-happyhorse-video-edit",
        provider: "dashscope",
        label: "DashScope HappyHorse Video Edit",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 0, max: 5 },
        videoInputPolicy: { supported: true, min: 1, max: 1, uses: ["source_video"] },
        storyAutoReferencePolicy: "disabled",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "reference-set",
        supportedOperations: ["video-edit"],
    },
    "dashscope-wan30-video": {
        id: "dashscope-wan30-video",
        provider: "dashscope",
        label: "DashScope Wan 3.0 Video",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 0, max: 10 },
        videoInputPolicy: { supported: true, min: 0, max: 5, uses: ["reference_video"] },
        legacyUndefinedVideoUseAs: "reference_video",
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video", "reference-to-video"],
        intentPolicy: "frames-or-reference-set",
    },
    "dashscope-t2v": {
        id: "dashscope-t2v",
        provider: "dashscope",
        label: "DashScope T2V",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "none",
    },
    "dashscope-unknown": {
        id: "dashscope-unknown",
        provider: "dashscope",
        label: "DashScope 未知视频模型",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        requiresExplicitProfile: true,
        intentPolicy: "none",
    },
    "ark-seedance-2": {
        id: "ark-seedance-2",
        provider: "ark",
        label: "Ark Seedance 2.0",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 1, max: 9 },
        videoInputPolicy: { supported: true, min: 0, max: 3, uses: ["reference_video"] },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video", "reference-to-video"],
        intentPolicy: "frames-or-reference-set",
    },
    "ark-seedance-2-fast": {
        id: "ark-seedance-2-fast",
        provider: "ark",
        label: "Ark Seedance 2.0 Fast",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 1, max: 9 },
        videoInputPolicy: { supported: true, min: 0, max: 3, uses: ["reference_video"] },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video", "reference-to-video"],
        intentPolicy: "frames-or-reference-set",
    },
    "ark-seedance-2-mini": {
        id: "ark-seedance-2-mini",
        provider: "ark",
        label: "Ark Seedance 2.0 Mini",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 1, max: 9 },
        videoInputPolicy: { supported: true, min: 0, max: 3, uses: ["reference_video"] },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video", "reference-to-video"],
        intentPolicy: "frames-or-reference-set",
    },
    // 官方能力表（https://docs.volcengine.com/docs/82379/1520757，verified 2026-08-14）：
    // seedance 1.0 pro fast 不支持首尾帧；1.5 pro / 1.0 pro 支持首尾帧，仍归 ark-seedance-legacy。
    "ark-seedance-1-0-pro-fast": {
        id: "ark-seedance-1-0-pro-fast",
        provider: "ark",
        label: "Ark Seedance 1.0 Pro Fast",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "ark-seedance-legacy": {
        id: "ark-seedance-legacy",
        provider: "ark",
        label: "Ark Seedance 1.x",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "i2v",
    },
    "ark-unknown": {
        id: "ark-unknown",
        provider: "ark",
        label: "Ark 未知 Endpoint",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        requiresExplicitProfile: true,
        intentPolicy: "none",
    },
    "civitai-text-video": {
        id: "civitai-text-video",
        provider: "civitai",
        label: "Civitai Text-to-Video",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "none",
    },
    "civitai-i2v": {
        id: "civitai-i2v",
        provider: "civitai",
        label: "Civitai Image-to-Video",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "i2v",
    },
    "civitai-first-last": {
        id: "civitai-first-last",
        provider: "civitai",
        label: "Civitai First/Last Frame Video",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "i2v",
    },
    "civitai-source-images": {
        id: "civitai-source-images",
        provider: "civitai",
        label: "Civitai Source Images",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: null },
        supportsReferenceSetWithFirst: false,
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        intentPolicy: "frames-or-reference-set",
    },
    "civitai-untyped-images": {
        id: "civitai-untyped-images",
        provider: "civitai",
        label: "Civitai Untyped Images",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: null },
        supportsReferenceSetWithFirst: false,
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        intentPolicy: "reference-set",
    },
    "civitai-reference-images": {
        id: "civitai-reference-images",
        provider: "civitai",
        label: "Civitai Reference-to-Video",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: null },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "reference-set",
    },
    "civitai-reference-videos": {
        id: "civitai-reference-videos",
        provider: "civitai",
        label: "Civitai Reference Videos",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        videoInputPolicy: { supported: true, min: 1, max: 3, uses: ["reference_video"] },
        storyAutoReferencePolicy: "disabled",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["reference-to-video"],
        intentPolicy: "none",
    },
    "civitai-happyhorse-r2v": {
        id: "civitai-happyhorse-r2v",
        provider: "civitai",
        label: "Civitai HappyHorse 1.1 R2V",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: null },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "reference-set",
    },
    "civitai-frames-or-references": {
        id: "civitai-frames-or-references",
        provider: "civitai",
        label: "Civitai Frames or Reference Images",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 1, max: null },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: false,
        intentPolicy: "frames-or-reference-set",
    },
    "civitai-multimodal": {
        id: "civitai-multimodal",
        provider: "civitai",
        label: "Civitai Multimodal Video",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 1, max: null },
        autoCharacterDerivedViewPolicy: "multi-view",
        storyAutoReferencePolicy: "semantic-references",
        supportsReferenceSetWithFirst: true,
        supportsReferenceSetWithFrames: true,
        intentPolicy: "reference-set-with-frames",
    },
    "civitai-unknown": {
        id: "civitai-unknown",
        provider: "civitai",
        label: "Civitai 未知动态视频服务",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        requiresExplicitProfile: true,
        intentPolicy: "none",
    },
    "openai-video": {
        id: "openai-video",
        provider: "openai",
        label: "OpenAI-compatible Video",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "single-frame",
    },
    "openai-unknown": {
        id: "openai-unknown",
        provider: "openai",
        label: "OpenAI-compatible 未知视频模型",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        requiresExplicitProfile: true,
        intentPolicy: "none",
    },
    "xai-imagine-video": {
        id: "xai-imagine-video",
        provider: "openai",
        label: "xAI Grok Imagine Video",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: true, min: 1, max: 7 },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportsReferenceSetWithFrames: false,
        supportedOperations: ["text-to-video", "image-to-video", "reference-to-video"],
        intentPolicy: "frames-or-reference-set",
    },
    // fal 视频队列（2026-09-14 queue.fal.run 探针 + 官方文档 schema 实证）
    "fal-kling3-pro": {
        id: "fal-kling3-pro",
        provider: "fal",
        label: "Fal Kling v3 Pro",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video"],
        intentPolicy: "i2v",
    },
    "fal-kling3-standard": {
        id: "fal-kling3-standard",
        provider: "fal",
        label: "Fal Kling v3 Standard",
        supportsFirstFrame: true,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video"],
        intentPolicy: "i2v",
    },
    "fal-kling3-turbo-pro": {
        id: "fal-kling3-turbo-pro",
        provider: "fal",
        label: "Fal Kling v3 Turbo Pro",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "fal-kling3-turbo": {
        id: "fal-kling3-turbo",
        provider: "fal",
        label: "Fal Kling v3 Turbo",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "fal-hailuo-2-3": {
        id: "fal-hailuo-2-3",
        provider: "fal",
        label: "Fal MiniMax Hailuo 2.3 Pro",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "fal-veo-3-1": {
        id: "fal-veo-3-1",
        provider: "fal",
        label: "Fal Veo 3.1",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "fal-wan-pro": {
        id: "fal-wan-pro",
        provider: "fal",
        label: "Fal Wan Pro",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "fal-minimax-h3": {
        id: "fal-minimax-h3",
        provider: "fal",
        label: "Fal MiniMax Hailuo 03",
        supportsFirstFrame: true,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        storyAutoReferencePolicy: "current-shot",
        supportsReferenceSetWithFirst: false,
        supportedOperations: ["text-to-video", "image-to-video"],
        intentPolicy: "i2v",
    },
    "fal-unknown": {
        id: "fal-unknown",
        provider: "fal",
        label: "Fal 未知视频模型",
        supportsFirstFrame: false,
        supportsFirstLastFrame: false,
        referenceImagePolicy: { supported: false },
        supportsReferenceSetWithFirst: false,
        requiresExplicitProfile: true,
        intentPolicy: "none",
    },
});

const VIDEO_GENERATION_PARAMETER_LABELS: Record<VideoGenerationParameterName, string> = {
    duration: "时长",
    frames: "帧数",
    fps: "帧率",
    resolution: "分辨率档位",
    dimensions: "宽高",
    aspectRatio: "画面比例",
    audio: "音频",
    audioMode: "音频处理",
    watermark: "水印",
    returnLastFrame: "返回尾帧",
    negativePrompt: "负面提示词",
    seed: "随机种子",
    steps: "推理步数",
    guidance: "引导强度",
    sampler: "采样器",
    scheduler: "调度器",
    quantity: "生成数量",
    modelVariant: "模型变体",
    mode: "生成模式",
    promptExpansion: "提示词扩写",
    safetyChecker: "安全检查器",
    frameGuideStrength: "帧引导强度",
    shift: "Shift",
    turbo: "Turbo",
    usePro: "Pro 模式",
};

const STRICT_SCHEMA_EVIDENCE = "精确请求 schema 未声明该字段；非空值会被拒绝，不能透传或猜测";
const UNPUBLISHED_EVIDENCE = "当前官方资料没有公布可执行字段合同；非空值会被拒绝，不能按其他 provider 猜测";

function unavailableParameter(status: "unsupported" | "unpublished" | "conflict", description?: string): VideoGenerationParameterFieldContract {
    return {
        status,
        description: description || (status === "unsupported" ? STRICT_SCHEMA_EVIDENCE : status === "conflict" ? "官方资料存在冲突；在冲突解除前拒绝非空值" : UNPUBLISHED_EVIDENCE),
    };
}

function supportedParameter(
    valueType: VideoGenerationParameterValueType,
    transportName: string,
    description: string,
    options: Partial<Omit<VideoGenerationParameterFieldContract, "status" | "valueType" | "transportName" | "description">> = {},
): VideoGenerationParameterFieldContract {
    return { status: "supported", valueType, transportName, description, ...options };
}

function makeVideoGenerationParameterContract(
    id: string,
    evidence: readonly string[],
    defaultStatus: "unsupported" | "unpublished",
    fields: Partial<Record<VideoGenerationParameterName, VideoGenerationParameterFieldContract>>,
    options: Pick<VideoGenerationParameterContract, "durationMaximumWhenReferenceVideo"> = {},
): VideoGenerationParameterContract {
    const fallback = Object.fromEntries(
        VIDEO_GENERATION_PARAMETER_NAMES.map((name) => [name, unavailableParameter(defaultStatus)]),
    ) as Record<VideoGenerationParameterName, VideoGenerationParameterFieldContract>;
    return { id, evidence, strict: true, ...fallback, ...fields, ...options };
}

const AGNES_VIDEO_EVIDENCE = [
    "https://agnes-ai.com/en/docs/agnes-video-v20 (verified 2026-08-03)",
] as const;
const OPENAI_VIDEO_EVIDENCE = [
    "https://developers.openai.com/api/reference/resources/videos/methods/create (verified 2026-08-03)",
] as const;
const XAI_IMAGINE_VIDEO_EVIDENCE = [
    "https://docs.x.ai/developers/model-capabilities/video/generation (verified 2026-08-30; duration 1–15, aspect_ratio, resolution 480p/720p/1080p, generate_audio=false for silent output)",
    "https://docs.x.ai/developers/model-capabilities/video/image-to-video (verified 2026-08-30; image is the generated video's starting frame)",
    "https://docs.x.ai/developers/model-capabilities/video/reference-to-video (verified 2026-08-30; up to 7 reference images and no first-frame lock)",
] as const;
const DASHSCOPE_WAN27_I2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference (verified 2026-08-03)",
] as const;
const DASHSCOPE_WAN27_R2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/wan-video-to-video-api-reference (verified 2026-08-03)",
] as const;
const DASHSCOPE_WAN_T2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/text-to-video-api-reference (verified 2026-08-03)",
] as const;
const DASHSCOPE_WAN26_I2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/legacy-image-to-video-api-reference/ (verified 2026-08-03)",
] as const;
const DASHSCOPE_WAN26_R2V_EVIDENCE = [
    "https://help.aliyun.com/zh/model-studio/legacy-wan-reference-to-video-api-reference (verified 2026-08-14; reference_urls accepts 0..5 images plus 0..3 videos, at most 5 in total)",
] as const;
const DASHSCOPE_WAN25_PREVIEW_EVIDENCE = [
    "https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference (verified 2026-08-14; wan2.5-t2v-preview/wan2.5-i2v-preview use the legacy protocol, duration enum 5|10 seconds, resolution 480P|720P|1080P; i2v takes a single img_url first frame)",
] as const;
const DASHSCOPE_WAN_KF2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/legacy-image-to-video-by-first-and-last-frame-api-reference (verified 2026-08-03)",
] as const;
const DASHSCOPE_HAPPYHORSE_I2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/happyhorse-image-to-video-api-reference (verified 2026-08-03)",
] as const;
const DASHSCOPE_HAPPYHORSE_R2V_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/happyhorse-reference-to-video-api-reference (verified 2026-08-03)",
] as const;
const DASHSCOPE_HAPPYHORSE_T2V_EVIDENCE = [
    "https://www.alibabacloud.com/help/en/model-studio/happyhorse-text-to-video-api-reference (verified 2026-08-04; request body lists 1.0 and 1.1, resolution/ratio/seed/watermark for both, and explicitly states 1.0 duration 3..15)",
    "https://www.alibabacloud.com/help/en/model-studio/newly-released-models (verified 2026-08-04; 2026-06-22 lifecycle entry explicitly states HappyHorse 1.1 T2V supports 3..15 seconds at 720P/1080P)",
] as const;
const DASHSCOPE_HAPPYHORSE_10_I2V_EVIDENCE = [
    "https://www.alibabacloud.com/help/en/model-studio/happyhorse-image-to-video-api-reference (verified 2026-08-04; request body lists happyhorse-1.0-i2v and 1.1-i2v as allowed models, with one first_frame and shared resolution/duration/watermark/seed fields)",
] as const;
const DASHSCOPE_HAPPYHORSE_10_R2V_EVIDENCE = [
    "https://www.alibabacloud.com/help/en/model-studio/happyhorse-reference-to-video-api-reference (verified 2026-08-04; request body lists happyhorse-1.0-r2v and 1.1-r2v as allowed models, with 1..9 reference_image inputs and shared resolution/ratio/duration/watermark/seed fields)",
] as const;
const DASHSCOPE_HAPPYHORSE_10_T2V_EVIDENCE = [
    "https://www.alibabacloud.com/help/en/model-studio/happyhorse-text-to-video-api-reference (verified 2026-08-04; request body lists happyhorse-1.0-t2v and 1.1-t2v as allowed models; it explicitly gives 1.0 duration 3..15 and shared resolution/ratio/watermark/seed fields)",
] as const;
const DASHSCOPE_WAN27_VIDEO_EDIT_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/wan-video-editing-api-reference (verified 2026-08-04)",
] as const;
const DASHSCOPE_HAPPYHORSE_VIDEO_EDIT_EVIDENCE = [
    "https://help.aliyun.com/en/model-studio/happyhorse-video-edit-api-reference (verified 2026-08-04)",
] as const;
const DASHSCOPE_WAN30_VIDEO_EVIDENCE = [
    "https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference (verified 2026-08-28; wan3.0-video / wan3.0-video-prime all-in-one: t2v, first/last frame i2v, reference_image≤10, reference_video≤5, reference_audio≤5; frames XOR reference_*/file/link; duration 2..30 or -1; resolution 480P/720P/1080P default 1080P; ratio adaptive default)",
] as const;
const ARK_VIDEO_EVIDENCE = [
    "https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01 (verified 2026-08-03; public model-level parameter schema incomplete)",
] as const;
const ARK_SEEDANCE_2_EVIDENCE = [
    "https://docs.volcengine.com/docs/82379/1520757 (verified 2026-08-09; official create-task contract, metadata updated 2026-08-07T10:44:45Z)",
    "https://docs.volcengine.com/docs/82379/2291680 (verified 2026-08-09; official Seedance 2.0 series API tutorial and model-variant operation matrix)",
    "https://www.volcengine.com/activity/seedance2 (verified 2026-08-09; standard and mini model variants, multimodal generation, 4..15 seconds, and per-variant resolutions)",
    "https://developer.volcengine.com/articles/7641782568258306102 (verified 2026-08-09; official Ark example uses ordered reference images, 15 seconds, 720p, ratio, and generate_audio)",
    "https://www.volcengine.com/docs/82379/2315856?lang=en (verified 2026-08-09; Ark Seedance 2 content item role reference_image)",
    "https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01 (verified 2026-08-09; content request and return_last_frame transport)",
] as const;
// 官方同一全模态容量另支持参考音频 0-3 段（https://docs.volcengine.com/docs/82379/1520757）；
// 本注册表没有 audioInputPolicy 概念，参考音频由 video.ts 的 Seedance 提交通道（audio_url / reference_audio）单独接线。

const AGNES_VIDEO_GENERATION_PARAMETERS = makeVideoGenerationParameterContract(
    "agnes:agnes-video-v2.0",
    AGNES_VIDEO_EVIDENCE,
    "unpublished",
    {
        duration: supportedParameter("integer", "num_frames / frame_rate（仅 UI）", "API 没有 seconds 字段；UI 以 num_frames / frame_rate 的四舍五入结果显示“约 N 秒”，不会把 duration 发送到 API", { minimum: 1, derivedFrom: ["frames", "fps"] }),
        frames: supportedParameter("integer", "num_frames", "最大 441 帧，且帧数必须满足 8n+1", { minimum: 1, maximum: 441, integer: true, offsetMultiple: { offset: 1, multiple: 8 } }),
        fps: supportedParameter("number", "frame_rate", "官方列为 number，范围 1..60；未公布精度限制，按输入原样发送", { minimum: 1, maximum: 60 }),
        dimensions: supportedParameter("dimensions", "width/height", "width、height 为整数；官方未公布数值边界，服务会按其尺寸映射处理", { integer: true }),
        aspectRatio: unavailableParameter("unpublished", "官方参数表仅公布 width/height，未公布 ratio 或 aspect_ratio；不会猜测尺寸"),
        negativePrompt: supportedParameter("string", "negative_prompt", "官方请求字段 negative_prompt"),
        seed: supportedParameter("integer", "seed", "官方请求字段 seed；未公布数值范围", { integer: true }),
        steps: supportedParameter("integer", "num_inference_steps", "官方请求字段 num_inference_steps；未公布数值范围", { integer: true }),
        resolution: unavailableParameter("unsupported", "Agnes 创建请求使用 width/height，不接受通用 resolution 档位字段"),
    },
);

const OPENAI_VIDEO_GENERATION_PARAMETERS = makeVideoGenerationParameterContract(
    "openai:videos-create",
    OPENAI_VIDEO_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("integer", "seconds", "官方 seconds 枚举；HTTP 传输为字符串", { enumValues: [4, 8, 12], defaultValue: 4, integer: true }),
        dimensions: supportedParameter("dimensions", "size", "官方 size 枚举", { enumValues: ["720x1280", "1280x720", "1024x1792", "1792x1024"], defaultValue: "720x1280" }),
        aspectRatio: unavailableParameter("unsupported", "OpenAI Videos 没有 aspect_ratio 字段；应从 size 枚举选择方向"),
        resolution: unavailableParameter("unsupported", "OpenAI Videos 没有独立 resolution 档位字段；应使用 size"),
    },
);

function xaiImagineVideoGenerationParameters(includeAudio: boolean) {
    return makeVideoGenerationParameterContract(
        "xai:imagine-video",
        XAI_IMAGINE_VIDEO_EVIDENCE,
        "unsupported",
        {
            duration: supportedParameter("integer", "duration", "出片时长，1 到 15 秒", {
                enumValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
                defaultValue: 8,
                integer: true,
                minimum: 1,
                maximum: 15,
            }),
            resolution: supportedParameter("string", "resolution", "画面清晰度。1080p 只在 1.5 的文生视频/图生视频可用", {
                enumValues: ["480p", "720p", "1080p"],
                defaultValue: "720p",
            }),
            aspectRatio: supportedParameter("string", "aspect_ratio", "画面比例。图生视频不选时跟原图走", {
                enumValues: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
                defaultValue: "16:9",
            }),
            ...(includeAudio
                ? {
                    audio: supportedParameter("boolean", "generate_audio", "是否生成音轨；false 时请求静音视频（仅 grok-imagine-video-1.5）", { defaultValue: true }),
                }
                : {}),
        },
    );
}

const XAI_IMAGINE_VIDEO_GENERATION_PARAMETERS = xaiImagineVideoGenerationParameters(false);
const XAI_IMAGINE_VIDEO_15_GENERATION_PARAMETERS = xaiImagineVideoGenerationParameters(true);
const XAI_RELAY_VIDEO_GENERATION_PARAMETERS = makeVideoGenerationParameterContract(
    "xai-compatible-relay:imagine-video",
    ["已验证的 xAI-compatible relay /videos/generations 兼容 wire；不等同于 api.x.ai 官方枚举"],
    "unsupported",
    {
        duration: supportedParameter("integer", "duration", "兼容 relay 原样接收整数 duration；不套用 api.x.ai 的 1..15 枚举", { integer: true }),
        resolution: supportedParameter("string", "resolution", "兼容 relay 原样接收非空 resolution；不套用 api.x.ai 枚举"),
        aspectRatio: supportedParameter("string", "aspect_ratio", "兼容 relay 原样接收非空 aspect_ratio；未填时与官方/serializer 一致走 16:9", { defaultValue: "16:9" }),
        audio: supportedParameter("boolean", "generate_audio", "兼容 relay 的 generate_audio 布尔扩展；保留 true/false"),
    },
);

// fal 视频队列参数合同。注意：fal 队列对任意路径都回 IN_QUEUE，submit 不是存活证据；
// 2026-09-15 以「结果拉取」重验全量端点：真端点回参数校验错误/真实任务，
// 假端点秒回 0.05s COMPLETED 且结果 404 Path not found。
const FAL_VIDEO_EVIDENCE = [
    "https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api (verified 2026-09-15; start_image_url/end_image_url, duration 3-15, aspect_ratio t2v only, generate_audio, negative_prompt, cfg_scale)",
    "queue.fal.run result-fetch probes 2026-09-15: kling v3 pro/standard + v3/turbo/standard + v3/turbo/pro t2v+i2v all REAL (validation errors returned); fal-ai/kling-video/v3/turbo direct path is FAKE (404 Path not found)",
    "queue.fal.run result-fetch probes 2026-09-15: veo3.1 t2v lives at ROOT fal-ai/veo3.1 (t2v/i2v real, duration 4s/6s/8s); fal-ai/veo3.1/text-to-video is FAKE",
    "queue.fal.run result-fetch probes 2026-09-15: minimax/hailuo-2.3/pro t2v+i2v real (image_url first frame, prompt_optimizer); wan-pro t2v+i2v real (seed, enable_safety_checker)",
    "queue.fal.run result-fetch probes 2026-09-15: minimax/hailuo-03 t2v+i2v real and GA (duration numeric <=15), early-access caveat removed",
    "https://fal.ai/models/fal-ai/veo3.1/image-to-video/api (verified 2026-09-14; image_url first frame only, duration 4s/6s/8s, aspect_ratio auto/16:9/9:16, resolution 720p/1080p/4k, seed)",
    "https://fal.ai/models/fal-ai/minimax/hailuo-2.3/pro/image-to-video/api (verified 2026-09-14; image_url first frame only, prompt_optimizer)",
] as const;
const FAL_KLING_DURATION = supportedParameter("integer", "duration", "出片时长 3 到 15 秒；HTTP 传输为字符串枚举", {
    enumValues: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    defaultValue: 5,
    integer: true,
    minimum: 3,
    maximum: 15,
});
const FAL_KLING_ASPECT = supportedParameter("string", "aspect_ratio", "画面比例（仅文生视频；图生视频跟原图走）", {
    enumValues: ["16:9", "9:16", "1:1"],
    defaultValue: "16:9",
});
const FAL_KLING3_PRO_PARAMETERS = makeVideoGenerationParameterContract(
    "fal:kling-video-v3-pro",
    FAL_VIDEO_EVIDENCE,
    "unsupported",
    {
        duration: FAL_KLING_DURATION,
        aspectRatio: FAL_KLING_ASPECT,
        audio: supportedParameter("boolean", "generate_audio", "是否生成原生音轨", { defaultValue: true }),
        negativePrompt: supportedParameter("string", "negative_prompt", "负面提示词", { defaultValue: "blur, distort, and low quality" }),
        guidance: supportedParameter("number", "cfg_scale", "CFG 引导强度 0..1", { defaultValue: 0.5, minimum: 0, maximum: 1 }),
    },
);
const FAL_KLING3_TURBO_PARAMETERS = makeVideoGenerationParameterContract(
    "fal:kling-video-v3-turbo",
    FAL_VIDEO_EVIDENCE,
    "unsupported",
    { duration: FAL_KLING_DURATION, aspectRatio: FAL_KLING_ASPECT },
);
const FAL_VEO31_PARAMETERS = makeVideoGenerationParameterContract(
    "fal:veo3.1",
    FAL_VIDEO_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("string", "duration", "出片时长枚举（HTTP 为 4s/6s/8s 字符串）", {
            enumValues: ["4s", "6s", "8s"],
            defaultValue: "8s",
        }),
        aspectRatio: supportedParameter("string", "aspect_ratio", "画面比例", { enumValues: ["auto", "16:9", "9:16"], defaultValue: "auto" }),
        resolution: supportedParameter("string", "resolution", "画面清晰度", { enumValues: ["720p", "1080p", "4k"], defaultValue: "720p" }),
        audio: supportedParameter("boolean", "generate_audio", "是否生成音轨", { defaultValue: true }),
        negativePrompt: supportedParameter("string", "negative_prompt", "负面提示词"),
        seed: supportedParameter("integer", "seed", "随机种子", { integer: true }),
    },
);
const FAL_HAILUO23_PARAMETERS = makeVideoGenerationParameterContract(
    "fal:minimax-hailuo-2.3-pro",
    FAL_VIDEO_EVIDENCE,
    "unsupported",
    {
        promptExpansion: supportedParameter("boolean", "prompt_optimizer", "是否启用模型提示词优化", { defaultValue: true }),
    },
);
const FAL_WANPRO_PARAMETERS = makeVideoGenerationParameterContract(
    "fal:wan-pro",
    FAL_VIDEO_EVIDENCE,
    "unsupported",
    {
        duration: unavailableParameter("unsupported", "Wan Pro 固定 6 秒 1080p30，官方请求合同没有 duration 字段"),
        seed: supportedParameter("integer", "seed", "随机种子；不传随机", { integer: true }),
        safetyChecker: supportedParameter("boolean", "enable_safety_checker", "是否启用安全检查器", { defaultValue: true }),
    },
);
const FAL_MINIMAX_H3_PARAMETERS = makeVideoGenerationParameterContract(
    "fal:minimax-hailuo-03",
    FAL_VIDEO_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("integer", "duration", "出片时长（数字，≤15 秒；2026-09-15 校验报错实证）", {
            defaultValue: 5,
            integer: true,
            minimum: 1,
            maximum: 15,
        }),
    },
);

const DASHSCOPE_SEED = supportedParameter("integer", "seed", "随机种子 0..2147483647", { minimum: 0, maximum: 2_147_483_647, integer: true });
const DASHSCOPE_WATERMARK = supportedParameter("boolean", "watermark", "是否添加 provider 水印");
const DASHSCOPE_NEGATIVE_PROMPT = supportedParameter("string", "negative_prompt", "负面提示词，最长 500 字符", { maxLength: 500 });
const DASHSCOPE_PROMPT_EXPANSION = supportedParameter("boolean", "prompt_extend", "是否启用提示词扩写");
const DASHSCOPE_FIXED_30_FPS = unavailableParameter("unsupported", "输出固定为 30fps，官方请求合同没有可配置 fps 字段");
const DASHSCOPE_VIDEO_DIMENSIONS = [
    "1280x720", "720x1280", "960x960", "1088x832", "832x1088",
    "1920x1080", "1080x1920", "1440x1440", "1632x1248", "1248x1632",
] as const;
const DASHSCOPE_VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const HAPPYHORSE_VIDEO_RATIOS = ["16:9", "9:16", "3:4", "4:3", "4:5", "5:4", "1:1", "9:21", "21:9"] as const;

function dashscopeWan27GenerationParameters(kind: "i2v" | "r2v" | "t2v") {
    const evidence = kind === "i2v" ? DASHSCOPE_WAN27_I2V_EVIDENCE : kind === "r2v" ? DASHSCOPE_WAN27_R2V_EVIDENCE : DASHSCOPE_WAN_T2V_EVIDENCE;
    return makeVideoGenerationParameterContract(
        `dashscope:wan2.7-${kind}`,
        evidence,
        "unsupported",
        {
            duration: supportedParameter("integer", "parameters.duration", kind === "r2v" ? "整数 2..15；含参考视频时最大 10" : "整数 2..15", { minimum: 2, maximum: 15, integer: true, defaultValue: 5 }),
            fps: DASHSCOPE_FIXED_30_FPS,
            resolution: supportedParameter("string", "parameters.resolution", "分辨率档位", { enumValues: ["720P", "1080P"], defaultValue: "1080P" }),
            aspectRatio: kind === "i2v"
                ? unavailableParameter("unsupported", "I2V 输出比例跟随首帧或首段视频，不接受 ratio 参数")
                : supportedParameter("string", "parameters.ratio", "输出画面比例；R2V 有首帧时该字段会被 provider 忽略", { enumValues: DASHSCOPE_VIDEO_RATIOS, defaultValue: "16:9" }),
            audio: kind === "r2v"
                ? supportedParameter("string-array", "input.media[].reference_voice", "每个主体参考可选独立 reference_voice；数量由参考素材合同约束")
                : supportedParameter("string", kind === "i2v" ? "input.media[type=driving_audio].url" : "input.audio_url", "WAV/MP3 音频 URL；具体时长和大小仍由媒体预检校验"),
            watermark: DASHSCOPE_WATERMARK,
            negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
            seed: DASHSCOPE_SEED,
            promptExpansion: DASHSCOPE_PROMPT_EXPANSION,
        },
        kind === "r2v" ? { durationMaximumWhenReferenceVideo: 10 } : {},
    );
}

const DASHSCOPE_WAN27_I2V_PARAMETERS = dashscopeWan27GenerationParameters("i2v");
const DASHSCOPE_WAN27_R2V_PARAMETERS = dashscopeWan27GenerationParameters("r2v");
const DASHSCOPE_WAN27_T2V_PARAMETERS = dashscopeWan27GenerationParameters("t2v");
const DASHSCOPE_WAN30_RATIOS = ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;
const DASHSCOPE_WAN30_DURATIONS = [-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] as const;
const DASHSCOPE_WAN30_VIDEO_PARAMETERS = makeVideoGenerationParameterContract(
    "dashscope:wan3.0-video",
    DASHSCOPE_WAN30_VIDEO_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter(
            "integer",
            "parameters.duration",
            "-1 表示智能时长；无参考视频时整数 2..30；有参考视频时输入总时长 + 输出时长不超过 30 秒",
            { enumValues: DASHSCOPE_WAN30_DURATIONS, integer: true, defaultValue: 5 },
        ),
        fps: DASHSCOPE_FIXED_30_FPS,
        resolution: supportedParameter("string", "parameters.resolution", "分辨率档位，默认 1080P", { enumValues: ["480P", "720P", "1080P"], defaultValue: "1080P" }),
        aspectRatio: supportedParameter("string", "parameters.ratio", "输出画面比例；默认 adaptive，按输入媒体和意图自动匹配", { enumValues: DASHSCOPE_WAN30_RATIOS, defaultValue: "adaptive" }),
        audio: supportedParameter("boolean", "parameters.audio", "输出视频是否包含音轨；参考音频走 input.media[type=reference_audio]", { defaultValue: true }),
        watermark: DASHSCOPE_WATERMARK,
        seed: DASHSCOPE_SEED,
        promptExpansion: DASHSCOPE_PROMPT_EXPANSION,
    },
);

function dashscopeWan26I2vGenerationParameters(id: string, audioGenerationSupported: boolean) {
    return makeVideoGenerationParameterContract(id, DASHSCOPE_WAN26_I2V_EVIDENCE, "unsupported", {
        duration: supportedParameter("integer", "parameters.duration", "整数 2..15", { minimum: 2, maximum: 15, integer: true, defaultValue: 5 }),
        fps: DASHSCOPE_FIXED_30_FPS,
        resolution: supportedParameter("string", "parameters.resolution", "分辨率档位", { enumValues: ["720P", "1080P"], defaultValue: "1080P" }),
        aspectRatio: unavailableParameter("unsupported", "I2V 输出比例跟随首帧，不接受 ratio 参数"),
        audio: audioGenerationSupported
            ? supportedParameter("boolean", "parameters.audio", "仅 wan2.6-i2v-flash 支持是否生成音频", { defaultValue: true })
            : supportedParameter("string", "input.audio_url", "WAV/MP3 音频 URL；wan2.6-i2v 没有 parameters.audio 布尔开关"),
        watermark: DASHSCOPE_WATERMARK,
        negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
        seed: DASHSCOPE_SEED,
        promptExpansion: DASHSCOPE_PROMPT_EXPANSION,
    });
}

function dashscopeWan26R2vGenerationParameters(audioSupported: boolean) {
    return makeVideoGenerationParameterContract(
        `dashscope:wan2.6-r2v${audioSupported ? "-flash" : ""}`,
        DASHSCOPE_WAN26_R2V_EVIDENCE,
        "unsupported",
        {
            duration: supportedParameter("integer", "parameters.duration", "整数 2..10", { minimum: 2, maximum: 10, integer: true, defaultValue: 5 }),
            fps: DASHSCOPE_FIXED_30_FPS,
            dimensions: supportedParameter("dimensions", "parameters.size", "必须使用官方精确 width*height 尺寸枚举", { enumValues: DASHSCOPE_VIDEO_DIMENSIONS, defaultValue: "1920x1080" }),
            aspectRatio: unavailableParameter("unsupported", "Wan2.6 R2V 使用精确 size，不接受 ratio 参数"),
            audio: audioSupported
                ? supportedParameter("boolean", "parameters.audio", "仅 wan2.6-r2v-flash 支持是否生成音频", { defaultValue: true })
                : unavailableParameter("unsupported", "wan2.6-r2v 不支持 parameters.audio；该开关仅属于 flash 模型"),
            watermark: DASHSCOPE_WATERMARK,
            seed: DASHSCOPE_SEED,
        },
    );
}

function dashscopeWan26T2vGenerationParameters(usVariant: boolean) {
    return makeVideoGenerationParameterContract(
        `dashscope:wan2.6-t2v${usVariant ? "-us" : ""}`,
        DASHSCOPE_WAN_T2V_EVIDENCE,
        "unsupported",
        {
            duration: supportedParameter("integer", "parameters.duration", usVariant ? "美国区模型仅支持 5 或 10 秒" : "整数 2..15", usVariant ? { enumValues: [5, 10], integer: true, defaultValue: 5 } : { minimum: 2, maximum: 15, integer: true, defaultValue: 5 }),
            fps: DASHSCOPE_FIXED_30_FPS,
            dimensions: supportedParameter("dimensions", "parameters.size", "必须使用官方精确 width*height 尺寸枚举", { enumValues: DASHSCOPE_VIDEO_DIMENSIONS }),
            aspectRatio: unavailableParameter("unsupported", "Wan2.6 T2V 使用精确 size，不接受 ratio 参数"),
            audio: supportedParameter("string", "input.audio_url", "WAV/MP3 音频 URL"),
            watermark: DASHSCOPE_WATERMARK,
            negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
            seed: DASHSCOPE_SEED,
            promptExpansion: DASHSCOPE_PROMPT_EXPANSION,
        },
    );
}

const DASHSCOPE_WAN25_T2V_PREVIEW_PARAMETERS = makeVideoGenerationParameterContract(
    "dashscope:wan2.5-t2v-preview",
    DASHSCOPE_WAN25_PREVIEW_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("integer", "parameters.duration", "枚举 5 或 10 秒", { enumValues: [5, 10], integer: true, defaultValue: 5 }),
        resolution: supportedParameter("string", "parameters.resolution", "分辨率档位 480P/720P/1080P", { enumValues: ["480P", "720P", "1080P"] }),
    },
);
const DASHSCOPE_WAN25_I2V_PREVIEW_PARAMETERS = makeVideoGenerationParameterContract(
    "dashscope:wan2.5-i2v-preview",
    DASHSCOPE_WAN25_PREVIEW_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("integer", "parameters.duration", "枚举 5 或 10 秒", { enumValues: [5, 10], integer: true, defaultValue: 5 }),
        resolution: supportedParameter("string", "parameters.resolution", "分辨率档位 480P/720P/1080P", { enumValues: ["480P", "720P", "1080P"] }),
    },
);

const DASHSCOPE_WAN_KF2V_PARAMETERS = makeVideoGenerationParameterContract(
    "dashscope:wan2.2-kf2v-flash",
    DASHSCOPE_WAN_KF2V_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("integer", "parameters.duration", "固定 5 秒", { enumValues: [5], integer: true, defaultValue: 5 }),
        resolution: supportedParameter("string", "parameters.resolution", "Wan2.2 KF2V 分辨率档位", { enumValues: ["480P", "720P", "1080P"], defaultValue: "720P" }),
        aspectRatio: unavailableParameter("unsupported", "输出比例跟随首帧，不接受 ratio 参数"),
        watermark: DASHSCOPE_WATERMARK,
        negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
        seed: DASHSCOPE_SEED,
        promptExpansion: DASHSCOPE_PROMPT_EXPANSION,
    },
);

function dashscopeHappyHorseGenerationParameters(version: "1.0" | "1.1", kind: "i2v" | "r2v" | "t2v") {
    const evidence = version === "1.0"
        ? kind === "i2v" ? DASHSCOPE_HAPPYHORSE_10_I2V_EVIDENCE : kind === "r2v" ? DASHSCOPE_HAPPYHORSE_10_R2V_EVIDENCE : DASHSCOPE_HAPPYHORSE_10_T2V_EVIDENCE
        : kind === "i2v" ? DASHSCOPE_HAPPYHORSE_I2V_EVIDENCE : kind === "r2v" ? DASHSCOPE_HAPPYHORSE_R2V_EVIDENCE : DASHSCOPE_HAPPYHORSE_T2V_EVIDENCE;
    return makeVideoGenerationParameterContract(
        `dashscope:happyhorse-${version}-${kind}`,
        evidence,
        "unsupported",
        {
            duration: supportedParameter("integer", "parameters.duration", "整数 3..15", { minimum: 3, maximum: 15, integer: true, defaultValue: 5 }),
            fps: unavailableParameter("unsupported", "输出为 24fps，官方请求合同没有可配置 fps 字段"),
            resolution: supportedParameter("string", "parameters.resolution", "分辨率档位", { enumValues: ["720P", "1080P"], defaultValue: "1080P" }),
            aspectRatio: kind === "i2v"
                ? unavailableParameter("unsupported", "HappyHorse I2V 输出比例跟随首帧，不支持 ratio")
                : supportedParameter("string", "parameters.ratio", "输出画面比例", { enumValues: HAPPYHORSE_VIDEO_RATIOS, defaultValue: "16:9" }),
            watermark: DASHSCOPE_WATERMARK,
            seed: DASHSCOPE_SEED,
        },
    );
}

const DASHSCOPE_HAPPYHORSE_I2V_PARAMETERS = dashscopeHappyHorseGenerationParameters("1.1", "i2v");
const DASHSCOPE_HAPPYHORSE_R2V_PARAMETERS = dashscopeHappyHorseGenerationParameters("1.1", "r2v");
const DASHSCOPE_HAPPYHORSE_T2V_PARAMETERS = dashscopeHappyHorseGenerationParameters("1.1", "t2v");
const DASHSCOPE_HAPPYHORSE_10_I2V_PARAMETERS = dashscopeHappyHorseGenerationParameters("1.0", "i2v");
const DASHSCOPE_HAPPYHORSE_10_R2V_PARAMETERS = dashscopeHappyHorseGenerationParameters("1.0", "r2v");
const DASHSCOPE_HAPPYHORSE_10_T2V_PARAMETERS = dashscopeHappyHorseGenerationParameters("1.0", "t2v");
const DASHSCOPE_WAN27_VIDEO_EDIT_PARAMETERS = makeVideoGenerationParameterContract(
    "dashscope:wan2.7-videoedit",
    DASHSCOPE_WAN27_VIDEO_EDIT_EVIDENCE,
    "unsupported",
    {
        duration: supportedParameter("integer", "parameters.duration", "0 表示跟随源视频；2..10 表示从开头截断", { enumValues: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10], integer: true, defaultValue: 0 }),
        resolution: supportedParameter("string", "parameters.resolution", "输出分辨率档位", { enumValues: ["720P", "1080P"], defaultValue: "1080P" }),
        aspectRatio: supportedParameter("string", "parameters.ratio", "留空跟随源视频；显式值重设比例", { enumValues: DASHSCOPE_VIDEO_RATIOS }),
        audioMode: supportedParameter("string", "parameters.audio_setting", "auto 智能决定；origin 强制保留源音频", { enumValues: ["auto", "origin"], defaultValue: "auto" }),
        watermark: DASHSCOPE_WATERMARK,
        negativePrompt: DASHSCOPE_NEGATIVE_PROMPT,
        seed: DASHSCOPE_SEED,
        promptExpansion: DASHSCOPE_PROMPT_EXPANSION,
    },
);
const DASHSCOPE_HAPPYHORSE_VIDEO_EDIT_PARAMETERS = makeVideoGenerationParameterContract(
    "dashscope:happyhorse-1.0-video-edit",
    DASHSCOPE_HAPPYHORSE_VIDEO_EDIT_EVIDENCE,
    "unsupported",
    {
        resolution: supportedParameter("string", "parameters.resolution", "输出分辨率档位", { enumValues: ["720P", "1080P"], defaultValue: "1080P" }),
        audioMode: supportedParameter("string", "parameters.audio_setting", "auto 由模型决定；origin 保留源音频", { enumValues: ["auto", "origin"], defaultValue: "auto" }),
        watermark: DASHSCOPE_WATERMARK,
        seed: DASHSCOPE_SEED,
    },
);

const ARK_UNPUBLISHED_GENERATION_PARAMETERS = makeVideoGenerationParameterContract(
    "ark:public-model-schema-incomplete",
    ARK_VIDEO_EVIDENCE,
    "unpublished",
    {},
);

const ARK_SEEDANCE_2_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"] as const;
const ARK_SEEDANCE_2_DURATIONS = [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

function arkSeedance2GenerationParameters(
    variant: "standard" | "fast" | "mini",
    resolutions: readonly string[],
) {
    return makeVideoGenerationParameterContract(
        `ark:seedance-2.0-${variant}`,
        ARK_SEEDANCE_2_EVIDENCE,
        "unsupported",
        {
            duration: supportedParameter("integer", "duration", "-1 表示智能时长；或整数 4..15 秒", {
                enumValues: ARK_SEEDANCE_2_DURATIONS,
                integer: true,
            }),
            resolution: supportedParameter("string", "resolution", `${variant} 变体的官方分辨率枚举`, {
                enumValues: resolutions,
            }),
            aspectRatio: supportedParameter("string", "ratio", "输出画面比例", {
                enumValues: ARK_SEEDANCE_2_RATIOS,
            }),
            audio: supportedParameter("boolean", "generate_audio", "是否生成同步音频", { defaultValue: true }),
            watermark: supportedParameter("boolean", "watermark", "是否添加水印", { defaultValue: false }),
            returnLastFrame: supportedParameter("boolean", "return_last_frame", "是否在任务结果中返回无水印尾帧", { defaultValue: false }),
        },
    );
}

const ARK_SEEDANCE_2_STANDARD_PARAMETERS = arkSeedance2GenerationParameters("standard", ["480p", "720p", "1080p", "4k"]);
const ARK_SEEDANCE_2_FAST_PARAMETERS = arkSeedance2GenerationParameters("fast", ["480p", "720p"]);
const ARK_SEEDANCE_2_MINI_PARAMETERS = arkSeedance2GenerationParameters("mini", ["480p", "720p"]);

const CIVITAI_VIDEO_EVIDENCE = [
    "https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json (SHA-256 4e59dbe90eccad8d8666e5ce98ef9ec8049c30ecb313a166a4ca2f677453a33b, verified 2026-08-03)",
] as const;
const CIVITAI_WAN26_R2V_EVIDENCE = [
    "https://github.com/civitai/civitai-comfy-nodes/blob/80ef09a51b70fe8aca750c3390b7c9fdbb818507/spec/v2-consumers.json#L30059-L30180 (fixed schema minimum/maximum is 5..10 while the field description narrows duration to 5 or 10; conservative intersection verified 2026-08-09)",
] as const;

function civitaiGenerationParameters(
    serviceId: string,
    fields: Partial<Record<VideoGenerationParameterName, VideoGenerationParameterFieldContract>>,
    options: Pick<VideoGenerationParameterContract, "durationMaximumWhenReferenceVideo"> = {},
    evidence: readonly string[] = CIVITAI_VIDEO_EVIDENCE,
) {
    return makeVideoGenerationParameterContract(`civitai:${serviceId}`, evidence, "unsupported", fields, options);
}

const CIVITAI_INT32_SEED = supportedParameter("integer", "seed", "live schema 接受 nullable int32 seed", { integer: true });
const CIVITAI_INT64_SEED = supportedParameter("integer", "seed", "live schema 接受 nullable int64 seed；JavaScript 调用方仍须使用安全整数", { integer: true });
const CIVITAI_WAN_GUIDANCE = supportedParameter("number", "cfgScale", "live Wan schema 范围 0..100", { minimum: 0, maximum: 100, defaultValue: 4, required: true });
const CIVITAI_WAN_FPS = supportedParameter("integer", "frameRate", "live Wan schema 接受 int32，未公布最小值或最大值", { integer: true, defaultValue: 24 });
const CIVITAI_WAN_DURATION = supportedParameter("integer", "duration", "live Wan 基础 schema 范围 1..30", { minimum: 1, maximum: 30, integer: true, defaultValue: 5 });
const CIVITAI_WAN_STEPS = supportedParameter("integer", "steps", "live Wan 基础 schema 范围 10..50", { minimum: 10, maximum: 50, integer: true, defaultValue: 20 });
const CIVITAI_WAN_NEGATIVE = supportedParameter("string", "negativePrompt", "live operation schema 接受 nullable negativePrompt");

function civitaiWanFields(options: {
    resolution?: readonly string[];
    aspectRatios?: readonly string[];
    negativePrompt?: boolean;
    audio?: VideoGenerationParameterFieldContract;
    promptExpansion?: boolean;
    safetyChecker?: boolean;
    shift?: boolean;
    turbo?: boolean;
}) {
    return {
        duration: CIVITAI_WAN_DURATION,
        fps: CIVITAI_WAN_FPS,
        ...(options.resolution ? { resolution: supportedParameter("string", "resolution", "live service 分辨率枚举", { enumValues: options.resolution }) } : {}),
        ...(options.aspectRatios ? { aspectRatio: supportedParameter("string", "aspectRatio", "live service 画面比例枚举", { enumValues: options.aspectRatios }) } : {}),
        ...(options.audio ? { audio: options.audio } : {}),
        ...(options.negativePrompt ? { negativePrompt: CIVITAI_WAN_NEGATIVE } : {}),
        seed: CIVITAI_INT32_SEED,
        steps: CIVITAI_WAN_STEPS,
        guidance: CIVITAI_WAN_GUIDANCE,
        ...(options.promptExpansion ? { promptExpansion: supportedParameter("boolean", "enablePromptExpansion", "是否启用提示词扩写") } : {}),
        ...(options.safetyChecker ? { safetyChecker: supportedParameter("boolean", "enableSafetyChecker", "live schema 的 provider 安全检查开关") } : {}),
        ...(options.shift ? { shift: supportedParameter("number", "shift", "live schema 范围 1..10", { minimum: 1, maximum: 10, defaultValue: 5 }) } : {}),
        ...(options.turbo ? { turbo: supportedParameter("boolean", "useTurbo", "live schema 的 Wan turbo 开关") } : {}),
    } satisfies Partial<Record<VideoGenerationParameterName, VideoGenerationParameterFieldContract>>;
}

function civitaiHappyHorseParameters(serviceId: string, kind: "i2v" | "r2v" | "t2v") {
    return civitaiGenerationParameters(serviceId, {
        duration: supportedParameter("integer", "duration", "live v1.1 schema 范围 3..15", { minimum: 3, maximum: 15, integer: true, defaultValue: 5 }),
        resolution: supportedParameter("string", "resolution", "Civitai HappyHorse v1.1 live 枚举", { enumValues: ["720p", "1080p"], defaultValue: "1080p" }),
        ...(kind === "i2v" ? {} : {
            aspectRatio: supportedParameter("string", "aspectRatio", "Civitai HappyHorse v1.1 live 枚举", { enumValues: HAPPYHORSE_VIDEO_RATIOS, defaultValue: "16:9" }),
        }),
        seed: CIVITAI_INT64_SEED,
    });
}

const CIVITAI_HUNYUAN_PARAMETERS = civitaiGenerationParameters("video/hunyuan", {
    duration: supportedParameter("integer", "duration", "live schema 范围 1..30", { minimum: 1, maximum: 30, integer: true, defaultValue: 5 }),
    fps: supportedParameter("integer", "frameRate", "live schema 接受 int32，未公布范围", { integer: true, defaultValue: 25 }),
    dimensions: supportedParameter("dimensions", "width/height", "width 和 height 为必填 int32；live schema 未公布数值范围", { integer: true, required: true, defaultValue: "1280x720" }),
    seed: CIVITAI_INT32_SEED,
    steps: supportedParameter("integer", "steps", "live schema 范围 10..50；官方 recipe 默认 40", { minimum: 10, maximum: 50, integer: true, defaultValue: 40 }),
    guidance: supportedParameter("number", "cfgScale", "live schema 范围 0..100", { minimum: 0, maximum: 100, defaultValue: 4, required: true }),
});

const CIVITAI_KLING_PARAMETERS = civitaiGenerationParameters("video/kling", {
    duration: supportedParameter("string", "duration", "live Kling schema 使用字符串枚举", { enumValues: ["5", "10"], defaultValue: "5" }),
    aspectRatio: supportedParameter("string", "aspectRatio", "live Kling 比例枚举", { enumValues: ["16:9", "9:16", "1:1"] }),
    negativePrompt: supportedParameter("string", "negativePrompt", "live schema 接受 nullable negativePrompt"),
    guidance: supportedParameter("number", "cfgScale", "live schema 范围 0..1", { minimum: 0, maximum: 1, defaultValue: 0.5, required: true }),
    modelVariant: supportedParameter("string", "model", "live Kling 模型枚举", { enumValues: ["v1", "v1.5", "v1.6", "v2", "v2.5-turbo"] }),
    mode: supportedParameter("string", "mode", "live Kling 质量模式", { enumValues: ["standard", "professional"] }),
});

const CIVITAI_KLING_V3_PARAMETERS = civitaiGenerationParameters("video/kling-v3", {
    duration: supportedParameter("integer", "duration", "live Kling V3 schema 范围 3..15", { minimum: 3, maximum: 15, integer: true, defaultValue: 5 }),
    aspectRatio: supportedParameter("string", "aspectRatio", "live Kling V3 比例枚举", { enumValues: ["16:9", "9:16", "1:1"] }),
    audio: supportedParameter("boolean", "generateAudio", "是否生成音频", { defaultValue: false }),
    mode: supportedParameter("string", "mode", "live Kling V3 质量模式", { enumValues: ["standard", "professional"] }),
});

function civitaiLtx23Parameters(serviceId: string, firstLast: boolean) {
    return civitaiGenerationParameters(serviceId, {
        duration: supportedParameter("integer", "duration", "时长 3–20 秒，默认 5 秒", { minimum: 3, maximum: 20, integer: true, defaultValue: 5 }),
        fps: supportedParameter("number", "fps", "帧率 1–60，默认 24", { minimum: 1, maximum: 60, defaultValue: 24 }),
        dimensions: supportedParameter("dimensions", "width/height", "官方常用 1280×720、720×1280、1024×1024；可按像素填写宽高", { integer: true, defaultValue: "1280x720" }),
        audio: supportedParameter("boolean", "generateAudio", "是否生成音频", { defaultValue: true }),
        negativePrompt: supportedParameter("string", "negativePrompt", "live schema 接受 nullable negativePrompt"),
        seed: CIVITAI_INT32_SEED,
        steps: supportedParameter("integer", "numInferenceSteps", "live schema 范围 8..50", { minimum: 8, maximum: 50, integer: true, defaultValue: 20 }),
        guidance: supportedParameter("number", "guidanceScale", "live schema 范围 1..10", { minimum: 1, maximum: 10, defaultValue: 4 }),
        quantity: supportedParameter("integer", "quantity", "单作业生成数量 1..10", { minimum: 1, maximum: 10, integer: true, defaultValue: 1 }),
        modelVariant: supportedParameter("string", "model", "LTX 2.3 live 模型枚举；默认选择 22b-distilled（速度）", { enumValues: ["22b-dev", "22b-distilled"], defaultValue: "22b-distilled" }),
        ...(firstLast ? { frameGuideStrength: supportedParameter("number", "frameGuideStrength", "首尾帧引导强度 0..1", { minimum: 0, maximum: 1, defaultValue: 0.7 }) } : {}),
    });
}

const CIVITAI_MINIMAX_H3_PARAMETERS = civitaiGenerationParameters("video/minimax-h3", {
    duration: supportedParameter("integer", "duration", "live schema 范围 5..15", { minimum: 5, maximum: 15, integer: true, required: true, defaultValue: 5 }),
    resolution: supportedParameter("string", "resolution", "live schema 当前只允许 2K", { enumValues: ["2K"], required: true, defaultValue: "2K" }),
    aspectRatio: supportedParameter("string", "aspectRatio", "live MiniMax H3 比例枚举", { enumValues: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], required: true, defaultValue: "16:9" }),
    watermark: supportedParameter("boolean", "watermark", "是否添加水印", { defaultValue: false }),
});

const CIVITAI_SEEDANCE_PARAMETERS = civitaiGenerationParameters("video/seedance", {
    duration: supportedParameter("integer", "duration", "live schema 精确整数枚举 4..15", { enumValues: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], integer: true, required: true, defaultValue: 5 }),
    resolution: supportedParameter("string", "resolution", "live Seedance 分辨率枚举", { enumValues: ["480p", "720p", "1080p"], required: true, defaultValue: "720p" }),
    aspectRatio: supportedParameter("string", "aspectRatio", "live Seedance 比例枚举", { enumValues: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"], required: true, defaultValue: "16:9" }),
    audio: supportedParameter("boolean", "generateAudio", "是否生成音频", { defaultValue: true }),
    seed: CIVITAI_INT64_SEED,
    modelVariant: supportedParameter("string", "model", "live Seedance 模型枚举", { enumValues: ["v2", "v2-fast", "v2-mini", "v2.5"] }),
});

function civitaiSoraParameters(serviceId: string) {
    return civitaiGenerationParameters(serviceId, {
        duration: supportedParameter("integer", "duration", "Civitai Sora live schema 范围 4..12；这不是 OpenAI 原生 seconds 枚举", { minimum: 4, maximum: 12, integer: true, defaultValue: 4 }),
        resolution: supportedParameter("string", "resolution", "live schema 分辨率枚举", { enumValues: ["720p", "1080p"], defaultValue: "720p" }),
        aspectRatio: supportedParameter("string", "aspectRatio", "live schema 比例枚举", { enumValues: ["auto", "16:9", "9:16"], defaultValue: "auto" }),
        seed: CIVITAI_INT32_SEED,
        usePro: supportedParameter("boolean", "usePro", "是否使用 Sora Pro provider 路径", { defaultValue: false }),
    });
}

function civitaiGrokParameters(serviceId: string, imageToVideo: boolean) {
    return civitaiGenerationParameters(serviceId, {
        duration: supportedParameter("integer", "duration", "live Grok schema 范围 1..15", { minimum: 1, maximum: 15, integer: true, defaultValue: 6 }),
        resolution: supportedParameter("string", "resolution", "live Grok 分辨率枚举", { enumValues: ["480p", "720p"], defaultValue: "720p" }),
        ...(imageToVideo ? { aspectRatio: supportedParameter("string", "aspectRatio", "Grok I2V live 比例枚举", { enumValues: ["auto", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"], defaultValue: "auto" }) } : {}),
    });
}

const CIVITAI_VIDU_PARAMETERS = civitaiGenerationParameters("video/vidu", {
    duration: supportedParameter("integer", "duration", "live Vidu 精确枚举", { enumValues: [4, 8], integer: true, defaultValue: 4 }),
    aspectRatio: supportedParameter("string", "aspectRatio", "live Vidu 比例枚举", { enumValues: ["16:9", "9:16", "1:1"] }),
    audio: supportedParameter("boolean", "enableBackgroundMusic", "是否生成背景音乐", { defaultValue: false }),
    seed: CIVITAI_INT32_SEED,
    modelVariant: supportedParameter("string", "model", "live Vidu 模型枚举", { enumValues: ["default", "q1", "q3"] }),
    mode: supportedParameter("string", "movementAmplitude", "运动幅度枚举", { enumValues: ["auto", "small", "medium", "large"] }),
});

const CIVITAI_VIDU_Q3_PARAMETERS = civitaiGenerationParameters("video/vidu-q3", {
    duration: supportedParameter("integer", "duration", "live Vidu Q3 范围 1..16", { minimum: 1, maximum: 16, integer: true, defaultValue: 5 }),
    resolution: supportedParameter("string", "resolution", "live Vidu Q3 分辨率枚举", { enumValues: ["360p", "540p", "720p", "1080p"], defaultValue: "720p" }),
    aspectRatio: supportedParameter("string", "aspectRatio", "live Vidu Q3 比例枚举", { enumValues: ["16:9", "9:16", "1:1", "4:3", "3:4"] }),
    audio: supportedParameter("boolean", "enableAudio", "是否生成音频", { defaultValue: true }),
    seed: CIVITAI_INT32_SEED,
    turbo: supportedParameter("boolean", "turbo", "是否启用 turbo", { defaultValue: false }),
});

const CIVITAI_WAN21_PARAMETERS = civitaiGenerationParameters("video/wan/v2.1/civitai", {
    ...civitaiWanFields({}),
    dimensions: supportedParameter("dimensions", "width/height", "live schema 接受 int32 width/height，未公布范围", { integer: true, defaultValue: "480x480" }),
});

const CIVITAI_WAN225B_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.2-5b/fal/image-to-video", {
    ...civitaiWanFields({
        resolution: ["480p", "580p", "720p"],
        aspectRatios: ["1:1", "16:9", "9:16", "auto"],
        negativePrompt: true,
        promptExpansion: true,
        safetyChecker: true,
    }),
});

const CIVITAI_WAN22_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.2/fal/image-to-video", {
    ...civitaiWanFields({
        resolution: ["480p", "720p"],
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4"],
        negativePrompt: true,
        promptExpansion: true,
        safetyChecker: true,
        shift: true,
        turbo: true,
    }),
});

const CIVITAI_WAN25_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.5/fal/image-to-video", {
    ...civitaiWanFields({
        resolution: ["480p", "720p", "1080p"],
        aspectRatios: ["16:9", "9:16", "1:1"],
        negativePrompt: true,
        promptExpansion: true,
    }),
});

const CIVITAI_WAN27_I2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.7/fal/image-to-video", {
    ...civitaiWanFields({
        resolution: ["720p", "1080p"],
        negativePrompt: true,
        promptExpansion: true,
        safetyChecker: true,
        audio: supportedParameter("string", "audioUrl", "live I2V schema 接受 WAV/MP3 音频 URL"),
    }),
    aspectRatio: unavailableParameter("unsupported", "Civitai Wan 2.7 I2V live schema 没有 aspectRatio；输出比例由输入帧决定"),
});

const CIVITAI_WAN26_R2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.6/fal/reference-to-video", {
    duration: supportedParameter("integer", "duration", "fixed schema 数值范围为 5..10，但同字段 description/官方指南仅允许 5 或 10；采用保守交集", { enumValues: [5, 10], integer: true, defaultValue: 5 }),
    resolution: supportedParameter("string", "resolution", "fixed schema 分辨率枚举", { enumValues: ["720p", "1080p"], defaultValue: "1080p" }),
    aspectRatio: supportedParameter("string", "aspectRatio", "fixed schema 画面比例枚举", { enumValues: ["16:9", "9:16", "1:1", "4:3", "3:4"], defaultValue: "16:9" }),
    guidance: CIVITAI_WAN_GUIDANCE,
}, {}, CIVITAI_WAN26_R2V_EVIDENCE);

const CIVITAI_WAN27_R2V_PARAMETERS = civitaiGenerationParameters("video/wan/v2.7/fal/reference-to-video", {
    ...civitaiWanFields({
        resolution: ["720p", "1080p"],
        aspectRatios: DASHSCOPE_VIDEO_RATIOS,
        negativePrompt: true,
        safetyChecker: true,
    }),
});

const CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS: Readonly<Record<string, VideoGenerationParameterContract>> = {
    "video/grok/image-to-video": civitaiGrokParameters("video/grok/image-to-video", true),
    "video/grok/text-to-video": civitaiGrokParameters("video/grok/text-to-video", false),
    "video/happyhorse/v1.1/imagetovideo": civitaiHappyHorseParameters("video/happyHorse/v1.1/imageToVideo", "i2v"),
    "video/happyhorse/v1.1/referencetovideo": civitaiHappyHorseParameters("video/happyHorse/v1.1/referenceToVideo", "r2v"),
    "video/happyhorse/v1.1/texttovideo": civitaiHappyHorseParameters("video/happyHorse/v1.1/textToVideo", "t2v"),
    "video/hunyuan": CIVITAI_HUNYUAN_PARAMETERS,
    "video/kling": CIVITAI_KLING_PARAMETERS,
    "video/kling-v3": CIVITAI_KLING_V3_PARAMETERS,
    "kling-v3": CIVITAI_KLING_V3_PARAMETERS,
    "video/ltx2.3/createvideo": civitaiLtx23Parameters("video/ltx2.3/createVideo", false),
    "video/ltx2.3/firstlastframetovideo": civitaiLtx23Parameters("video/ltx2.3/firstLastFrameToVideo", true),
    "video/minimax-h3": CIVITAI_MINIMAX_H3_PARAMETERS,
    "video/seedance": CIVITAI_SEEDANCE_PARAMETERS,
    "video/sora/image-to-video": civitaiSoraParameters("video/sora/image-to-video"),
    "video/sora/text-to-video": civitaiSoraParameters("video/sora/text-to-video"),
    "video/vidu": CIVITAI_VIDU_PARAMETERS,
    "video/vidu-q3": CIVITAI_VIDU_Q3_PARAMETERS,
    "video/wan/v2.1/civitai": CIVITAI_WAN21_PARAMETERS,
    "video/wan/v2.2-5b/fal/image-to-video": CIVITAI_WAN225B_I2V_PARAMETERS,
    "video/wan/v2.2/fal/image-to-video": CIVITAI_WAN22_I2V_PARAMETERS,
    "video/wan/v2.5/fal/image-to-video": CIVITAI_WAN25_I2V_PARAMETERS,
    "video/wan/v2.6/fal/reference-to-video": CIVITAI_WAN26_R2V_PARAMETERS,
    "video/wan/v2.7/fal/image-to-video": CIVITAI_WAN27_I2V_PARAMETERS,
    "video/wan/v2.7/fal/reference-to-video": CIVITAI_WAN27_R2V_PARAMETERS,
};

function civitaiVideoGenerationParameterContract(model: string) {
    const raw = String(model || "").trim().toLowerCase();
    const direct = CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS[raw];
    if (direct) return direct;
    if (raw === "ltx2.3" || raw === "ltx2-3") return CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS["video/ltx2.3/createvideo"];
    if (raw === "hunyuan" || raw === "hunyuanvideo") return CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS["video/hunyuan"];
    return undefined;
}

export const CIVITAI_VIDEO_GENERATION_PARAMETER_SERVICE_IDS = Object.freeze(Object.keys(CIVITAI_VIDEO_GENERATION_PARAMETER_CONTRACTS));

const UNKNOWN_VIDEO_GENERATION_PARAMETERS = makeVideoGenerationParameterContract(
    "unknown:video-generation-parameters",
    ["No exact provider + model/service generation schema matched"],
    "unpublished",
    {},
);

export function isVideoCapabilityProfileId(value: unknown): value is VideoCapabilityProfileId {
    return typeof value === "string" && value in VIDEO_CAPABILITY_PROFILES;
}

export function normalizeVideoCapabilityProfiles(value: unknown): Record<string, VideoCapabilityProfileId> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const normalized: Record<string, VideoCapabilityProfileId> = {};
    for (const [rawModel, profile] of Object.entries(value as Record<string, unknown>)) {
        const model = String(rawModel || "").trim();
        if (model && isVideoCapabilityProfileId(profile)) normalized[model] = profile;
    }
    return Object.keys(normalized).length ? normalized : undefined;
}

export function nativeVideoAdapterType(provider?: VideoCapabilityProvider) {
    if (!provider) return "";
    const explicit = String(provider.adapterType || "").trim().toLowerCase();
    if (explicit === "ark-plan") return "ark";
    if (explicit === "civitai") return "civitai-orchestration";
    if (explicit === "fal") return "fal";
    if (explicit) return explicit === "agnes" || explicit === "dashscope" || explicit === "ark" || explicit === "civitai-orchestration" ? explicit : "";
    const baseUrl = String(provider.baseUrl || "").trim();
    try {
        const host = new URL(baseUrl).hostname.toLowerCase();
        if (host === "agnes-ai.com" || host.endsWith(".agnes-ai.com")) return "agnes";
        if (host === "dashscope.aliyuncs.com" || host.endsWith(".dashscope.aliyuncs.com") || host.endsWith(".maas.aliyuncs.com")) return "dashscope";
        if (host === "ark.cn-beijing.volces.com" || host.endsWith(".volces.com")) return "ark";
        if (host === "fal.run" || host.endsWith(".fal.run")) return "fal";
    } catch {
        return "";
    }
    return "";
}

/**
 * Resolve the adapter whose wire serializer may be used by a story placeholder.
 * Unknown local relays must not inherit the customer endpoint or another
 * provider's schema merely because they expose a video model.
 */
export function nativeVideoSubmissionAdapterType(provider: VideoCapabilityProvider | undefined, model: string) {
    const native = nativeVideoAdapterType(provider);
    if (native) return native;
    const explicit = String(provider?.adapterType || "").trim().toLowerCase();
    const capability = resolveVideoModelCapability({ model, provider });
    if (explicit === "openai") return capability.id === "openai-video" ? "openai" : "";
    if ((explicit === "xai-imagine" || explicit === "xai") && capability.id === "xai-imagine-video") {
        return "xai-imagine";
    }
    return "";
}

export function videoCapabilityProfileCompatibility(
    provider: VideoCapabilityProvider | undefined,
    profileId: VideoCapabilityProfileId,
): { readonly compatible: boolean; readonly adapter: VideoCapabilityProfile["provider"] | ""; readonly reason: string } {
    const profile = VIDEO_CAPABILITY_PROFILES[profileId];
    const explicitAdapter = String(provider?.adapterType || "").trim().toLowerCase();
    const nativeAdapter = nativeVideoAdapterType(provider);
    const adapter: VideoCapabilityProfile["provider"] | "" =
        nativeAdapter === "civitai-orchestration"
            ? "civitai"
            : nativeAdapter === "agnes" || nativeAdapter === "dashscope" || nativeAdapter === "ark" || nativeAdapter === "fal"
              ? nativeAdapter
              : explicitAdapter === "openai" || (!explicitAdapter && !nativeAdapter)
                ? "openai"
                : "";
    if (adapter === profile.provider) return { compatible: true, adapter, reason: "" };
    // xai-imagine is the native Imagine serializer. The profile still records
    // provider="openai" because the HTTP path is OpenAI-compatible; that must
    // not fail-closed against the xAI adapter that actually owns this template.
    if (
      profileId === "xai-imagine-video" &&
      (explicitAdapter === "xai-imagine" || explicitAdapter === "xai")
    ) {
      return { compatible: true, adapter: "openai", reason: "" };
    }
    const selected = adapter || explicitAdapter || "OpenAI-compatible";
    return {
        compatible: false,
        adapter,
        reason: `能力模板 ${profile.label} 使用 ${profile.provider} wire 协议，与当前 ${selected} adapter 不兼容`,
    };
}

export function assertConfiguredVideoCapabilityProfileCompatibility(
    provider: VideoCapabilityProvider | undefined,
    model: string,
) {
    const configuredProfile = configuredVideoProfile(provider?.videoCapabilityProfiles, String(model || "").trim());
    if (!configuredProfile) return;
    const compatibility = videoCapabilityProfileCompatibility(provider, configuredProfile);
    if (!compatibility.compatible) {
        console.warn(`${compatibility.reason}；尝试继续以当前配置提交视频请求`);
    }
}

export function resolveVideoModelCapability(options: { model: string; provider?: VideoCapabilityProvider }): ResolvedVideoModelCapability {
    const model = String(options.model || "").trim();
    const provider = options.provider;
    const configuredProfile = configuredVideoProfile(provider?.videoCapabilityProfiles, model);
    if (configuredProfile) return resolvedProfile(configuredProfile, model, provider, true);

    const adapter = nativeVideoAdapterType(provider);
    if (adapter === "agnes") {
        return resolvedProfile(isExactAgnesVideoModel(model) ? "agnes-video-v2" : "agnes-unknown", model, provider, false);
    }
    if (adapter === "dashscope") return resolvedProfile(dashscopeProfileForModel(model), model, provider, false);
    if (adapter === "ark") return resolvedProfile(arkProfileForModel(model), model, provider, false);
    if (adapter === "civitai-orchestration") return resolvedCivitaiProfile(model, provider);
    if (adapter === "fal") return resolvedProfile(falProfileForModel(model), model, provider, false);

    const explicitAdapter = String(provider?.adapterType || "").trim().toLowerCase();
    // Model ids are not provider identities. A provider-less preview remains
    // unknown until routing supplies an adapter, recognized native host, or an
    // explicit per-model capability profile.
    if (explicitAdapter === "openai" && isExactOpenAiVideoModel(model)) {
        return resolvedProfile("openai-video", model, provider, false);
    }
    if ((explicitAdapter === "xai-imagine" || explicitAdapter === "xai") && isExactXaiImagineVideoModel(model)) {
        return resolvedProfile("xai-imagine-video", model, provider, false);
    }
    return resolvedProfile("openai-unknown", model, provider, false);
}

function videoParameterOptionLabel(
    name: VideoGenerationParameterName,
    field: VideoGenerationParameterFieldContract,
    value: string | number | boolean,
): string {
    // Ark Seedance 2.0 duration -1 表示智能时长
    if (name === "duration" && value === -1 && field.description.includes("-1 表示智能时长")) {
        return "智能时长";
    }
    return String(value);
}

export function describeVideoGenerationParameters(capability: ResolvedVideoModelCapability): readonly VideoGenerationParameterDescriptor[] {
    return VIDEO_GENERATION_PARAMETER_NAMES.map((name) => {
        const field = capability.generationParameters[name];
        return {
            ...field,
            name,
            label: VIDEO_GENERATION_PARAMETER_LABELS[name],
            options: (field.enumValues || []).map((value) => ({ value, label: videoParameterOptionLabel(name, field, value) })),
        };
    });
}

export function videoGenerationParameterOptions(
    capability: ResolvedVideoModelCapability,
    name: VideoGenerationParameterName,
): readonly { value: string | number | boolean; label: string }[] {
    const field = capability.generationParameters[name];
    return (field.enumValues || []).map((value) => ({ value, label: videoParameterOptionLabel(name, field, value) }));
}

export function formatVideoGenerationParameterCapability(capability: ResolvedVideoModelCapability) {
    const supported = VIDEO_GENERATION_PARAMETER_NAMES
        .filter((name) => capability.generationParameters[name].status === "supported")
        .map((name) => VIDEO_GENERATION_PARAMETER_LABELS[name]);
    const unresolved = VIDEO_GENERATION_PARAMETER_NAMES
        .filter((name) => capability.generationParameters[name].status === "unpublished" || capability.generationParameters[name].status === "conflict")
        .map((name) => VIDEO_GENERATION_PARAMETER_LABELS[name]);
    return `生成参数：${supported.length ? supported.join("、") : "无已验证可配置字段"}${unresolved.length ? ` · 未验证/冲突：${unresolved.join("、")}` : ""}`;
}

/**
 * Strict validation only: this function never clamps, rounds, swaps dimensions, or substitutes an enum value.
 * It throws on the first invalid or unpublished non-empty parameter and returns the original object on success.
 */
export function validateVideoGenerationParameters<T extends VideoGenerationParameters>(
    capability: ResolvedVideoModelCapability,
    parameters: T,
    context: VideoGenerationParameterValidationContext = {},
): T {
    const knownNames = new Set<string>(VIDEO_GENERATION_PARAMETER_NAMES);
    for (const [rawName, value] of Object.entries(parameters as Record<string, unknown>)) {
        if (!isProvidedVideoGenerationValue(value)) continue;
        if (!knownNames.has(rawName)) {
            throwVideoGenerationParameterError(capability, rawName, "未注册的视频生成参数；不会透传未知字段");
        }
        const name = rawName as VideoGenerationParameterName;
        const field = capability.generationParameters[name];
        if (field.status !== "supported") {
            const statusLabel = field.status === "unsupported" ? "不支持" : field.status === "conflict" ? "官方合同冲突" : "官方合同未公布";
            throwVideoGenerationParameterError(capability, name, `${statusLabel}：${field.description}`);
        }
        validateVideoGenerationParameterValue(capability, name, value, field);
    }

    const duration = parameters.duration;
    if (isProvidedVideoGenerationValue(duration) && context.hasReferenceVideo && capability.generationParameters.durationMaximumWhenReferenceVideo !== undefined) {
        const maximum = capability.generationParameters.durationMaximumWhenReferenceVideo;
        if (typeof duration !== "number" || duration > maximum) {
            throwVideoGenerationParameterError(capability, "duration", `包含参考视频时最大为 ${maximum} 秒；不会自动截短`);
        }
    }

    if (isProvidedVideoGenerationValue(duration) && capability.generationParameters.duration.derivedFrom?.includes("frames")) {
        const frames = parameters.frames;
        const fps = parameters.fps;
        if (typeof duration !== "number" || typeof frames !== "number" || typeof fps !== "number") {
            throwVideoGenerationParameterError(capability, "duration", "该 provider 没有原生秒数字段；必须同时提供合法 frames 与 fps 才能验证 UI 秒数换算");
        }
        const officialSeconds = frames / fps;
        if (!Number.isFinite(officialSeconds) || Math.round(officialSeconds) !== duration) {
            throwVideoGenerationParameterError(capability, "duration", `num_frames/frame_rate=${officialSeconds}，不能显示为约 ${duration} 秒；不会自动改帧数或帧率`);
        }
    }
    return parameters;
}

function validateVideoGenerationParameterValue(
    capability: ResolvedVideoModelCapability,
    name: VideoGenerationParameterName,
    value: unknown,
    field: VideoGenerationParameterFieldContract,
) {
    let comparable: string | number | boolean = value as string | number | boolean;
    if (field.valueType === "dimensions") {
        comparable = canonicalVideoDimensions(value, capability, name);
    } else if (field.valueType === "integer" || field.valueType === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            throwVideoGenerationParameterError(capability, name, "必须是有限数字");
        }
        if ((field.valueType === "integer" || field.integer) && !Number.isInteger(value)) {
            throwVideoGenerationParameterError(capability, name, "必须是整数");
        }
    } else if (field.valueType === "string") {
        if (typeof value !== "string" || !value.trim()) throwVideoGenerationParameterError(capability, name, "必须是非空字符串");
        comparable = value;
        if (field.maxLength !== undefined && [...value].length > field.maxLength) {
            throwVideoGenerationParameterError(capability, name, `最长为 ${field.maxLength} 个字符；不会自动截断`);
        }
    } else if (field.valueType === "boolean") {
        if (typeof value !== "boolean") throwVideoGenerationParameterError(capability, name, "必须是布尔值");
    } else if (field.valueType === "string-array") {
        if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string" || !item.trim())) {
            throwVideoGenerationParameterError(capability, name, "必须是非空字符串数组");
        }
        return;
    }

    if (field.enumValues?.length && !field.enumValues.some((allowed) => Object.is(allowed, comparable))) {
        throwVideoGenerationParameterError(capability, name, `值 ${String(comparable)} 不在允许枚举中：${field.enumValues.join("、")}；不会自动替换`);
    }
    if (typeof comparable === "number") {
        if (field.minimum !== undefined && comparable < field.minimum) {
            throwVideoGenerationParameterError(capability, name, `最小值为 ${field.minimum}，当前为 ${comparable}；不会自动夹取`);
        }
        if (field.maximum !== undefined && comparable > field.maximum) {
            throwVideoGenerationParameterError(capability, name, `最大值为 ${field.maximum}，当前为 ${comparable}；不会自动夹取`);
        }
        if (field.offsetMultiple && (comparable - field.offsetMultiple.offset) % field.offsetMultiple.multiple !== 0) {
            throwVideoGenerationParameterError(capability, name, `必须满足 ${field.offsetMultiple.multiple}n+${field.offsetMultiple.offset}，当前为 ${comparable}`);
        }
    }
}

function canonicalVideoDimensions(value: unknown, capability: ResolvedVideoModelCapability, name: VideoGenerationParameterName) {
    let width: number;
    let height: number;
    if (typeof value === "string") {
        const match = /^(\d+)\s*[x×*]\s*(\d+)$/.exec(value.trim());
        if (!match) throwVideoGenerationParameterError(capability, name, "必须使用 width x height 格式");
        width = Number(match[1]);
        height = Number(match[2]);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
        width = Number((value as { width?: unknown }).width);
        height = Number((value as { height?: unknown }).height);
    } else {
        throwVideoGenerationParameterError(capability, name, "必须提供 width/height 对象或 width x height 字符串");
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throwVideoGenerationParameterError(capability, name, "width 和 height 必须是正整数");
    }
    return `${width}x${height}`;
}

function isProvidedVideoGenerationValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function throwVideoGenerationParameterError(capability: ResolvedVideoModelCapability, name: string, message: string): never {
    const label = VIDEO_GENERATION_PARAMETER_LABELS[name as VideoGenerationParameterName] || name;
    throw new Error(`${capability.providerLabel} / ${capability.model || "未命名模型"}：${label} ${message}`);
}

export function selectStoryVideoReferencesForCapability<
    T extends { useAs?: VideoReferenceUseAs | string },
>(
    capability: ResolvedVideoModelCapability,
    references: readonly T[] = [],
    options: { operation?: VideoReferenceSubmissionOperation; videos?: readonly { useAs?: VideoInputUseAs | string }[] } = {},
): { references: T[]; ignoredReferences: T[]; ignoredReasons: string[] } {
    const contract = resolveVideoReferenceSlotContract({
        capability,
        operation: options.operation,
        references,
        videos: options.videos,
    });
    return {
        references: contract.submitted,
        ignoredReferences: contract.notSubmitted.map((item) => item.reference),
        ignoredReasons: contract.notSubmitted.map((item) => item.reason),
    };
}

/**
 * Final story-video submission policy. Unsupported automatic story assets are
 * omitted from submission and are not wired onto video placeholders (canvas
 * wiring mirrors the real request), but unsupported manual inputs stop
 * submission so user-selected media is never dropped silently.
 */
export function prepareStoryVideoReferencesForSubmission<
    T extends { useAs?: VideoReferenceUseAs | string; referenceOrigin?: string },
>(
    capability: ResolvedVideoModelCapability,
    references: readonly T[] = [],
    options: { operation?: VideoReferenceSubmissionOperation; videos?: readonly { useAs?: VideoInputUseAs | string }[] } = {},
): { references: T[]; omittedAutomaticReferences: T[]; omittedReasons: string[] } {
    const selection = selectStoryVideoReferencesForCapability(capability, references, options);
    const blocking = selection.ignoredReferences.flatMap((reference, index) => (
        reference.referenceOrigin === "story_auto"
            ? []
            : [{ reason: selection.ignoredReasons[index] || "用途不支持或超过上限" }]
    ));
    if (blocking.length) {
        const reasons = Array.from(new Set(blocking.map((item) => item.reason))).join("；");
        throwReferenceError(
            capability,
            `${blocking.length} 张手工引用当前模型不会提交（${reasons}）；请调整用途、移除超限引用或切换模型，未发送 HTTP 请求`,
        );
    }
    const omittedAutomaticReferences = selection.ignoredReferences.filter(
        (reference) => reference.referenceOrigin === "story_auto",
    );
    const omittedReasons = selection.ignoredReferences.flatMap((reference, index) => (
        reference.referenceOrigin === "story_auto"
            ? [selection.ignoredReasons[index] || "用途不支持或超过上限"]
            : []
    ));
    return { references: selection.references, omittedAutomaticReferences, omittedReasons };
}

export function buildVideoReferenceIntent<T extends { useAs?: VideoReferenceUseAs | string; role?: VideoReferenceRole | string }>(
    capability: ResolvedVideoModelCapability,
    references: readonly T[] = [],
    options: { allowLoneLastFrame?: boolean } = {},
): VideoReferenceIntent<T> {
    const intent = buildVideoReferenceIntentForCapability(capability, references, options);
    if (capability.allowedReferenceIntentKinds && !capability.allowedReferenceIntentKinds.includes(intent.kind)) {
        throwReferenceError(capability, `精确 service 合同不接受 ${intent.kind} 媒体意图；不会把素材改解释为其他角色`);
    }
    return intent;
}

function buildVideoReferenceIntentForCapability<T extends { useAs?: VideoReferenceUseAs | string; role?: VideoReferenceRole | string }>(
    capability: ResolvedVideoModelCapability,
    references: readonly T[] = [],
    options: { allowLoneLastFrame?: boolean } = {},
): VideoReferenceIntent<T> {
    const items = [...references];
    if (!items.length) {
        if (capability.requiresFirstLastFrame) {
            throwReferenceError(capability, "该首尾帧视频操作要求同时提供 first_frame 和 last_frame；不会提交缺少时间端点的请求");
        }
        return { kind: "none" };
    }
    if (capability.requiresExplicitProfile) {
        throwReferenceError(capability, "检测到参考图，但该模型或 service id 的视频参考合同未知；请为该模型配置 videoCapabilityProfiles 后重试");
    }
    if (capability.intentPolicy === "blocked") {
        throwReferenceError(capability, capability.referenceContractBlockReason || "当前公开合同不足以安全提交参考图，已停止提交");
    }

    const firstFrames = items.filter((item) => item.useAs === "first_frame");
    const lastFrames = items.filter((item) => item.useAs === "last_frame");
    const keyframes = items.filter((item) => item.useAs === "keyframe");
    const ordinary = items.filter((item) => item.useAs !== "first_frame" && item.useAs !== "last_frame" && item.useAs !== "keyframe");
    if (firstFrames.length > 1) throwReferenceError(capability, "只允许 1 张显式首帧，不能同时提交多张 first_frame");
    if (lastFrames.length > 1) throwReferenceError(capability, "只允许 1 张显式尾帧，不能同时提交多张 last_frame");
    if (capability.requiresFirstLastFrame && (!firstFrames.length || !lastFrames.length)) {
        throwReferenceError(capability, "该首尾帧视频操作要求同时提供 first_frame 和 last_frame；不会把单图当作首尾帧请求");
    }
    if (lastFrames.length && !firstFrames.length && !options.allowLoneLastFrame) throwReferenceError(capability, "显式尾帧必须与显式首帧同时提交；不会按图片位置猜测首帧");

    const firstFrame = firstFrames[0];
    const lastFrame = lastFrames[0];
    if (lastFrame && !firstFrame && options.allowLoneLastFrame) {
        if (ordinary.length || keyframes.length) throwReferenceError(capability, "续写尾帧不能与普通参考图或中间关键帧混用");
        return { kind: "last_frame", lastFrame };
    }
    if (capability.intentPolicy === "keyframes") {
        if (ordinary.length) throwReferenceError(capability, unsupportedOrdinaryReferenceMessage(capability));
        if (lastFrame && !firstFrame && !keyframes.length) {
            throwReferenceError(capability, "尾帧前至少需要 1 张首帧或关键帧；不会把角色图猜成首帧");
        }
        const sequence = [firstFrame, ...keyframes, lastFrame].filter((item): item is T => Boolean(item));
        if (!sequence.length) return { kind: "none" };
        if (sequence.length === 1) return { kind: "first_frame", firstFrame: sequence[0] };
        assertKeyframeLimit(capability, sequence.length);
        return { kind: "keyframes", keyframes: sequence };
    }
    if (keyframes.length) {
        throwReferenceError(capability, "当前模型不支持中间关键帧；请改为首帧/尾帧，或切换支持多关键帧的模型");
    }
    if (capability.intentPolicy === "frames-or-reference-set") {
        if (lastFrame) {
            if (ordinary.length) throwReferenceError(capability, "帧模式与参考集模式必须二选一；当前合同未声明首尾帧与普通 reference images 的组合 operation");
            return { kind: "first_last_frame", firstFrame, lastFrame };
        }
        if (firstFrame && ordinary.length) {
            throwReferenceError(capability, "帧模式与参考集模式必须二选一；当前合同未声明首帧与普通 reference images 的组合 operation");
        }
        if (firstFrame) return { kind: "first_frame", firstFrame };
        return checkedReferenceSet(capability, ordinary);
    }

    if (capability.intentPolicy === "reference-set-with-frames") {
        if (ordinary.length) {
            assertReferenceSetLimit(capability, ordinary.length);
            if (firstFrame || lastFrame) {
                return {
                    kind: "reference_set_with_frames",
                    ...(firstFrame ? { firstFrame } : {}),
                    ...(lastFrame ? { lastFrame } : {}),
                    references: ordinary,
                };
            }
            return { kind: "reference_set", references: ordinary };
        }
        if (lastFrame) return { kind: "first_last_frame", firstFrame, lastFrame };
        if (firstFrame) return { kind: "first_frame", firstFrame };
        return checkedReferenceSet(capability, ordinary);
    }

    if (capability.intentPolicy === "r2v-with-first") {
        if (lastFrame) throwReferenceError(capability, "R2V 不支持尾帧；第 2 张角色/场景图不会被当作尾帧");
        if (firstFrame) {
            if (!ordinary.length) throwReferenceError(capability, "R2V 至少需要 1 张普通 reference_image；首帧只能作为附加约束");
            assertReferenceSetLimit(capability, ordinary.length);
            return { kind: "reference_set_with_first", firstFrame, references: ordinary };
        }
        return checkedReferenceSet(capability, ordinary);
    }

    if (capability.intentPolicy === "reference-set") {
        if (firstFrame || lastFrame) {
            throwReferenceError(capability, "当前参考数组合同没有声明首帧或尾帧角色，只接受普通 reference_image；不会把时序帧混入参考数组");
        }
        return checkedReferenceSet(capability, ordinary);
    }

    if (capability.intentPolicy === "single-frame" || capability.intentPolicy === "i2v") {
        if (lastFrame) {
            if (!capability.supportsFirstLastFrame) throwReferenceError(capability, "当前 I2V 合同不支持首尾帧，请移除 last_frame 或切换支持首尾帧的模型");
            if (ordinary.length) throwReferenceError(capability, unsupportedOrdinaryReferenceMessage(capability));
            return { kind: "first_last_frame", firstFrame, lastFrame };
        }
        if (firstFrame) {
            if (ordinary.length) throwReferenceError(capability, unsupportedOrdinaryReferenceMessage(capability));
            return { kind: "first_frame", firstFrame };
        }
        if (ordinary.length === 1) return { kind: "first_frame", firstFrame: ordinary[0] };
        throwReferenceError(capability, unsupportedOrdinaryReferenceMessage(capability));
    }

    throwReferenceError(capability, "当前模型不支持参考图，请移除参考图或配置正确的视频能力 profile");
}

export function buildVideoReferencePromptText<
    T extends { role?: VideoReferenceRole | string; label?: string; name?: string },
>(
    capability: ResolvedVideoModelCapability,
    prompt: string,
    intent: VideoReferenceIntent<T>,
) {
    if (capability.provider !== "ark" && capability.provider !== "dashscope") return prompt;
    const references = intent.kind === "reference_set" || intent.kind === "reference_set_with_first" || intent.kind === "reference_set_with_frames"
        ? intent.references
        : [];
    if (!references.length) return prompt;

    const isChinese = /[\u3400-\u9fff]/u.test(prompt);
    const mappings = references.map((reference, index) => {
        const token = capability.provider === "dashscope"
            ? `Image${isChinese ? "" : " "}${index + 1}`
            : `图片${index + 1}`;
        return `${token}=${videoReferenceRoleDescription(reference, isChinese)}`;
    });
    const firstFrameNote = (intent.kind === "reference_set_with_first" || intent.kind === "reference_set_with_frames") && intent.firstFrame
        ? isChinese ? "首帧已通过独立字段提供，不计入 Image 编号。" : "The first frame is supplied separately and is not part of the Image numbering."
        : "";
    const guidance = isChinese
        ? "请严格按编号使用这些素材；角色参考只约束身份、脸部、发型和服装，不作为首帧，也不要继承其背景或排版。"
        : "Use these assets strictly by number. A character reference constrains identity, face, hair, and wardrobe; it is not a first frame, and its background or layout must not be copied.";
    const heading = isChinese ? "参考素材语义绑定" : "Reference asset mapping";
    return `${heading}：${mappings.join(isChinese ? "；" : "; ")}。${firstFrameNote}${guidance}\n\n${prompt.trim()}`;
}

export function mapVideoReferenceIntent<T, U>(intent: VideoReferenceIntent<T>, mapper: (value: T) => U): VideoReferenceIntent<U> {
    if (intent.kind === "none") return intent;
    if (intent.kind === "last_frame") return { kind: intent.kind, lastFrame: mapper(intent.lastFrame) };
    if (intent.kind === "first_frame") return { kind: intent.kind, firstFrame: mapper(intent.firstFrame) };
    if (intent.kind === "first_last_frame") return { kind: intent.kind, firstFrame: mapper(intent.firstFrame), lastFrame: mapper(intent.lastFrame) };
    if (intent.kind === "keyframes") return { kind: intent.kind, keyframes: intent.keyframes.map(mapper) };
    if (intent.kind === "reference_set") return { kind: intent.kind, references: intent.references.map(mapper), ...(intent.softFirstFrame ? { softFirstFrame: true } : {}) };
    if (intent.kind === "reference_set_with_first") return { kind: intent.kind, firstFrame: mapper(intent.firstFrame), references: intent.references.map(mapper) };
    return {
        kind: intent.kind,
        ...(intent.firstFrame !== undefined ? { firstFrame: mapper(intent.firstFrame) } : {}),
        ...(intent.lastFrame !== undefined ? { lastFrame: mapper(intent.lastFrame) } : {}),
        references: intent.references.map(mapper),
    };
}

export function videoReferenceIntentItems<T>(intent: VideoReferenceIntent<T>): T[] {
    if (intent.kind === "none") return [];
    if (intent.kind === "last_frame") return [intent.lastFrame];
    if (intent.kind === "first_frame") return [intent.firstFrame];
    if (intent.kind === "first_last_frame") return [intent.firstFrame, intent.lastFrame];
    if (intent.kind === "keyframes") return intent.keyframes;
    if (intent.kind === "reference_set") return intent.references;
    if (intent.kind === "reference_set_with_first") return [intent.firstFrame, ...intent.references];
    return [
        ...(intent.firstFrame !== undefined ? [intent.firstFrame] : []),
        ...intent.references,
        ...(intent.lastFrame !== undefined ? [intent.lastFrame] : []),
    ];
}

export function serializeAgnesVideoReferences(intent: VideoReferenceIntent<string>) {
    if (intent.kind === "none") return {};
    if (intent.kind === "last_frame") throw new Error("Agnes 不接受缺少首帧的单独尾帧");
    if (intent.kind === "first_frame") return { image: intent.firstFrame };
    if (intent.kind === "first_last_frame") return { extra_body: { image: [intent.firstFrame, intent.lastFrame], mode: "keyframes" } };
    if (intent.kind === "keyframes") return { extra_body: { image: intent.keyframes, mode: "keyframes" } };
    throw new Error("Agnes 视频直接图片输入只支持单图或时序关键帧数组；官方未公布独立角色/场景语义参考字段，不能把 reference_set 冒充为关键帧");
}

export function serializeDashscopeVideoInput(
    capability: ResolvedVideoModelCapability,
    prompt: string,
    intent: VideoReferenceIntent<string>,
    references: { videos?: readonly (string | { url: string; useAs?: VideoInputUseAs })[]; voices?: readonly string[] } = {},
) {
    const input: Record<string, unknown> = { prompt };
    const videos = (references.videos || []).map((video) => typeof video === "string" ? { url: video } : { ...video });
    if (capability.id === "dashscope-wan30-video") {
        return serializeDashscopeWan30VideoInput(input, prompt, intent, videos, references.voices || []);
    }
    if (intent.kind === "none" && !["dashscope-wan27-r2v", "dashscope-wan27-i2v", "dashscope-wan27-video-edit", "dashscope-happyhorse-video-edit"].includes(capability.id)) return input;
    if (capability.id === "dashscope-wan27-i2v") {
        const firstClips = videos.filter((video) => video.useAs === "first_clip");
        const nonFirstClips = videos.filter((video) => video.useAs !== "first_clip");
        if (nonFirstClips.length) throw new Error("Wan2.7 I2V 的视频输入只有显式 first_clip 才表示续写；普通参考视频不会自动升级为续写");
        if (firstClips.length > 1) throw new Error("Wan2.7 I2V 续写只允许 1 个 first_clip");
        if (firstClips.length) {
            if (intent.kind !== "none" && intent.kind !== "last_frame") throw new Error("Wan2.7 I2V 续写只允许 first_clip 或 first_clip + last_frame");
            input.media = [
                { type: "first_clip", url: firstClips[0].url },
                ...(intent.kind === "last_frame" ? [{ type: "last_frame", url: intent.lastFrame }] : []),
            ];
            return input;
        }
        const media = intent.kind === "first_last_frame"
            ? [{ type: "first_frame", url: intent.firstFrame }, { type: "last_frame", url: intent.lastFrame }]
            : intent.kind === "first_frame"
              ? [{ type: "first_frame", url: intent.firstFrame }]
              : [];
        if (!media.length) throw new Error("Wan2.7 I2V 仅接受显式首帧或首尾帧 intent");
        input.media = media;
        return input;
    }
    if (capability.id === "dashscope-wan26-i2v") {
        if (intent.kind !== "first_frame") throw new Error("Wan2.6 I2V 仅接受单首帧 intent");
        input.img_url = intent.firstFrame;
        return input;
    }
    if (capability.id === "dashscope-wan-kf2v") {
        if (intent.kind !== "first_last_frame") throw new Error("Wan2.2 KF2V 要求同时提供首帧和尾帧 intent");
        input.first_frame_url = intent.firstFrame;
        input.last_frame_url = intent.lastFrame;
        return input;
    }
    if (capability.id === "dashscope-wan27-r2v") {
        if (intent.kind !== "none" && intent.kind !== "reference_set" && intent.kind !== "reference_set_with_first") throw new Error("Wan2.7 R2V 需要 reference_set intent");
        const images = intent.kind === "reference_set" || intent.kind === "reference_set_with_first" ? intent.references : [];
        const subjectMedia: Array<{ type: "reference_image" | "reference_video"; url: string; reference_voice?: string }> = [
            ...images.map((url) => ({ type: "reference_image" as const, url })),
            ...videos.map((video) => {
                if (video.useAs !== undefined && video.useAs !== "reference_video") throw new Error("Wan2.7 R2V 只接受普通 reference_video，不能接受 first_clip 或 source_video");
                return { type: "reference_video" as const, url: video.url };
            }),
        ];
        if (!subjectMedia.length) throw new Error("Wan2.7 R2V 至少需要 1 张参考图或 1 个参考视频");
        if (subjectMedia.length > 5) throw new Error("Wan2.7 R2V 的参考图片与参考视频合计最多 5 个");
        const voices = [...(references.voices || [])];
        if (voices.length > subjectMedia.length) throw new Error("Wan2.7 R2V 的参考音频数量不能超过参考图片与参考视频数量");
        voices.forEach((voice, index) => { subjectMedia[index].reference_voice = voice; });
        input.media = [
            ...(intent.kind === "reference_set_with_first" ? [{ type: "first_frame", url: intent.firstFrame }] : []),
            ...subjectMedia,
        ];
        return input;
    }
    if (capability.id === "dashscope-wan26-r2v") {
        if (intent.kind !== "reference_set") throw new Error("Wan2.6 R2V 需要 reference_set intent");
        const referenceVideos = videos.map((video) => {
            if (video.useAs !== undefined && video.useAs !== "reference_video") throw new Error("Wan2.6 R2V 只接受普通 reference_video，不能接受 first_clip 或 source_video");
            return video.url;
        });
        if (referenceVideos.length > 3) throw new Error(`Wan2.6 R2V 的参考视频最多 3 段，当前为 ${referenceVideos.length} 段`);
        if (intent.references.length > 5) throw new Error(`Wan2.6 R2V 的参考图片最多 5 张，当前为 ${intent.references.length} 张`);
        const referenceUrls = [...intent.references, ...referenceVideos];
        if (referenceUrls.length > 5) throw new Error(`Wan2.6 R2V 的参考图片与参考视频合计最多 5 个，当前为 ${referenceUrls.length} 个`);
        if (!referenceUrls.length) throw new Error("Wan2.6 R2V 至少需要 1 张参考图或 1 个参考视频");
        input.reference_urls = referenceUrls;
        return input;
    }
    if (capability.id === "dashscope-happyhorse-i2v") {
        if (intent.kind !== "first_frame") throw new Error("HappyHorse I2V 仅接受单首帧 intent");
        input.media = [{ type: "first_frame", url: intent.firstFrame }];
        return input;
    }
    if (capability.id === "dashscope-happyhorse-r2v") {
        if (intent.kind !== "reference_set") throw new Error("HappyHorse R2V 需要 reference_set intent");
        input.media = intent.references.map((url) => ({ type: "reference_image", url }));
        return input;
    }
    if (capability.id === "dashscope-wan27-video-edit" || capability.id === "dashscope-happyhorse-video-edit") {
        if (videos.length !== 1) throw new Error(`${capability.providerLabel}：要求恰好 1 个待编辑源视频，当前为 ${videos.length} 个`);
        if (videos[0].useAs !== undefined && videos[0].useAs !== "source_video") throw new Error(`${capability.providerLabel}：源视频必须标记为 source_video；仅字段缺失的旧画布唯一视频可兼容作为源视频`);
        if (intent.kind !== "none" && intent.kind !== "reference_set") throw new Error(`${capability.providerLabel}：只接受普通 reference_image，不接受首帧、尾帧或关键帧`);
        const images = intent.kind === "reference_set" ? intent.references : [];
        const maximum = capability.referenceImagePolicy.supported ? capability.referenceImagePolicy.max : 0;
        if (maximum !== null && images.length > maximum) throw new Error(`${capability.providerLabel}：最多接受 ${maximum} 张参考图，当前为 ${images.length} 张`);
        input.media = [
            { type: "video", url: videos[0].url },
            ...images.map((url) => ({ type: "reference_image", url })),
        ];
        return input;
    }
    throw new Error(`${capability.providerLabel} / ${capability.model || "未命名模型"}：当前 DashScope profile 不接受参考图`);
}

function serializeDashscopeWan30VideoInput(
    input: Record<string, unknown>,
    prompt: string,
    intent: VideoReferenceIntent<string>,
    videos: Array<{ url: string; useAs?: VideoInputUseAs }>,
    voices: readonly string[],
) {
    const frameIntent = intent.kind === "first_frame" || intent.kind === "first_last_frame";
    if (intent.kind === "last_frame") throw new Error("Wan 3.0 不接受缺少首帧的单独尾帧；官方 first_frame / last_frame 只用于图生视频");
    if (intent.kind === "keyframes") throw new Error("Wan 3.0 官方合同没有独立关键帧数组；请改用首帧、首尾帧或参考图");
    if (intent.kind === "reference_set_with_first" || intent.kind === "reference_set_with_frames") {
        throw new Error("Wan 3.0 的 first_frame / last_frame 与 reference_image / reference_video / reference_audio 互斥，不能组合提交");
    }
    if (frameIntent) {
        if (videos.length) throw new Error("Wan 3.0 图生视频不能同时提交 reference_video；帧与参考集必须二选一");
        if (voices.length) throw new Error("Wan 3.0 图生视频不能同时提交 reference_audio；帧与参考集必须二选一");
        input.media = intent.kind === "first_last_frame"
            ? [{ type: "first_frame", url: intent.firstFrame }, { type: "last_frame", url: intent.lastFrame }]
            : [{ type: "first_frame", url: intent.firstFrame }];
        return input;
    }
    if (intent.kind !== "none" && intent.kind !== "reference_set") {
        throw new Error("Wan 3.0 只接受文生视频、首帧/首尾帧图生视频，或 reference_image / reference_video / reference_audio 参考集");
    }
    const images = intent.kind === "reference_set" ? intent.references : [];
    if (images.length > 10) throw new Error(`Wan 3.0 参考图最多 10 张，当前为 ${images.length} 张`);
    const referenceVideos = videos.map((video) => {
        if (video.useAs !== undefined && video.useAs !== "reference_video") {
            throw new Error("Wan 3.0 只接受普通 reference_video，不能接受 first_clip 或 source_video");
        }
        return video.url;
    });
    if (referenceVideos.length > 5) throw new Error(`Wan 3.0 参考视频最多 5 段，当前为 ${referenceVideos.length} 段`);
    if (voices.length > 5) throw new Error(`Wan 3.0 参考音频最多 5 段，当前为 ${voices.length} 段`);
    const media = [
        ...images.map((url) => ({ type: "reference_image" as const, url })),
        ...referenceVideos.map((url) => ({ type: "reference_video" as const, url })),
        ...voices.map((url) => ({ type: "reference_audio" as const, url })),
    ];
    if (!String(prompt || "").trim() && !media.length) {
        throw new Error("Wan 3.0 的 prompt 与 media 必填其一");
    }
    if (media.length) input.media = media;
    return input;
}

export function serializeSeedanceImageContent(
    intent: VideoReferenceIntent<string>,
    references: { videos?: readonly (string | { url: string; useAs?: VideoInputUseAs })[] } = {},
) {
    const videos = (references.videos || []).map((video) => typeof video === "string" ? { url: video } : { ...video });
    if (videos.length > 3) throw new Error(`Seedance 参考视频最多 3 段，当前为 ${videos.length} 段；不会自动截断`);
    const videoItems = videos.map((video) => {
        if (video.useAs !== undefined && video.useAs !== "reference_video") throw new Error("Seedance 参考视频只接受普通 reference_video 用途，不能接受 first_clip 或 source_video");
        return { type: "video_url", video_url: { url: video.url }, role: "reference_video" };
    });
    if (intent.kind === "none") return videoItems;
    if (intent.kind === "last_frame") throw new Error("Seedance 不接受缺少首帧的单独尾帧 intent");
    if (intent.kind === "first_frame") return [{ type: "image_url", image_url: { url: intent.firstFrame }, role: "first_frame" }, ...videoItems];
    if (intent.kind === "first_last_frame") {
        return [
            { type: "image_url", image_url: { url: intent.firstFrame }, role: "first_frame" },
            { type: "image_url", image_url: { url: intent.lastFrame }, role: "last_frame" },
            ...videoItems,
        ];
    }
    if (intent.kind === "keyframes") throw new Error("Seedance 当前合同不接受 Agnes 多关键帧 intent");
    if (intent.kind === "reference_set") return [...intent.references.map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" })), ...videoItems];
    if (intent.kind === "reference_set_with_frames") throw new Error("Ark Seedance 当前公开合同不接受已分区的首尾帧加普通参考图 intent");
    return [
        { type: "image_url", image_url: { url: intent.firstFrame }, role: "first_frame" },
        ...intent.references.map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" })),
        ...videoItems,
    ];
}

export function formatVideoReferenceCapability(capability: ResolvedVideoModelCapability) {
    if (capability.requiresExplicitProfile) return `参考图能力：${capability.model || "当前 Endpoint"} 尚未配置 profile（有参考图时将拒绝提交）`;
    if (capability.intentPolicy === "blocked") return `参考图能力：${capability.referenceContractBlockReason || "当前公开合同未验证，参考图将拒绝提交"}`;
    if (capability.provider === "agnes") {
        const keyframeRange = typeof capability.keyframeImageLimit === "number"
            ? capability.keyframeImageMinimum === capability.keyframeImageLimit
              ? `恰好 ${capability.keyframeImageLimit} 张，实测当前服务端`
              : `${capability.keyframeImageMinimum || 1}–${capability.keyframeImageLimit} 张，实测当前服务端`
            : "官方未公布数组上限";
        return `参考图能力：单图 I2V 或有序多关键帧（${keyframeRange}）· 官方未公布独立角色/场景语义参考字段；角色卡须先合成镜头画面，不能冒充关键帧`;
    }
    const firstFrame = capability.supportsFirstFrame ? "支持" : capability.supportsReferenceSetWithFirst ? "可附加" : "不支持";
    const firstLast = capability.requiresFirstLastFrame ? "必须同时提供" : capability.supportsFirstLastFrame ? "支持" : "不支持";
    const keyframes = capability.supportsKeyframeSequence
        ? capability.keyframeImageLimit == null ? "支持（官方未公布上限）" : `最多 ${capability.keyframeImageLimit} 张`
        : "不支持";
    const referenceSet = capability.referenceImagePolicy.supported
        ? capability.referenceImagePolicy.max == null
            ? `支持（至少 ${capability.referenceImagePolicy.min} 张，官方未公布上限）`
            : capability.referenceImagePolicy.min === capability.referenceImagePolicy.max
              ? `${capability.referenceImagePolicy.max} 张`
              : `${capability.referenceImagePolicy.min}–${capability.referenceImagePolicy.max} 张`
        : "不支持";
    const mixed = capability.supportsReferenceSetWithFrames
        ? "支持首/尾帧与参考集分区组合"
        : capability.intentPolicy === "frames-or-reference-set"
          ? "帧与参考集二选一"
          : capability.supportsReferenceSetWithFirst
            ? "支持首帧 + 参考集"
            : "不支持帧与参考集组合";
    const videoInputs = capability.videoInputPolicy.supported
        ? capability.videoInputPolicy.max === null
          ? `至少 ${capability.videoInputPolicy.min} 个（官方未公布上限；${capability.videoInputPolicy.uses.join(" / ")}）`
          : `${capability.videoInputPolicy.min === capability.videoInputPolicy.max ? `恰好 ${capability.videoInputPolicy.min}` : `${capability.videoInputPolicy.min}–${capability.videoInputPolicy.max}`} 个（${capability.videoInputPolicy.uses.join(" / ")}）`
        : "不支持";
    return `参考图能力：首帧 ${firstFrame} · 首尾帧 ${firstLast} · 多关键帧 ${keyframes} · 语义多参考 ${referenceSet} · ${mixed}；视频槽：${videoInputs}`;
}

function configuredVideoProfile(profiles: VideoCapabilityProvider["videoCapabilityProfiles"], model: string) {
    if (!profiles) return undefined;
    const exact = profiles[model];
    if (isVideoCapabilityProfileId(exact)) return exact;
    const matchKey = normalizeModelKey(model);
    const match = Object.entries(profiles).find(([key]) => normalizeModelKey(key) === matchKey)?.[1];
    return isVideoCapabilityProfileId(match) ? match : undefined;
}

function dashscopeProfileForModel(model: string): VideoCapabilityProfileId {
    const value = normalizeModelKey(model);
    if (value === "wan3-0-video" || value === "wan3-0-video-prime") return "dashscope-wan30-video";
    if (value === "happyhorse-1-0-video-edit") return "dashscope-happyhorse-video-edit";
    if (value === "happyhorse-1-0-i2v" || value === "happyhorse-1-1-i2v") return "dashscope-happyhorse-i2v";
    if (value === "happyhorse-1-0-r2v" || value === "happyhorse-1-1-r2v") return "dashscope-happyhorse-r2v";
    if (value === "happyhorse-1-0-t2v" || value === "happyhorse-1-1-t2v") return "dashscope-t2v";
    if (value === "wan2-7-videoedit") return "dashscope-wan27-video-edit";
    if (value === "wan2-7-r2v" || value === "wan2-7-r2v-2026-06-12") return "dashscope-wan27-r2v";
    if (value === "wan2-6-r2v" || value === "wan2-6-r2v-flash") return "dashscope-wan26-r2v";
    if (value === "wan2-2-kf2v-flash") return "dashscope-wan-kf2v";
    if (value === "wan2-7-i2v" || value === "wan2-7-i2v-2026-04-25") return "dashscope-wan27-i2v";
    if (value === "wan2-6-i2v" || value === "wan2-6-i2v-flash" || value === "wan2-6-i2v-us") return "dashscope-wan26-i2v";
    if (value === "wan2-5-i2v-preview") return "dashscope-wan26-i2v";
    if (value === "wan2-5-t2v-preview") return "dashscope-t2v";
    if (value === "wan2-7-t2v" || value === "wan2-7-t2v-2026-06-12" || value === "wan2-7-t2v-2026-04-25" || value === "wan2-6-t2v" || value === "wan2-6-t2v-us") return "dashscope-t2v";
    return "dashscope-unknown";
}

function isExactAgnesVideoModel(model: string) {
    const key = normalizeModelKey(model);
    return key === "agnes-video-v2-0" || key === "agnes-video-2-5-flash" || key === "agnes-video-2-5";
}

function isExactOpenAiVideoModel(model: string) {
    return OPENAI_VIDEO_MODEL_KEYS.has(normalizeModelKey(model));
}

function isXaiImagineVideo15Model(model: string) {
    const normalized = normalizeModelKey(model);
    return normalized === "grok-imagine-video-1-5" || normalized === "grok-imagine-video-1-5-preview";
}

function isExactXaiImagineVideoModel(model: string) {
    return isXaiImagineVideo15Model(model) || normalizeModelKey(model) === "grok-imagine-video";
}

const OPENAI_VIDEO_MODEL_KEYS = new Set([
    "sora-2",
    "sora-2-pro",
    "sora-2-2025-10-06",
    "sora-2-pro-2025-10-06",
    "sora-2-2025-12-08",
]);

function arkProfileForModel(model: string): VideoCapabilityProfileId {
    const value = normalizeModelKey(model);
    if (value === "doubao-seedance-2-0-260128") return "ark-seedance-2";
    if (value === "doubao-seedance-2-0-fast-260128") return "ark-seedance-2-fast";
    if (value === "doubao-seedance-2-0-mini-260615") return "ark-seedance-2-mini";
    if (!value.includes("seedance")) return "ark-unknown";
    if (value.includes("seedance-1-0-pro-fast")) return "ark-seedance-1-0-pro-fast";
    if (value.includes("seedance-1-0") || value.includes("seedance-1-5") || value.includes("seedance-1-")) return "ark-seedance-legacy";
    return "ark-unknown";
}

function falProfileForModel(model: string): VideoCapabilityProfileId {
    const value = normalizeModelKey(model);
    if (value === "kling-3-pro" || value === "fal-ai-kling-video-v3-pro") return "fal-kling3-pro";
    if (value === "kling-3-standard" || value === "fal-ai-kling-video-v3-standard") return "fal-kling3-standard";
    if (value === "kling-3-turbo-pro" || value === "fal-ai-kling-video-v3-turbo-pro") return "fal-kling3-turbo-pro";
    if (value === "kling-3-turbo" || value === "fal-ai-kling-video-v3-turbo" || value === "fal-ai-kling-video-v3-turbo-standard") return "fal-kling3-turbo";
    if (value === "hailuo-2-3" || value.includes("hailuo-2-3")) return "fal-hailuo-2-3";
    if (value === "veo-3-1" || value === "fal-ai-veo3-1") return "fal-veo-3-1";
    if (value === "wan-pro" || value === "fal-ai-wan-pro") return "fal-wan-pro";
    if (value === "minimax-h3" || value.includes("hailuo-03")) return "fal-minimax-h3";
    return "fal-unknown";
}

function civitaiProfileForModel(model: string): VideoCapabilityProfileId {
    const shortModel = String(model || "").trim().toLowerCase();
    if (shortModel === "kling-v3") return "civitai-frames-or-references";
    if (shortModel === "ltx2.3" || shortModel === "ltx2-3") return "civitai-first-last";
    if (shortModel === "hunyuan") return "civitai-text-video";
    return resolveCivitaiVideoMediaContract(model)?.profileId ?? "civitai-unknown";
}

function resolvedCivitaiProfile(model: string, provider: VideoCapabilityProvider | undefined): ResolvedVideoModelCapability {
    const contract = resolveCivitaiVideoMediaContract(model);
    const resolved = resolvedProfile(contract?.profileId ?? civitaiProfileForModel(model), model, provider, false);
    if (!contract) return resolved;
    return {
        ...resolved,
        ...(resolved.referenceImagePolicy.supported
            ? { referenceImagePolicy: { ...resolved.referenceImagePolicy, max: contract.imageMaximum } }
            : {}),
        allowedReferenceIntentKinds: contract.referenceKinds,
        ...(contract.acceptsReferenceVideos
            ? { videoInputPolicy: { supported: true as const, min: contract.videoMinimum, max: contract.videoMaximum, uses: ["reference_video"] as const } }
            : {}),
        ...(contract.sharedImageVideoMaximum !== undefined ? { sharedImageVideoMaximum: contract.sharedImageVideoMaximum } : {}),
        ...(contract.storyAutoReferencePolicy ? { storyAutoReferencePolicy: contract.storyAutoReferencePolicy } : {}),
    };
}

function resolvedProfile(id: VideoCapabilityProfileId, model: string, provider: VideoCapabilityProvider | undefined, profileConfigured: boolean): ResolvedVideoModelCapability {
    const profile = VIDEO_CAPABILITY_PROFILES[id];
    const capability = {
        ...profile,
        model,
        providerLabel: String(provider?.displayName || provider?.name || "").trim() || profile.label,
        profileConfigured,
        generationParameters: id === "xai-imagine-video"
            ? (isXaiImagineVideo15Model(model) ? XAI_IMAGINE_VIDEO_15_GENERATION_PARAMETERS : XAI_IMAGINE_VIDEO_GENERATION_PARAMETERS)
            : videoGenerationParametersForModel(profile.provider, model),
    };
    if (capability.id !== "xai-imagine-video" || isOfficialXaiProvider(provider)) return capability;
    // The official profile is intentionally strict. Existing xAI-compatible
    // relays expose a legacy first/last-frame wire, so keep that route-specific
    // capability without weakening the api.x.ai contract.
    return {
        ...capability,
        generationParameters: XAI_RELAY_VIDEO_GENERATION_PARAMETERS,
        supportsFirstLastFrame: true,
        referenceImagePolicy: { supported: true, min: 1, max: 5 },
        supportsReferenceSetWithFirst: true,
        supportsReferenceSetWithFrames: true,
        supportedOperations: ["text-to-video", "image-to-video", "first-last-frame-to-video", "reference-to-video"],
    };
}

function isOfficialXaiProvider(provider: VideoCapabilityProvider | undefined) {
    const baseUrl = String(provider?.baseUrl || "").trim();
    try {
        return new URL(baseUrl).hostname.toLowerCase() === "api.x.ai";
    } catch {
        return false;
    }
}

function videoGenerationParametersForModel(provider: VideoCapabilityProfile["provider"], model: string): VideoGenerationParameterContract {
    const normalized = normalizeModelKey(model);
    if (provider === "agnes") {
        return normalized === "agnes-video-v2-0" || normalized === "agnes-video-2-5-flash" || normalized === "agnes-video-2-5"
            ? AGNES_VIDEO_GENERATION_PARAMETERS
            : unknownGenerationParameters("agnes", model);
    }
    if (provider === "openai") {
        return OPENAI_VIDEO_MODEL_KEYS.has(normalized) ? OPENAI_VIDEO_GENERATION_PARAMETERS : unknownGenerationParameters("openai", model);
    }
    if (provider === "ark") {
        if (normalized === "doubao-seedance-2-0-260128") return ARK_SEEDANCE_2_STANDARD_PARAMETERS;
        if (normalized === "doubao-seedance-2-0-fast-260128") return ARK_SEEDANCE_2_FAST_PARAMETERS;
        if (normalized === "doubao-seedance-2-0-mini-260615") return ARK_SEEDANCE_2_MINI_PARAMETERS;
        return ARK_UNPUBLISHED_GENERATION_PARAMETERS;
    }
    if (provider === "civitai") {
        return civitaiVideoGenerationParameterContract(model)
            || unknownGenerationParameters("civitai", model);
    }
    if (provider === "dashscope") {
        if (normalized === "wan3-0-video" || normalized === "wan3-0-video-prime") return DASHSCOPE_WAN30_VIDEO_PARAMETERS;
        if (normalized === "wan2-7-videoedit") return DASHSCOPE_WAN27_VIDEO_EDIT_PARAMETERS;
        if (normalized === "happyhorse-1-0-video-edit") return DASHSCOPE_HAPPYHORSE_VIDEO_EDIT_PARAMETERS;
        if (normalized === "wan2-7-i2v" || normalized === "wan2-7-i2v-2026-04-25") return DASHSCOPE_WAN27_I2V_PARAMETERS;
        if (normalized === "wan2-7-r2v" || normalized === "wan2-7-r2v-2026-06-12") return DASHSCOPE_WAN27_R2V_PARAMETERS;
        if (normalized === "wan2-7-t2v" || normalized === "wan2-7-t2v-2026-06-12") return DASHSCOPE_WAN27_T2V_PARAMETERS;
        if (normalized === "wan2-6-i2v") return dashscopeWan26I2vGenerationParameters("dashscope:wan2.6-i2v", false);
        if (normalized === "wan2-6-i2v-flash") return dashscopeWan26I2vGenerationParameters("dashscope:wan2.6-i2v-flash", true);
        if (normalized === "wan2-6-i2v-us") return dashscopeWan26I2vGenerationParameters("dashscope:wan2.6-i2v-us", false);
        if (normalized === "wan2-6-r2v") return dashscopeWan26R2vGenerationParameters(false);
        if (normalized === "wan2-6-r2v-flash") return dashscopeWan26R2vGenerationParameters(true);
        if (normalized === "wan2-6-t2v") return dashscopeWan26T2vGenerationParameters(false);
        if (normalized === "wan2-6-t2v-us") return dashscopeWan26T2vGenerationParameters(true);
        if (normalized === "wan2-5-t2v-preview") return DASHSCOPE_WAN25_T2V_PREVIEW_PARAMETERS;
        if (normalized === "wan2-5-i2v-preview") return DASHSCOPE_WAN25_I2V_PREVIEW_PARAMETERS;
        if (normalized === "wan2-2-kf2v-flash") return DASHSCOPE_WAN_KF2V_PARAMETERS;
        if (normalized === "happyhorse-1-0-t2v") return DASHSCOPE_HAPPYHORSE_10_T2V_PARAMETERS;
        if (normalized === "happyhorse-1-0-i2v") return DASHSCOPE_HAPPYHORSE_10_I2V_PARAMETERS;
        if (normalized === "happyhorse-1-0-r2v") return DASHSCOPE_HAPPYHORSE_10_R2V_PARAMETERS;
        if (normalized === "happyhorse-1-1-i2v") return DASHSCOPE_HAPPYHORSE_I2V_PARAMETERS;
        if (normalized === "happyhorse-1-1-r2v") return DASHSCOPE_HAPPYHORSE_R2V_PARAMETERS;
        if (normalized === "happyhorse-1-1-t2v") return DASHSCOPE_HAPPYHORSE_T2V_PARAMETERS;
        return unknownGenerationParameters("dashscope", model);
    }
    if (provider === "fal") {
        if (normalized === "kling-3-pro" || normalized === "fal-ai-kling-video-v3-pro") return FAL_KLING3_PRO_PARAMETERS;
        if (normalized === "kling-3-standard" || normalized === "fal-ai-kling-video-v3-standard") return FAL_KLING3_PRO_PARAMETERS;
        if (normalized === "kling-3-turbo-pro" || normalized === "fal-ai-kling-video-v3-turbo-pro") return FAL_KLING3_TURBO_PARAMETERS;
        if (normalized === "kling-3-turbo" || normalized === "fal-ai-kling-video-v3-turbo" || normalized === "fal-ai-kling-video-v3-turbo-standard") return FAL_KLING3_TURBO_PARAMETERS;
        if (normalized === "veo-3-1" || normalized === "fal-ai-veo3-1") return FAL_VEO31_PARAMETERS;
        if (normalized.includes("hailuo-2-3")) return FAL_HAILUO23_PARAMETERS;
        if (normalized === "wan-pro" || normalized === "fal-ai-wan-pro") return FAL_WANPRO_PARAMETERS;
        if (normalized === "minimax-h3" || normalized.includes("hailuo-03")) return FAL_MINIMAX_H3_PARAMETERS;
        return unknownGenerationParameters("fal", model);
    }
    return UNKNOWN_VIDEO_GENERATION_PARAMETERS;
}

function unknownGenerationParameters(provider: string, model: string) {
    return {
        ...UNKNOWN_VIDEO_GENERATION_PARAMETERS,
        id: `unknown:${provider}:${String(model || "").trim() || "unnamed"}`,
    };
}

function checkedReferenceSet<T>(capability: ResolvedVideoModelCapability, references: T[]): VideoReferenceIntent<T> {
    assertReferenceSetLimit(capability, references.length);
    return { kind: "reference_set", references };
}

function assertReferenceSetLimit(capability: ResolvedVideoModelCapability, count: number) {
    const policy = capability.referenceImagePolicy;
    if (!policy.supported) throwReferenceError(capability, "不支持角色/场景/道具等普通多参考图");
    if (count < policy.min) {
        throwReferenceError(capability, `普通参考图至少 ${policy.min} 张，当前为 ${count} 张`);
    }
    if (policy.max !== null && count > policy.max) {
        throwReferenceError(capability, `普通参考图最多 ${policy.max} 张，当前为 ${count} 张；不会自动截断或丢弃图片`);
    }
}

function assertKeyframeLimit(capability: ResolvedVideoModelCapability, count: number) {
    if (!capability.supportsKeyframeSequence) throwReferenceError(capability, "不支持多关键帧");
    if (typeof capability.keyframeImageMinimum === "number" && count < capability.keyframeImageMinimum) {
        throwReferenceError(capability, `关键帧至少 ${capability.keyframeImageMinimum} 张，当前为 ${count} 张；不会提交不完整序列`);
    }
    if (typeof capability.keyframeImageLimit === "number" && count > capability.keyframeImageLimit) {
        throwReferenceError(capability, `关键帧最多 ${capability.keyframeImageLimit} 张，当前为 ${count} 张；不会自动截断`);
    }
}

function unsupportedOrdinaryReferenceMessage(capability: ResolvedVideoModelCapability) {
    if (capability.provider === "agnes") return "Agnes 直接图片输入支持单图或时序关键帧数组；官方未公布独立角色/场景语义参考字段。请把真实镜头画面标为关键帧，角色卡只用于上游分镜合成，且不会静默只取第 1 张";
    if (capability.provider === "openai") return "官方 Videos 合同只接受 1 个 input_reference；角色/场景多参考必须先合成完整画面，且不会静默只取第 1 张";
    return "I2V 不支持角色/场景/道具等普通参考图，请切换 R2V 模型；第 2 张图片不会被当作尾帧";
}

function videoReferenceRoleDescription(
    reference: { role?: VideoReferenceRole | string; label?: string; name?: string },
    isChinese: boolean,
) {
    const rawName = String(reference.label || reference.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const named = rawName ? (isChinese ? `“${rawName}”` : `“${rawName}”`) : "";
    if (isChinese) {
        if (reference.role === "current_shot") return `当前分镜构图参考${named}`;
        if (reference.role === "upstream_frame") return `上游镜头构图参考${named}`;
        if (reference.role === "character") return `角色外观与服装参考${named}`;
        if (reference.role === "scene") return `场景环境参考${named}`;
        if (reference.role === "prop") return `道具外观参考${named}`;
        return `视觉参考${named}`;
    }
    if (reference.role === "current_shot") return `current storyboard composition ${named}`.trim();
    if (reference.role === "upstream_frame") return `upstream shot composition ${named}`.trim();
    if (reference.role === "character") return `character appearance and wardrobe ${named}`.trim();
    if (reference.role === "scene") return `scene and environment ${named}`.trim();
    if (reference.role === "prop") return `prop appearance ${named}`.trim();
    return `visual reference ${named}`.trim();
}

function throwReferenceError(capability: ResolvedVideoModelCapability, message: string): never {
    throw new Error(`${capability.providerLabel} / ${capability.model || "未命名模型"}：${message}`);
}

function normalizeModelKey(model: string) {
    return String(model || "")
        .trim()
        .toLowerCase()
        .replace(/[._]+/g, "-")
        .replace(/-+/g, "-");
}
