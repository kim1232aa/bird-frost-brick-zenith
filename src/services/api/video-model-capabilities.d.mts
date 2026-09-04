export const VIDEO_GENERATION_PARAMETER_NAMES: readonly [
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
];

export type VideoGenerationParameterName = (typeof VIDEO_GENERATION_PARAMETER_NAMES)[number];
export type VideoGenerationDimensions = { width: number; height: number } | string;
export type VideoGenerationParameterValue = string | number | boolean | readonly string[] | VideoGenerationDimensions;
export type VideoGenerationParameters = Partial<Record<VideoGenerationParameterName, VideoGenerationParameterValue>>;

export type VideoGenerationParameterFieldContract = {
    status: "supported" | "unsupported" | "unpublished" | "conflict";
    description: string;
    valueType?: "integer" | "number" | "string" | "boolean" | "string-array" | "dimensions";
    transportName?: string;
    required?: boolean;
    enumValues?: readonly (string | number | boolean)[];
    minimum?: number;
    maximum?: number;
    integer?: boolean;
    defaultValue?: string | number | boolean;
    offsetMultiple?: { offset: number; multiple: number };
    derivedFrom?: readonly VideoGenerationParameterName[];
};

/** Runtime profile ids are intentionally opaque here; the TS registry remains their single typed source. */
export type VideoCapabilityProfileId = string;

export type VideoCapabilityProvider = {
    id?: string;
    name?: string;
    /** Local-only, duplicate-safe presentation name supplied by the configured provider list. */
    displayName?: string;
    baseUrl?: string;
    adapterType?: string;
    videoCapabilityProfiles?: Record<string, VideoCapabilityProfileId | string>;
};

export type VideoCapabilityProfile = {
    id: VideoCapabilityProfileId;
    provider: "agnes" | "dashscope" | "ark" | "civitai" | "openai";
    label: string;
    supportsFirstFrame: boolean;
    supportsFirstLastFrame: boolean;
    supportsKeyframeSequence?: boolean;
    keyframeImageMinimum?: number;
    keyframeImageLimit?: number | null;
    referenceImagePolicy: { supported: false } | { supported: true; min: number; max: number | null };
    videoInputPolicy: { supported: false } | { supported: true; min: number; max: number | null; uses: readonly ("reference_video" | "first_clip" | "source_video")[] };
    sharedImageVideoMaximum?: number | null;
    supportsReferenceSetWithFirst: boolean;
    supportsReferenceSetWithFrames?: boolean;
    storyAutoReferencePolicy?: "disabled" | "current-shot" | "semantic-references";
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
    intentPolicy: "single-frame" | "keyframes" | "i2v" | "r2v-with-first" | "reference-set" | "frames-or-reference-set" | "reference-set-with-frames" | "blocked" | "none";
};

export type ResolvedVideoModelCapability = VideoCapabilityProfile & {
    model: string;
    providerLabel: string;
    profileConfigured: boolean;
    generationParameters: Record<VideoGenerationParameterName, VideoGenerationParameterFieldContract> & {
        id?: string;
        durationMaximumWhenReferenceVideo?: number;
    };
};

export function nativeVideoAdapterType(provider?: VideoCapabilityProvider): string;
export function nativeVideoSubmissionAdapterType(provider: VideoCapabilityProvider | undefined, model: string): string;
export function videoCapabilityProfileCompatibility(
    provider: VideoCapabilityProvider | undefined,
    profileId: VideoCapabilityProfileId,
): { readonly compatible: boolean; readonly adapter: VideoCapabilityProfile["provider"] | ""; readonly reason: string };
export function assertConfiguredVideoCapabilityProfileCompatibility(
    provider: VideoCapabilityProvider | undefined,
    model: string,
): void;
export function resolveVideoModelCapability(options: {
    model: string;
    provider?: VideoCapabilityProvider;
}): ResolvedVideoModelCapability;

export function validateVideoGenerationParameters<T extends VideoGenerationParameters>(
    capability: ResolvedVideoModelCapability,
    parameters: T,
    context?: { hasReferenceVideo?: boolean },
): T;
