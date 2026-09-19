export type ImageOperation = "generate" | "edit" | "variation" | "responses-tool";

export type ImageProviderFamily =
    | "openai"
    | "agnes"
    | "dashscope"
    | "ark"
    | "sensenova"
    | "sensenova-miaohua"
    | "civitai"
    | "fal"
    | "custom";

export type StoryIdentityReferenceStrategy = "shot-angle" | "portrait-only";
export type StoryPromptConstraintStyle = "explicit-exclusions" | "positive-only";

export type ImageCapabilityEvidence = {
    readonly kind: "official-doc" | "official-openapi" | "live-openapi" | "live-api";
    readonly url: string;
    readonly note: string;
};

export type ImageAvailability =
    | { readonly state: "supported" }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageLifecycle = "active" | "deprecated" | "removed";

export type ImageOutputCountCapability =
    | {
        readonly state: "supported";
        readonly min: number;
        /** null means that the service documents multiple outputs but does not publish a maximum. */
        readonly max: number | null;
        /** Maximum sent in one provider request. Client fan-out always uses one output per request. */
        readonly perRequestMax: number | null;
        readonly transport: "native-batch" | "client-fanout";
        readonly note?: string;
    }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageReferenceCountCapability =
    | {
        readonly state: "supported";
        readonly min: number;
        /** null means that multiple references are documented but their maximum is unpublished. */
        readonly max: number | null;
        readonly ordered: boolean;
        readonly note?: string;
    }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageMaskCapability =
    | {
        readonly state: "supported";
        readonly appliesTo: "first-reference" | "single-reference" | "explicit-input";
        readonly note?: string;
    }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageEnumFieldCapability =
    | {
        readonly state: "supported";
        readonly values: readonly string[];
        /** False means that the format is fixed output metadata, not a request field. */
        readonly requestable?: boolean;
        readonly note?: string;
    }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageDimensionRules = {
    readonly minWidth?: number;
    readonly maxWidth?: number;
    readonly minHeight?: number;
    readonly maxHeight?: number;
    readonly minPixels?: number;
    readonly maxPixels?: number;
    readonly multipleOf?: number;
    readonly maxAspectRatio?: number;
    readonly defaultWidth?: number;
    readonly defaultHeight?: number;
};

export type ImageSizeCapability =
    | {
        readonly state: "supported";
        readonly kind: "dimensions";
        readonly required?: boolean;
        readonly allowAuto?: boolean;
        readonly rules: ImageDimensionRules;
        readonly boundsPublished: boolean;
        readonly examples?: readonly string[];
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "enum";
        readonly required?: boolean;
        readonly values: readonly string[];
        readonly allowAuto?: boolean;
        readonly default?: string;
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "tier-and-ratio";
        readonly required?: boolean;
        readonly tiers: readonly string[];
        readonly ratios: readonly string[];
        readonly ratioRequired?: boolean;
        readonly defaultTier?: string;
        readonly defaultRatio?: string;
        /** Some tier-based APIs also accept exact WIDTHxHEIGHT values. */
        readonly dimensions?: {
            readonly rules: ImageDimensionRules;
            readonly boundsPublished: boolean;
            readonly examples?: readonly string[];
        };
        readonly note?: string;
    }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageSerializerKind =
    | "openai-images-generate"
    | "openai-images-edit"
    | "openai-images-variation"
    | "openai-responses-image-tool"
    | "openai-chat-image-message"
    | "xai-imagine-edit"
    | "agnes-images-generate"
    | "dashscope-multimodal-image"
    | "ark-images-generate"
    | "sensenova-images-generate"
    | "sensenova-miaohua-image"
    | "civitai-workflow"
    | "fal-rest"
    | "custom-profile";

/**
 * These are serializer-selection flags, not permission to build one universal payload.
 * Every `kind` is expected to keep its own provider/model/operation serializer.
 */
export type ImageSerializationPolicy = {
    readonly kind: ImageSerializerKind;
    readonly endpoint: string;
    readonly quantityField: "n" | "quantity" | "numImages" | "max_images" | "samples" | "num_images" | null;
    readonly referenceField:
        | "image"
        | "image[]"
        | "extra_body.image[]"
        | "input.messages[].content[].image"
        | "image[]-json"
        | "images[]"
        | "images[].url"
        | "imageStyleReferences[]"
        | "messages[].content[].image_url"
        | "input[].content[].input_image"
        | "img_url"
        | "image_url"
        | "image_urls[]"
        | null;
    readonly maskField: "mask" | "maskImage" | "tools[].input_image_mask" | null;
    readonly sizeField:
        | "size"
        | "width+height"
        | "size+ratio"
        | "parameters.size"
        | "imageSize"
        | "aspectRatio"
        | "size+aspectRatio"
        | "aspectRatio+resolution"
        | "image_size"
        | "aspect_ratio+resolution"
        | null;
    readonly qualityField: "quality" | null;
    readonly outputFormatField: "output_format" | "outputFormat" | "format" | null;
    readonly responseEncodingField: "response_format" | "extra_body.response_format" | null;
};

export type ImageAdvancedFieldName =
    | "negativePrompt"
    | "steps"
    | "cfgScale"
    | "seed"
    | "sampler"
    | "scheduler"
    | "sequential"
    | "clipSkip"
    | "loras";

export type ImageAdvancedFieldCapability =
    | {
        readonly state: "supported";
        readonly kind: "string";
        readonly wireName: string;
        readonly maxLength?: number;
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "number";
        readonly wireName: string;
        readonly min?: number;
        readonly max?: number;
        readonly integer?: boolean;
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "int64";
        readonly wireName: string;
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "enum";
        readonly wireName: string;
        readonly values: readonly string[];
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "boolean";
        readonly wireName: string;
        readonly note?: string;
    }
    | {
        readonly state: "supported";
        readonly kind: "number-map";
        readonly wireName: string;
        readonly min?: number;
        readonly max?: number;
        readonly note?: string;
    }
    | { readonly state: "unsupported"; readonly reason: string }
    | { readonly state: "unknown"; readonly reason: string };

export type ImageAdvancedFieldsCapability = Readonly<Record<ImageAdvancedFieldName, ImageAdvancedFieldCapability>>;

export type ResolvedImageCapabilityId =
    | ImageCapabilityProfileId
    | "unknown-custom-endpoint"
    | "unknown-native-model"
    | "unsupported-operation"
    | "profile-operation-mismatch"
    | "profile-adapter-mismatch";

type ImageCapabilityProfileBase<O extends ImageOperation> = {
    readonly id: ResolvedImageCapabilityId;
    readonly provider: ImageProviderFamily;
    readonly label: string;
    readonly operation: O;
    readonly availability: ImageAvailability;
    readonly lifecycle: ImageLifecycle;
    readonly outputCount: ImageOutputCountCapability;
    readonly referenceCount: ImageReferenceCountCapability;
    readonly mask: ImageMaskCapability;
    readonly size: ImageSizeCapability;
    readonly quality: ImageEnumFieldCapability;
    readonly outputFormat: ImageEnumFieldCapability;
    readonly advancedFields: ImageAdvancedFieldsCapability;
    readonly serialization: ImageSerializationPolicy;
    readonly evidence: readonly ImageCapabilityEvidence[];
    /** Story-only identity-crop selection; general image-edit inputs stay unchanged. */
    readonly storyIdentityReferenceStrategy: StoryIdentityReferenceStrategy;
    /** Story-only prompt adaptation informed by a controlled sample; it is not a provider-output guarantee. */
    readonly storyPromptConstraintStyle: StoryPromptConstraintStyle;
    /** Native unknown models require configuration for every operation. */
    readonly requiresExplicitProfile?: boolean;
    /** Generic compatible endpoints remain usable for T2I, but not for unverified image inputs. */
    readonly requiresExplicitProfileForReferences?: boolean;
};

export type ImageGenerateCapabilityProfile = ImageCapabilityProfileBase<"generate">;
export type ImageEditCapabilityProfile = ImageCapabilityProfileBase<"edit">;
export type ImageVariationCapabilityProfile = ImageCapabilityProfileBase<"variation">;
export type ImageResponsesToolCapabilityProfile = ImageCapabilityProfileBase<"responses-tool">;
export type ImageCapabilityProfile =
    | ImageGenerateCapabilityProfile
    | ImageEditCapabilityProfile
    | ImageVariationCapabilityProfile
    | ImageResponsesToolCapabilityProfile;

export type ImageCapabilityProfileId =
    | "openai-gpt-image-2-generate"
    | "openai-gpt-image-2-edit"
    | "openai-gpt-image-legacy-generate"
    | "openai-gpt-image-legacy-edit"
    | "openai-dall-e-2-generate"
    | "openai-dall-e-2-edit"
    | "openai-dall-e-2-variation"
    | "openai-dall-e-3-generate"
    | "openai-responses-image-tool"
    | "xai-grok-image-generate"
    | "xai-grok-imagine-2-generate"
    | "xai-grok-imagine-edit"
    | "xai-grok-imagine-2-edit"
    | "google-gemini-chat-image-generate"
    | "google-gemini-chat-image-edit"
    | "agnes-image-2.1-generate"
    | "agnes-image-2.1-edit"
    | "agnes-image-2.0-generate"
    | "agnes-image-2.0-edit"
    | "dashscope-qwen-multi-generate"
    | "dashscope-qwen-multi-edit"
    | "dashscope-qwen-single-generate"
    | "dashscope-qwen-max-plus-edit"
    | "dashscope-qwen-legacy-edit"
    | "dashscope-wan-2.7-generate"
    | "dashscope-wan-2.7-pro-generate"
    | "dashscope-wan-2.7-edit"
    | "dashscope-wan-2.6-generate"
    | "dashscope-wan-2.6-edit"
    | "dashscope-wan-2.6-t2i-generate"
    | "dashscope-z-image-generate"
    | "ark-seedream-generate"
    | "ark-seedream-edit"
    | "sensenova-u1-generate"
    | "sensenova-miaohua-generate"
    | "sensenova-miaohua-edit"
    | "civitai-z-image-generate"
    | "civitai-generic-generate"
    | "civitai-generic-edit"
    | "civitai-generic-variation"
    | "fal-flux-dev-generate"
    | "fal-flux-dev-edit"
    | "fal-flux-schnell-generate"
    | "fal-flux-lora-generate"
    | "fal-flux2-generate"
    | "fal-flux2-edit"
    | "fal-flux2-lora-generate"
    | "fal-banana-generate"
    | "fal-banana-edit"
    | "fal-seedream-generate"
    | "fal-seedream-edit";

export type ImageCapabilityProfileSelection =
    | ImageCapabilityProfileId
    | Partial<Record<ImageOperation, ImageCapabilityProfileId>>;

export type ImageCapabilityProvider = {
    readonly id?: string;
    readonly name?: string;
    /** Local-only, duplicate-safe presentation name supplied by the configured provider list. */
    readonly displayName?: string;
    readonly baseUrl?: string;
    readonly adapterType?: string;
    readonly imageCapabilityProfiles?: Readonly<Record<string, ImageCapabilityProfileSelection | string>>;
};

export type ImageCapabilityService = {
    readonly id?: string;
    readonly step?: string;
    readonly parameters?: Readonly<Record<string, string>>;
    readonly modalities?: { readonly input?: readonly string[]; readonly output?: readonly string[] };
};

export type ResolvedImageModelCapability = ImageCapabilityProfile & {
    readonly model: string;
    readonly providerLabel: string;
    readonly profileConfigured: boolean;
    readonly resolutionReason: string;
};

export type ImageCapabilityIssueCode =
    | "operation_unsupported"
    | "operation_unverified"
    | "operation_mismatch"
    | "prompt_invalid"
    | "explicit_profile_required"
    | "invalid_output_count"
    | "output_count_too_low"
    | "output_count_too_high"
    | "output_count_unverified"
    | "client_fanout_required"
    | "invalid_reference_count"
    | "reference_count_too_low"
    | "reference_count_too_high"
    | "references_unsupported"
    | "reference_limit_unpublished"
    | "mask_requires_reference"
    | "mask_unsupported"
    | "mask_unverified"
    | "size_required"
    | "size_conflict"
    | "size_invalid"
    | "size_unsupported"
    | "size_unverified"
    | "field_value_invalid"
    | "field_unsupported"
    | "field_unverified"
    | "field_not_requestable"
    | "advanced_field_invalid"
    | "advanced_field_unsupported"
    | "advanced_field_unverified";

export type ImageCapabilityIssue = {
    readonly code: ImageCapabilityIssueCode;
    readonly field:
        | "operation"
        | "prompt"
        | "outputCount"
        | "referenceCount"
        | "mask"
        | "size"
        | "quality"
        | "outputFormat"
        | ImageAdvancedFieldName;
    readonly message: string;
};

export type ImageRequestValidationInput = {
    readonly operation: ImageOperation;
    /** Operation-specific prompt. Legacy DALL-E variation forbids it; Responses requires it. */
    readonly prompt?: string;
    readonly outputCount?: number;
    readonly referenceCount?: number;
    readonly hasMask?: boolean;
    /** A dimension string, enum, or tier according to the resolved profile. */
    readonly size?: string;
    readonly width?: number;
    readonly height?: number;
    readonly aspectRatio?: string;
    readonly quality?: string;
    readonly outputFormat?: string;
    readonly negativePrompt?: string;
    readonly steps?: number;
    readonly cfgScale?: number;
    readonly seed?: number | string;
    readonly sampler?: string;
    readonly scheduler?: string;
    readonly clipSkip?: number;
    /** Explicit provider mode; never inferred from outputCount. */
    readonly sequential?: boolean;
    readonly loras?: Readonly<Record<string, number>>;
};

export type ImageRequestValidationResult = {
    readonly ok: boolean;
    readonly errors: readonly ImageCapabilityIssue[];
    readonly warnings: readonly ImageCapabilityIssue[];
};

export type ImageOutputRequestPlan = {
    readonly ok: boolean;
    readonly transport: "native-batch" | "client-fanout" | "unknown";
    readonly expectedOutputCount: number;
    /** `repeat` prevents allocating a huge command array for client fan-out. */
    readonly batches: readonly { readonly providerOutputCount: number; readonly repeat: number }[];
    readonly errors: readonly ImageCapabilityIssue[];
    readonly warnings: readonly ImageCapabilityIssue[];
};

const VERIFIED_AT = "2026-08-03";

const OPENAI_IMAGE_GUIDE = evidence("official-doc", "https://developers.openai.com/api/docs/guides/image-generation", `OpenAI image guide, checked ${VERIFIED_AT}; n generates multiple images in one request; GPT Image 2 size/quality rechecked 2026-08-30`);
const OPENAI_IMAGE_API = evidence("official-openapi", "https://developers.openai.com/api/reference/resources/images", `OpenAI Images API, checked ${VERIFIED_AT}`);
const OPENAI_IMAGE_GENERATE_API = evidence("official-openapi", "https://developers.openai.com/api/reference/resources/images/methods/generate", "POST /images/generations: n 1-10 (dall-e-3 only n=1); GPT Image 2 arbitrary WIDTHxHEIGHT; quality auto|low|medium|high; output_format png|jpeg|webp; models include gpt-image-2 and gpt-image-2-2026-04-21, checked 2026-08-30");
const OPENAI_IMAGE_EDIT_API = evidence("official-openapi", "https://developers.openai.com/api/reference/resources/images/methods/edit", "POST /images/edits: n 1-10; GPT image models including gpt-image-2 / gpt-image-2-2026-04-21 / chatgpt-image-latest accept up to 16 input images; mask applies to the first image, checked 2026-08-30");
const OPENAI_DEPRECATIONS = evidence("official-doc", "https://developers.openai.com/api/docs/deprecations", "DALL-E 2 and DALL-E 3 were removed from the OpenAI API on 2026-05-12");
const AGNES_21_DOC = evidence("official-doc", "https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash", `Agnes Image 2.1 guide, checked ${VERIFIED_AT}`);
const AGNES_20_DOC = evidence("official-doc", "https://agnes-ai.com/en/docs/agnes-image-20-flash", `Agnes Image 2.0 guide, checked ${VERIFIED_AT}`);
const DASHSCOPE_IMAGE_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/image-model/", `DashScope image model comparison, checked ${VERIFIED_AT}`);
const DASHSCOPE_QWEN_IMAGE_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/qwen-image-api", "Qwen Image generation API, checked 2026-08-04");
const DASHSCOPE_QWEN_EDIT_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/qwen-image-edit-guide", `Qwen Image edit guide, checked ${VERIFIED_AT}`);
const DASHSCOPE_WAN27_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/wan-image-generation-and-editing-api-reference", `Wan2.7 image API, checked ${VERIFIED_AT}`);
const DASHSCOPE_WAN26_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/wan-image-generation-api-reference", `Wan2.6 image API, checked ${VERIFIED_AT}`);
const DASHSCOPE_Z_DOC = evidence("official-doc", "https://help.aliyun.com/en/model-studio/z-image-api-reference", `Z-Image API, checked ${VERIFIED_AT}`);
const ARK_IMAGE_API = evidence("official-openapi", "https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01", `Ark ImageGenerations API, checked ${VERIFIED_AT}`);
const ARK_SEEDREAM_GUIDE = evidence("official-doc", "https://www.volcengine.com/docs/82379/1829186", `Seedream 4.0-5.0 guide, checked ${VERIFIED_AT}`);
const SENSENOVA_U1_DOC = evidence("official-doc", "https://platform.sensenova.cn/docs#model-u1", `SenseNova U1 Fast contract, checked ${VERIFIED_AT}`);
const SENSENOVA_MIAOHUA_DOC = evidence("official-doc", "https://largemodel.sensetime.com/product/APIService/document/96/", `SenseTime Miaohua API, checked ${VERIFIED_AT}`);
const CIVITAI_IMAGE_OPENAPI = evidence("live-openapi", "https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml", `Civitai imageGen live OpenAPI, checked ${VERIFIED_AT}`);
const XAI_IMAGE_API = evidence("official-openapi", "https://docs.x.ai/developers/rest-api-reference/inference/images", "xAI Images REST: POST /v1/images/generations and /v1/images/edits; generations example includes n and response_format, checked 2026-08-30");
const XAI_IMAGINE_GUIDE = evidence("official-doc", "https://docs.x.ai/developers/model-capabilities/images/generation", "xAI Imagine generation: n 1-10; aspect_ratio enum including auto; resolution 1k|2k; quality low|medium only on grok-imagine-image-2.0, checked 2026-08-30");
const XAI_IMAGINE_OVERVIEW = evidence("official-doc", "https://docs.x.ai/developers/model-capabilities/imagine", "Imagine overview: generation output count up to 10; editing up to 3 reference images, checked 2026-08-30");
const XAI_IMAGINE_EDIT_OPENAPI = evidence("official-openapi", "https://docs.x.ai/openapi.json", "xAI EditImageRequest on POST /v1/images/edits: JSON body (not multipart); prompt required; image {url} and images [{url}] are mutually exclusive, images max 3; url accepts base64 data URI (JPEG/PNG/WebP); n and response_format documented, checked 2026-08-15");
const XAI_IMAGINE_MULTI_EDIT_GUIDE = evidence("official-doc", "https://docs.x.ai/developers/model-capabilities/images/multi-image-editing", "xAI multi-image editing guide: up to 3 reference images, aspect_ratio only valid for multi-image edits, checked 2026-08-30");
const GEMINI_IMAGE_GUIDE = evidence("official-doc", "https://ai.google.dev/gemini-api/docs/image-generation", "Gemini image models (Nano Banana family): gemini-3.1-flash-image / gemini-3-pro-image (GA) and gemini-3.1-flash-image-preview / gemini-3-pro-image-preview (legacy preview IDs); text+image input editing; up to 14 input images depending on tier, checked 2026-08-15");
const GEMINI_OPENAI_COMPAT_DOC = evidence("official-doc", "https://ai.google.dev/gemini-api/docs/openai", "Google first-party OpenAI-compatible layer exposes Gemini image models on /v1beta/openai/images/generations; chat/completions is documented for text models only, checked 2026-08-15");
const KLONG_GEMINI_CHAT_IMAGE_LIVE = evidence("live-api", "https://api.klong.lat/v1", "Live probe 2026-08-15: /images/generations rejects gemini-*-image* models (\"only imagen models are supported\"); chat/completions returns ![image](data:image/jpeg;base64,...) for text-to-image and for text+image_url editing with 1 and 2 references on gemini-3-pro-image-preview-c and gemini-3.1-flash-image-preview-c");

const CIVITAI_KLEIN_OR_QWEN_EDIT = "image/flux2/klein/editImage/9b 或 image/sdcpp/qwen/20b/editImage";
const UNSUPPORTED_REFERENCES = unsupported("该 operation 不接受参考图片；请改用对应的 edit 或 variation 服务，而不是忽略已连接图片");
const UNSUPPORTED_MASK = unsupported("该合同没有栅格 mask 请求字段");
const UNSUPPORTED_QUALITY = unsupported("该合同没有 quality 请求字段");
const UNKNOWN_SIZE = unknown("该模型的完整 size 枚举或边界未由官方发布");
const UNKNOWN_OUTPUT_FORMAT = unknown("该模型的可选输出文件格式未由官方发布");

const GPT_IMAGE_2_SIZE = dimensions({
    allowAuto: true,
    boundsPublished: true,
    rules: {
        minPixels: 655_360,
        maxPixels: 8_294_400,
        maxWidth: 3840,
        maxHeight: 3840,
        multipleOf: 16,
        maxAspectRatio: 3,
    },
    examples: ["1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "3840x2160", "2160x3840"],
    note: "GPT Image 2 arbitrary dimensions: both edges are 16-aligned, aspect ratio <= 3:1, longest edge <= 3840; resolutions above 2560x1440 are experimental",
});
const GPT_IMAGE_LEGACY_SIZES = enumSize(["auto", "1024x1024", "1536x1024", "1024x1536"]);
const GPT_IMAGE_QUALITY = enumField(["auto", "low", "medium", "high"]);
const GPT_IMAGE_FORMAT = enumField(["png", "jpeg", "webp"]);
const GPT_IMAGE_2_EDIT_REFERENCES = references(
    1,
    16,
    "Official Images Edit JSON: GPT image models including gpt-image-2 accept up to 16 input images; input order is preserved and a mask applies to the first image",
);
const XAI_IMAGINE_2_RATIOS = [
    "auto",
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "2:1",
    "1:2",
    "19.5:9",
    "9:19.5",
    "20:9",
    "9:20",
    "21:9",
    "5:2",
] as const;
const XAI_IMAGINE_2_SIZE = tierAndRatio(["1k", "2k"], XAI_IMAGINE_2_RATIOS, {
    required: false,
    defaultTier: "1k",
    defaultRatio: "auto",
    note: "Official Imagine 2.0 generation uses aspect_ratio plus resolution 1k|2k; quality is a separate request field",
});
const XAI_IMAGINE_2_QUALITY = enumField(["low", "medium"], { note: "Official Imagine 2.0 quality; omitted defaults to medium" });
const RESPONSES_IMAGE_TOOL_SIZES = enumSize(["auto", "1024x1024", "1536x1024", "1024x1536"]);
const DALL_E_2_SIZES = enumSize(["256x256", "512x512", "1024x1024"]);
const AGNES_21_SIZE = tierAndRatio(
    ["1K", "2K", "3K", "4K"],
    ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"],
    {
        required: true,
        dimensions: { rules: {}, boundsPublished: false },
        note: "ratio is optional; the official API also accepts exact dimensions but does not publish their complete bounds",
    },
);
const AGNES_20_SIZE = dimensions({
    required: true,
    boundsPublished: false,
    rules: {},
    examples: ["1024x768", "1024x1024", "768x1024"],
    note: "Official documentation lists examples, not an exhaustive enum or numeric bounds",
});
const DASHSCOPE_512_TO_2048_SIZE = dimensions({
    boundsPublished: true,
    rules: { minPixels: 512 * 512, maxPixels: 2048 * 2048 },
});
const DASHSCOPE_QWEN_20_SIZE = dimensions({
    boundsPublished: true,
    rules: { minPixels: 512 * 512, maxPixels: 2048 * 2048, maxAspectRatio: 8 },
    examples: ["2048x2048", "2688x1536", "1536x2688", "2368x1728", "1728x2368"],
    note: "Qwen-Image 2.0/3.0 official 2K presets; default 2048x2048",
});
const DASHSCOPE_QWEN_SINGLE_SIZES = enumSize(["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"]);
const DASHSCOPE_WAN27_PRO_SIZE = dimensions({
    boundsPublished: true,
    rules: { minPixels: 768 * 768, maxPixels: 4096 * 4096, maxAspectRatio: 8 },
});
const DASHSCOPE_WAN27_STANDARD_SIZE = dimensions({
    boundsPublished: true,
    rules: { minPixels: 768 * 768, maxPixels: 2048 * 2048, maxAspectRatio: 8 },
});
const DASHSCOPE_WAN27_EDIT_SIZE = dimensions({
    boundsPublished: true,
    rules: { minPixels: 768 * 768, maxPixels: 2048 * 2048, maxAspectRatio: 8 },
});
const DASHSCOPE_WAN26_EDIT_SIZE = dimensions({
    boundsPublished: true,
    rules: { minPixels: 768 * 768, maxPixels: 2048 * 2048, maxAspectRatio: 4 },
});
const SENSENOVA_U1_SIZES = enumSize([
    "1664x2496",
    "2496x1664",
    "1760x2368",
    "2368x1760",
    "1824x2272",
    "2272x1824",
    "2048x2048",
    "2752x1536",
    "1536x2752",
    "3072x1376",
    "1344x3136",
]);
const MIAOHUA_SIZE = dimensions({
    boundsPublished: true,
    rules: { minWidth: 640, minHeight: 640, maxWidth: 6000, maxHeight: 6000 },
});
const CIVITAI_Z_SIZE = dimensions({
    required: false,
    boundsPublished: true,
    rules: {
        minWidth: 64,
        minHeight: 64,
        maxWidth: 2048,
        maxHeight: 2048,
        multipleOf: 16,
        defaultWidth: 1024,
        defaultHeight: 1024,
    },
});

const CIVITAI_FAL_QWEN2_IMAGE_SIZES = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"] as const;
const CIVITAI_FAL_KREA2_TIERS = ["medium", "large"] as const;
const CIVITAI_FAL_KREA2_RATIOS = ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"] as const;
const CIVITAI_FAL_MAI_RATIOS = ["auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;
const CIVITAI_FAL_REVE_RATIOS = ["auto", "4:1", "3:1", "21:9", "2:1", "17:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16", "1:2", "1:3", "1:4"] as const;
const CIVITAI_FLUX1_KONTEXT_RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"] as const;
const CIVITAI_GROK_RATIOS = ["2:1", "20:9", "19.5:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:19.5", "9:20", "1:2"] as const;
const CIVITAI_NANO_BANANA_RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;
const CIVITAI_IMAGEN4_RATIOS = ["1:1", "16:9", "9:16", "3:4", "4:3"] as const;
const CIVITAI_NANO_BANANA_TIERS = ["1K", "2K", "4K"] as const;
const CIVITAI_OPENAI_GPT1_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
const CIVITAI_OPENAI_DALLE2_SIZES = ["256x256", "512x512", "1024x1024"] as const;
const CIVITAI_OPENAI_DALLE3_SIZES = ["1024x1024", "1792x1024", "1024x1792"] as const;

const CIVITAI_SDCPP_SAMPLE_METHOD_ENUM = [
    "euler", "heun", "dpm2", "dpm++2s_a", "dpm++2m", "dpm++2mv2", "ipndm", "ipndm_v",
    "ddim_trailing", "euler_a", "lcm", "res_multistep", "res_2s", "tcd", "er_sde",
] as const;

const CIVITAI_SDCPP_SCHEDULE_ENUM = [
    "simple", "discrete", "karras", "exponential", "ays", "bong_tangent", "gits", "sgm_uniform",
    "smoothstep", "kl_optimal", "lcm",
] as const;

const CIVITAI_Z_ADVANCED_FIELDS: ImageAdvancedFieldsCapability = {
    negativePrompt: { state: "supported", kind: "string", wireName: "negativePrompt", maxLength: 10_000 },
    steps: { state: "supported", kind: "number", wireName: "steps", min: 1, max: 150, integer: true },
    cfgScale: { state: "supported", kind: "number", wireName: "cfgScale", min: 0, max: 30 },
    seed: { state: "supported", kind: "int64", wireName: "seed" },
    sampler: {
        state: "supported",
        kind: "enum",
        wireName: "sampleMethod",
        values: [...CIVITAI_SDCPP_SAMPLE_METHOD_ENUM],
    },
    scheduler: {
        state: "supported",
        kind: "enum",
        wireName: "schedule",
        values: [...CIVITAI_SDCPP_SCHEDULE_ENUM],
        note: "capitanZiT is not in the live OpenAPI enum",
    },
    sequential: unknown("sequential mode is not part of this Civitai service contract"),
    clipSkip: unknown("clipSkip 仅 Civitai SD1 ecosystem 服务可用"),
    loras: {
        state: "supported",
        kind: "number-map",
        wireName: "loras",
        note: "Keys are original model-version AIR identifiers; live OpenAPI does not publish a numeric strength bound",
    },
};

/** engine: "sdcpp" 通用服务（anima / sdxl / qwen / Z-Image 等 createImage・editImage）— live OpenAPI 同一组 sampleMethod/schedule 枚举。 */
const CIVITAI_SDCPP_ADVANCED_FIELDS: ImageAdvancedFieldsCapability = CIVITAI_Z_ADVANCED_FIELDS;

const CIVITAI_SD1_CLIP_SKIP: ImageAdvancedFieldsCapability["clipSkip"] = {
    state: "supported",
    kind: "number",
    wireName: "clipSkip",
    min: 1,
    max: 12,
    integer: true,
    note: "仅 SD1 ecosystem；SDXL 传 clipSkip 会被上游拒绝",
};

/** engine: "comfy" 服务 — live OpenAPI ComfySampler / ComfyScheduler 枚举；wire 字段为 sampler / scheduler（与 sdcpp 互斥）。 */
const CIVITAI_COMFY_ADVANCED_FIELDS: ImageAdvancedFieldsCapability = {
    negativePrompt: { state: "supported", kind: "string", wireName: "negativePrompt", maxLength: 10_000 },
    steps: { state: "supported", kind: "number", wireName: "steps", min: 1, max: 150, integer: true },
    cfgScale: { state: "supported", kind: "number", wireName: "cfgScale", min: 0, max: 30 },
    seed: { state: "supported", kind: "int64", wireName: "seed" },
    sampler: {
        state: "supported",
        kind: "enum",
        wireName: "sampler",
        values: [
            "euler", "euler_ancestral", "euler_cfg_pp", "euler_ancestral_cfg_pp", "heun", "heunpp2",
            "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive",
            "dpmpp_2s_ancestral", "dpmpp_2s_ancestral_cfg_pp", "dpmpp_sde", "dpmpp_sde_gpu",
            "dpmpp_2m", "dpmpp_2m_cfg_pp", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
            "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ipndm", "ipndm_v", "deis", "ddim",
            "uni_pc", "uni_pc_bh2", "res_multistep", "er_sde",
        ],
    },
    scheduler: {
        state: "supported",
        kind: "enum",
        wireName: "scheduler",
        values: ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta"],
    },
    sequential: unknown("sequential mode is not part of this Civitai service contract"),
    clipSkip: unknown("clipSkip 仅 Civitai SD1 ecosystem 服务可用"),
    loras: {
        state: "supported",
        kind: "number-map",
        wireName: "loras",
        note: "Keys are original model-version AIR identifiers; live OpenAPI does not publish a numeric strength bound",
    },
};

const DASHSCOPE_WAN27_ADVANCED_FIELDS: ImageAdvancedFieldsCapability = {
    ...unknownAdvancedFields(),
    sequential: {
        state: "supported",
        kind: "boolean",
        wireName: "enable_sequential",
        note: "Explicit image-set mode: n is a maximum (1-12), and the provider may return fewer images",
    },
};

const OPENAI_GENERATE_SERIALIZATION = serialization({
    kind: "openai-images-generate",
    endpoint: "/images/generations",
    quantityField: "n",
    sizeField: "size",
    qualityField: "quality",
    outputFormatField: "output_format",
});
const OPENAI_EDIT_SERIALIZATION = serialization({
    kind: "openai-images-edit",
    endpoint: "/images/edits",
    quantityField: "n",
    referenceField: "image[]",
    maskField: "mask",
    sizeField: "size",
    qualityField: "quality",
    outputFormatField: "output_format",
});

export const FAL_MODEL_DOCS = evidence("official-doc", "https://docs.fal.ai/model-endpoints", `fal model endpoint docs, checked ${VERIFIED_AT}`);
const FAL_FLUX_LORA_DOCS = evidence(
    "official-doc",
    "https://fal.ai/models/fal-ai/flux-lora/llms.txt",
    "官方 FLUX.1 LoRA endpoint：text-to-image，loras 为 list<LoraWeight>，num_inference_steps 1–50，guidance_scale 0–35",
);
const FAL_FLUX2_LORA_DOCS = evidence(
    "official-doc",
    "https://fal.ai/models/fal-ai/flux-2/lora/llms.txt",
    "官方 FLUX.2 LoRA endpoint：text-to-image，loras 最多 3 个，num_inference_steps 4–50，guidance_scale 0–20",
);
const FAL_EDIT_PROBE = evidence(
    "live-api",
    "https://fal.run",
    "2026-09-14 经本站 relay 以空 body 实测：flux-2-pro/edit、flux-2-flex/edit、flux-2/flash/edit、nano-banana/edit、nano-banana-pro/edit、bytedance/seedream/v4.5/edit 均返回 422（缺 prompt/image_urls）而非 404——端点存在且收 image_urls 数组",
);

const FAL_SIZE = tierAndRatio(["1k", "2k", "3k", "4k"], ["1:1", "16:9", "9:16", "4:3", "3:4"], {
    required: false,
    defaultTier: "2k",
    defaultRatio: "1:1",
    note: "fal 多数模型收 image_size {width,height}（适配器把档位+宽高比换算成像素）；nano-banana 系改发 aspect_ratio 字符串，pro 另收 resolution 档位",
});

const FAL_SEED_ONLY: ImageAdvancedFieldsCapability = {
    ...unknownAdvancedFields(),
    seed: { state: "supported", kind: "int64", wireName: "seed" },
};

const FAL_FLUX1_ADVANCED: ImageAdvancedFieldsCapability = {
    ...FAL_SEED_ONLY,
    steps: { state: "supported", kind: "number", wireName: "num_inference_steps", min: 1, integer: true },
    cfgScale: { state: "supported", kind: "number", wireName: "guidance_scale", min: 0, note: "schnell 不收 guidance_scale" },
};

const FAL_FLUX1_SCHNELL_ADVANCED: ImageAdvancedFieldsCapability = {
    ...FAL_SEED_ONLY,
    steps: { state: "supported", kind: "number", wireName: "num_inference_steps", min: 1, integer: true },
};

const FAL_FLUX_LORA_ADVANCED: ImageAdvancedFieldsCapability = {
    ...FAL_SEED_ONLY,
    steps: { state: "supported", kind: "number", wireName: "num_inference_steps", min: 1, max: 50, integer: true },
    cfgScale: { state: "supported", kind: "number", wireName: "guidance_scale", min: 0, max: 35 },
    loras: { state: "supported", kind: "number-map", wireName: "loras", note: "官方 list<LoraWeight>；identity 必须是公开权重 URL 或 provider 支持的路径" },
};

const FAL_FLUX2_LORA_ADVANCED: ImageAdvancedFieldsCapability = {
    ...FAL_SEED_ONLY,
    steps: { state: "supported", kind: "number", wireName: "num_inference_steps", min: 4, max: 50, integer: true },
    cfgScale: { state: "supported", kind: "number", wireName: "guidance_scale", min: 0, max: 20 },
    loras: { state: "supported", kind: "number-map", wireName: "loras", max: 3, note: "官方最多 3 个 LoRA；identity 可为 URL、HuggingFace repo 或 local path" },
};

function falProfile<O extends "generate" | "edit">(
    id: ImageCapabilityProfileId,
    operation: O,
    input: {
        readonly label: string;
        readonly referenceCount?: ImageReferenceCountCapability;
        readonly advancedFields?: ImageAdvancedFieldsCapability;
        readonly referenceField?: ImageSerializationPolicy["referenceField"];
        readonly sizeField?: ImageSerializationPolicy["sizeField"];
        readonly evidenceNote?: readonly ImageCapabilityEvidence[];
    },
): ImageCapabilityProfileBase<O> {
    return profile({
        id,
        provider: "fal",
        label: input.label,
        operation,
        outputCount: nativeBatch(1, null, "fal num_images 上限按模型各异，未逐一核实"),
        referenceCount: input.referenceCount || UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: FAL_SIZE,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: UNKNOWN_OUTPUT_FORMAT,
        advancedFields: input.advancedFields,
        serialization: serialization({
            kind: "fal-rest",
            endpoint: "https://fal.run/{fal-ai endpoint id}",
            quantityField: "num_images",
            referenceField: input.referenceField || null,
            sizeField: input.sizeField || "image_size",
        }),
        evidence: [FAL_MODEL_DOCS, ...(input.evidenceNote || [])],
    });
}

export const IMAGE_CAPABILITY_PROFILES: Readonly<Record<ImageCapabilityProfileId, ImageCapabilityProfile>> = {
    "openai-gpt-image-2-generate": profile({
        id: "openai-gpt-image-2-generate",
        provider: "openai",
        label: "OpenAI GPT Image 2 generation",
        operation: "generate",
        outputCount: nativeBatch(1, 10),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: GPT_IMAGE_2_SIZE,
        quality: GPT_IMAGE_QUALITY,
        outputFormat: GPT_IMAGE_FORMAT,
        serialization: OPENAI_GENERATE_SERIALIZATION,
        evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_GENERATE_API, OPENAI_IMAGE_API],
    }),
    "openai-gpt-image-2-edit": profile({
        id: "openai-gpt-image-2-edit",
        provider: "openai",
        label: "OpenAI GPT Image 2 edit",
        operation: "edit",
        outputCount: nativeBatch(1, 10),
        referenceCount: GPT_IMAGE_2_EDIT_REFERENCES,
        mask: supportedMask("first-reference", "OpenAI applies the mask to the first image when multiple images are supplied"),
        size: GPT_IMAGE_2_SIZE,
        quality: GPT_IMAGE_QUALITY,
        outputFormat: GPT_IMAGE_FORMAT,
        serialization: OPENAI_EDIT_SERIALIZATION,
        evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_EDIT_API, OPENAI_IMAGE_API],
    }),
    "openai-gpt-image-legacy-generate": profile({
        id: "openai-gpt-image-legacy-generate",
        provider: "openai",
        label: "OpenAI GPT Image 1.x generation",
        operation: "generate",
        lifecycle: "deprecated",
        outputCount: nativeBatch(1, 10),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: GPT_IMAGE_LEGACY_SIZES,
        quality: GPT_IMAGE_QUALITY,
        outputFormat: GPT_IMAGE_FORMAT,
        serialization: OPENAI_GENERATE_SERIALIZATION,
        evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_GENERATE_API, OPENAI_IMAGE_API],
    }),
    "openai-gpt-image-legacy-edit": profile({
        id: "openai-gpt-image-legacy-edit",
        provider: "openai",
        label: "OpenAI GPT Image 1.x edit",
        operation: "edit",
        lifecycle: "deprecated",
        outputCount: nativeBatch(1, 10),
        referenceCount: references(1, 16),
        mask: supportedMask("first-reference"),
        size: GPT_IMAGE_LEGACY_SIZES,
        quality: GPT_IMAGE_QUALITY,
        outputFormat: GPT_IMAGE_FORMAT,
        serialization: OPENAI_EDIT_SERIALIZATION,
        evidence: [OPENAI_IMAGE_GUIDE, OPENAI_IMAGE_EDIT_API, OPENAI_IMAGE_API],
    }),
    "openai-dall-e-2-generate": profile({
        id: "openai-dall-e-2-generate",
        provider: "openai",
        label: "DALL-E 2 generation (legacy relay contract)",
        operation: "generate",
        lifecycle: "removed",
        outputCount: nativeBatch(1, 10),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: DALL_E_2_SIZES,
        quality: enumField(["standard"]),
        outputFormat: enumField(["png"], { requestable: false, note: "DALL-E 2 output is PNG; this is not an output_format request field" }),
        serialization: serialization({ ...OPENAI_GENERATE_SERIALIZATION, outputFormatField: null, responseEncodingField: "response_format" }),
        evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS],
    }),
    "openai-dall-e-2-edit": profile({
        id: "openai-dall-e-2-edit",
        provider: "openai",
        label: "DALL-E 2 edit (legacy relay contract)",
        operation: "edit",
        lifecycle: "removed",
        outputCount: nativeBatch(1, 10),
        referenceCount: references(1, 1, "Exactly one square PNG source image under the historical contract"),
        mask: supportedMask("single-reference"),
        size: DALL_E_2_SIZES,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: enumField(["png"], { requestable: false }),
        serialization: serialization({ ...OPENAI_EDIT_SERIALIZATION, outputFormatField: null, qualityField: null, responseEncodingField: "response_format" }),
        evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS],
    }),
    "openai-dall-e-2-variation": profile({
        id: "openai-dall-e-2-variation",
        provider: "openai",
        label: "DALL-E 2 variation (legacy relay contract)",
        operation: "variation",
        lifecycle: "deprecated",
        outputCount: nativeBatch(1, 10),
        referenceCount: references(1, 1),
        mask: UNSUPPORTED_MASK,
        size: DALL_E_2_SIZES,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: enumField(["png"], { requestable: false }),
        serialization: serialization({
            kind: "openai-images-variation",
            endpoint: "/images/variations",
            quantityField: "n",
            referenceField: "image",
            sizeField: "size",
            responseEncodingField: "response_format",
        }),
        evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS],
    }),
    "openai-dall-e-3-generate": profile({
        id: "openai-dall-e-3-generate",
        provider: "openai",
        label: "DALL-E 3 generation (legacy relay contract)",
        operation: "generate",
        lifecycle: "removed",
        outputCount: nativeBatch(1, 1),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: enumSize(["1024x1024", "1792x1024", "1024x1792"]),
        quality: enumField(["standard", "hd"]),
        outputFormat: enumField(["png"], { requestable: false }),
        serialization: serialization({ ...OPENAI_GENERATE_SERIALIZATION, outputFormatField: null, responseEncodingField: "response_format" }),
        evidence: [OPENAI_IMAGE_API, OPENAI_DEPRECATIONS],
    }),
    "openai-responses-image-tool": profile({
        id: "openai-responses-image-tool",
        provider: "openai",
        label: "OpenAI Responses image_generation tool",
        operation: "responses-tool",
        outputCount: clientFanout(null, "The tool has no n field; repeated Responses requests are an application concern"),
        referenceCount: references(0, null, "Multiple input_image items are supported; the official upper bound is unpublished"),
        mask: supportedMask("explicit-input", "input_image_mask explicitly identifies its source image"),
        size: RESPONSES_IMAGE_TOOL_SIZES,
        quality: GPT_IMAGE_QUALITY,
        outputFormat: GPT_IMAGE_FORMAT,
        serialization: serialization({
            kind: "openai-responses-image-tool",
            endpoint: "/responses",
            referenceField: "input[].content[].input_image",
            maskField: "tools[].input_image_mask",
            sizeField: "size",
            qualityField: "quality",
            outputFormatField: "output_format",
        }),
        evidence: [OPENAI_IMAGE_GUIDE],
    }),
    "xai-grok-image-generate": profile({
        id: "xai-grok-image-generate",
        provider: "openai",
        label: "xAI Grok Image generation (OpenAI-compatible contract)",
        operation: "generate",
        outputCount: nativeBatch(1, 10, "xAI documents n 1-10 on /v1/images/generations"),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: tierAndRatio(["1k", "2k"], XAI_IMAGINE_2_RATIOS, {
            required: false,
            defaultTier: "1k",
            defaultRatio: "auto",
            note: "xAI Imagine generation 文档（XAI_IMAGINE_GUIDE）：aspect_ratio + resolution 1k|2k 适用于 grok-imagine-image（1.0）与 quality 变体；quality 字段仅 2.0",
        }),
        quality: unsupported("xAI Images API 不接受 quality 请求字段（quality 仅 grok-imagine-image-2.0 支持）"),
        outputFormat: enumField(["jpg"], { requestable: false, note: "xAI image output is JPG; response_format only selects url vs b64_json transport" }),
        serialization: serialization({
            kind: "openai-images-generate",
            endpoint: "/images/generations",
            quantityField: "n",
            responseEncodingField: "response_format",
        }),
        evidence: [XAI_IMAGE_API, XAI_IMAGINE_GUIDE, XAI_IMAGINE_OVERVIEW],
    }),
    "xai-grok-imagine-2-generate": profile({
        id: "xai-grok-imagine-2-generate",
        provider: "openai",
        label: "xAI Grok Imagine 2.0 generation",
        operation: "generate",
        outputCount: nativeBatch(1, 10, "Official Imagine generation: n 1-10 on /v1/images/generations"),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: XAI_IMAGINE_2_SIZE,
        quality: XAI_IMAGINE_2_QUALITY,
        outputFormat: enumField(["jpg"], { requestable: false, note: "xAI image output is JPG; response_format only selects url vs b64_json transport" }),
        serialization: serialization({
            kind: "openai-images-generate",
            endpoint: "/images/generations",
            quantityField: "n",
            sizeField: "aspectRatio+resolution",
            qualityField: "quality",
            responseEncodingField: "response_format",
        }),
        evidence: [XAI_IMAGINE_GUIDE, XAI_IMAGINE_OVERVIEW, XAI_IMAGE_API],
    }),
    "xai-grok-imagine-edit": profile({
        id: "xai-grok-imagine-edit",
        provider: "openai",
        label: "xAI Grok Imagine image edit (JSON contract)",
        operation: "edit",
        outputCount: nativeBatch(1, 10, "Official Imagine overview documents output count up to 10; REST edits also accept n"),
        referenceCount: references(1, 3, "xAI multi-image editing guide: up to 3 reference images; single-image edit uses the mutually exclusive image field"),
        mask: unsupported("xAI EditImageRequest 没有 mask 字段（OpenAPI 已核实）"),
        size: unsupported("xAI single-image edits 不接受 size；aspect_ratio 仅多图编辑有效"),
        quality: unsupported("xAI edits 不接受 quality 请求字段"),
        outputFormat: enumField(["jpg", "png", "webp"], { requestable: false, note: "xAI GeneratedImage.mime_type 可为 jpeg/png/webp；response_format 只选择 url vs b64_json 传输" }),
        serialization: serialization({
            kind: "xai-imagine-edit",
            endpoint: "/images/edits",
            quantityField: "n",
            referenceField: "images[].url",
            responseEncodingField: "response_format",
        }),
        evidence: [XAI_IMAGINE_EDIT_OPENAPI, XAI_IMAGINE_MULTI_EDIT_GUIDE, XAI_IMAGINE_OVERVIEW],
    }),
    "xai-grok-imagine-2-edit": profile({
        id: "xai-grok-imagine-2-edit",
        provider: "openai",
        label: "xAI Grok Imagine 2.0 image edit (JSON contract)",
        operation: "edit",
        outputCount: nativeBatch(1, 10, "Official Imagine overview documents output count up to 10"),
        referenceCount: references(1, 3, "xAI multi-image editing guide: up to 3 reference images; single-image edit uses the mutually exclusive image field"),
        mask: unsupported("xAI EditImageRequest 没有 mask 字段（OpenAPI 已核实）"),
        size: tierAndRatio(["1k", "2k"], XAI_IMAGINE_2_RATIOS, {
            required: false,
            defaultTier: "1k",
            defaultRatio: "auto",
            note: "Official EditImageRequest 接受 aspect_ratio 与 resolution 1k|2k；单图编辑默认沿用输入图比例",
        }),
        quality: unsupported("xAI Imagine 2.0 edits 不接受 quality 请求字段"),
        outputFormat: enumField(["jpg", "png", "webp"], { requestable: false, note: "xAI GeneratedImage.mime_type 可为 jpeg/png/webp；response_format 只选择 url vs b64_json 传输" }),
        serialization: serialization({
            kind: "xai-imagine-edit",
            endpoint: "/images/edits",
            quantityField: "n",
            referenceField: "images[].url",
            sizeField: "aspectRatio+resolution",
            responseEncodingField: "response_format",
        }),
        evidence: [XAI_IMAGINE_EDIT_OPENAPI, XAI_IMAGINE_MULTI_EDIT_GUIDE, XAI_IMAGINE_GUIDE],
    }),
    "google-gemini-chat-image-generate": profile({
        id: "google-gemini-chat-image-generate",
        provider: "openai",
        label: "Google Gemini image generation via relay chat/completions",
        operation: "generate",
        outputCount: clientFanout(null, "chat/completions 没有图片 n 字段；多张输出由客户端逐次调用"),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: unsupported("中转 chat/completions 路径没有 size 请求字段（官方 images/generations 合同在中转上拒绝 gemini 图片模型）"),
        quality: unsupported("chat/completions 图片路径没有 quality 请求字段"),
        outputFormat: enumField(["jpg"], { requestable: false, note: "中转实测返回 data:image/jpeg data URL；输出格式不可请求" }),
        serialization: serialization({
            kind: "openai-chat-image-message",
            endpoint: "/chat/completions",
            referenceField: "messages[].content[].image_url",
        }),
        evidence: [KLONG_GEMINI_CHAT_IMAGE_LIVE, GEMINI_IMAGE_GUIDE, GEMINI_OPENAI_COMPAT_DOC],
    }),
    "google-gemini-chat-image-edit": profile({
        id: "google-gemini-chat-image-edit",
        provider: "openai",
        label: "Google Gemini image edit via relay chat/completions",
        operation: "edit",
        outputCount: clientFanout(null, "chat/completions 没有图片 n 字段；多张输出由客户端逐次调用"),
        referenceCount: references(1, 14, "Google 官方 Gemini 图片模型最多 14 张输入图（分档，3-pro-image 为 6 物体+5 角色+3 风格）；中转 chat/completions 路径实测 2 张参考图可用"),
        mask: unsupported("chat/completions 图片路径没有 mask 概念；不会静默丢弃"),
        size: unsupported("中转 chat/completions 路径没有 size 请求字段"),
        quality: unsupported("chat/completions 图片路径没有 quality 请求字段"),
        outputFormat: enumField(["jpg"], { requestable: false, note: "中转实测返回 data:image/jpeg data URL；输出格式不可请求" }),
        serialization: serialization({
            kind: "openai-chat-image-message",
            endpoint: "/chat/completions",
            referenceField: "messages[].content[].image_url",
        }),
        evidence: [KLONG_GEMINI_CHAT_IMAGE_LIVE, GEMINI_IMAGE_GUIDE, GEMINI_OPENAI_COMPAT_DOC],
    }),
    "agnes-image-2.1-generate": agnesProfile("agnes-image-2.1-generate", "generate", AGNES_21_SIZE, [AGNES_21_DOC]),
    "agnes-image-2.1-edit": agnesProfile("agnes-image-2.1-edit", "edit", AGNES_21_SIZE, [AGNES_21_DOC]),
    "agnes-image-2.0-generate": agnesProfile("agnes-image-2.0-generate", "generate", AGNES_20_SIZE, [AGNES_20_DOC]),
    "agnes-image-2.0-edit": agnesProfile("agnes-image-2.0-edit", "edit", AGNES_20_SIZE, [AGNES_20_DOC]),
    "dashscope-qwen-multi-generate": dashscopeProfile({
        id: "dashscope-qwen-multi-generate",
        operation: "generate",
        label: "DashScope Qwen Image generation",
        outputCount: nativeBatch(1, 6),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: DASHSCOPE_QWEN_20_SIZE,
        quantityField: "n",
        evidence: [DASHSCOPE_QWEN_IMAGE_DOC],
    }),
    "dashscope-qwen-multi-edit": dashscopeProfile({
        id: "dashscope-qwen-multi-edit",
        operation: "edit",
        label: "DashScope Qwen Image edit",
        outputCount: nativeBatch(1, 6),
        referenceCount: references(1, 3),
        size: DASHSCOPE_QWEN_20_SIZE,
        quantityField: "n",
        evidence: [DASHSCOPE_QWEN_IMAGE_DOC, DASHSCOPE_QWEN_EDIT_DOC],
    }),
    "dashscope-qwen-single-generate": dashscopeProfile({
        id: "dashscope-qwen-single-generate",
        operation: "generate",
        label: "DashScope Qwen Image Max/Plus generation",
        outputCount: clientFanout(null, "The native operation returns one image; additional requested outputs require independent calls"),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: DASHSCOPE_QWEN_SINGLE_SIZES,
        quantityField: null,
        evidence: [DASHSCOPE_QWEN_IMAGE_DOC],
    }),
    "dashscope-qwen-max-plus-edit": dashscopeProfile({
        id: "dashscope-qwen-max-plus-edit",
        operation: "edit",
        label: "DashScope Qwen Image Edit Max/Plus",
        outputCount: nativeBatch(1, 6),
        referenceCount: references(1, 3),
        size: dimensions({
            boundsPublished: true,
            rules: { minWidth: 512, minHeight: 512, maxWidth: 2048, maxHeight: 2048 },
        }),
        quantityField: "n",
        evidence: [DASHSCOPE_QWEN_EDIT_DOC],
    }),
    "dashscope-qwen-legacy-edit": dashscopeProfile({
        id: "dashscope-qwen-legacy-edit",
        operation: "edit",
        label: "DashScope legacy Qwen Image edit",
        outputCount: clientFanout(null),
        referenceCount: references(1, 3),
        size: unsupported("The legacy edit contract does not accept a custom output size"),
        quantityField: null,
        evidence: [DASHSCOPE_QWEN_EDIT_DOC],
    }),
    "dashscope-wan-2.7-generate": dashscopeProfile({
        id: "dashscope-wan-2.7-generate",
        operation: "generate",
        label: "DashScope Wan2.7 image generation",
        outputCount: nativeBatch(1, 12, "Normal mode supports 1-4; explicit sequential mode supports a maximum of 1-12"),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: DASHSCOPE_WAN27_STANDARD_SIZE,
        quantityField: "n",
        advancedFields: DASHSCOPE_WAN27_ADVANCED_FIELDS,
        evidence: [DASHSCOPE_IMAGE_DOC, DASHSCOPE_WAN27_DOC],
    }),
    "dashscope-wan-2.7-pro-generate": dashscopeProfile({
        id: "dashscope-wan-2.7-pro-generate",
        operation: "generate",
        label: "DashScope Wan2.7 image pro generation",
        outputCount: nativeBatch(1, 12, "Normal mode supports 1-4; explicit sequential mode supports a maximum of 1-12"),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: DASHSCOPE_WAN27_PRO_SIZE,
        quantityField: "n",
        advancedFields: DASHSCOPE_WAN27_ADVANCED_FIELDS,
        evidence: [DASHSCOPE_IMAGE_DOC, DASHSCOPE_WAN27_DOC],
    }),
    "dashscope-wan-2.7-edit": dashscopeProfile({
        id: "dashscope-wan-2.7-edit",
        operation: "edit",
        label: "DashScope Wan2.7 image edit",
        outputCount: nativeBatch(1, 12, "Normal mode supports 1-4; explicit sequential mode supports a maximum of 1-12"),
        referenceCount: references(1, 9),
        size: DASHSCOPE_WAN27_EDIT_SIZE,
        quantityField: "n",
        advancedFields: DASHSCOPE_WAN27_ADVANCED_FIELDS,
        evidence: [DASHSCOPE_WAN27_DOC],
    }),
    "dashscope-wan-2.6-generate": dashscopeProfile({
        id: "dashscope-wan-2.6-generate",
        operation: "generate",
        label: "DashScope Wan2.6 interleaved image generation",
        outputCount: nativeBatch(1, 5),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: UNKNOWN_SIZE,
        quantityField: "max_images",
        evidence: [DASHSCOPE_WAN26_DOC],
    }),
    "dashscope-wan-2.6-edit": dashscopeProfile({
        id: "dashscope-wan-2.6-edit",
        operation: "edit",
        label: "DashScope Wan2.6 image edit",
        outputCount: nativeBatch(1, 4),
        referenceCount: references(1, 4),
        size: DASHSCOPE_WAN26_EDIT_SIZE,
        quantityField: "n",
        evidence: [DASHSCOPE_WAN26_DOC],
    }),
    "dashscope-wan-2.6-t2i-generate": dashscopeProfile({
        id: "dashscope-wan-2.6-t2i-generate",
        operation: "generate",
        label: "DashScope Wan2.6 text-to-image generation",
        outputCount: nativeBatch(1, 4),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: DASHSCOPE_512_TO_2048_SIZE,
        quantityField: "n",
        evidence: [DASHSCOPE_IMAGE_DOC],
    }),
    "dashscope-z-image-generate": dashscopeProfile({
        id: "dashscope-z-image-generate",
        operation: "generate",
        label: "DashScope Z-Image Turbo generation",
        outputCount: clientFanout(null),
        referenceCount: UNSUPPORTED_REFERENCES,
        size: DASHSCOPE_512_TO_2048_SIZE,
        quantityField: null,
        evidence: [DASHSCOPE_Z_DOC],
    }),
    "ark-seedream-generate": arkProfile("ark-seedream-generate", "generate"),
    "ark-seedream-edit": arkProfile("ark-seedream-edit", "edit"),
    "sensenova-u1-generate": profile({
        id: "sensenova-u1-generate",
        provider: "sensenova",
        label: "SenseNova U1 Fast generation",
        operation: "generate",
        outputCount: nativeBatch(1, null, "n defaults to 1; the official maximum is unpublished"),
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: SENSENOVA_U1_SIZES,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: UNKNOWN_OUTPUT_FORMAT,
        serialization: serialization({
            kind: "sensenova-images-generate",
            endpoint: "/images/generations",
            quantityField: "n",
            sizeField: "size",
            responseEncodingField: "response_format",
        }),
        evidence: [SENSENOVA_U1_DOC],
    }),
    "sensenova-miaohua-generate": miaohuaProfile("sensenova-miaohua-generate", "generate"),
    "sensenova-miaohua-edit": miaohuaProfile("sensenova-miaohua-edit", "edit"),
    "civitai-z-image-generate": profile({
        id: "civitai-z-image-generate",
        provider: "civitai",
        label: "Civitai Z-Image createImage",
        operation: "generate",
        outputCount: nativeBatch(1, 12),
        referenceCount: unsupported(civitaiPureTextToImageReferenceMessage("image/sdcpp/zImage/turbo/createImage")),
        mask: UNSUPPORTED_MASK,
        size: CIVITAI_Z_SIZE,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: enumField(["jpeg", "png", "webP"]),
        advancedFields: CIVITAI_Z_ADVANCED_FIELDS,
        serialization: serialization({
            kind: "civitai-workflow",
            endpoint: "/v2/consumer/workflows",
            quantityField: "quantity",
            sizeField: "width+height",
            outputFormatField: "outputFormat",
        }),
        evidence: [CIVITAI_IMAGE_OPENAPI],
    }),
    "civitai-generic-generate": civitaiGenericProfile("civitai-generic-generate", "generate"),
    "civitai-generic-edit": civitaiGenericProfile("civitai-generic-edit", "edit"),
    "civitai-generic-variation": civitaiGenericProfile("civitai-generic-variation", "variation"),
    "fal-flux-dev-generate": falProfile("fal-flux-dev-generate", "generate", {
        label: "Fal FLUX.1 dev/pro generation",
        advancedFields: FAL_FLUX1_ADVANCED,
    }),
    "fal-flux-dev-edit": falProfile("fal-flux-dev-edit", "edit", {
        label: "Fal FLUX.1 dev image-to-image",
        referenceCount: references(1, 1, "fal-ai/flux/dev/image-to-image 只收 1 张 image_url，另有 strength"),
        referenceField: "image_url",
        advancedFields: FAL_FLUX1_ADVANCED,
    }),
    "fal-flux-schnell-generate": falProfile("fal-flux-schnell-generate", "generate", {
        label: "Fal FLUX.1 schnell generation",
        advancedFields: FAL_FLUX1_SCHNELL_ADVANCED,
    }),
    "fal-flux-lora-generate": falProfile("fal-flux-lora-generate", "generate", {
        label: "Fal FLUX.1 LoRA generation",
        advancedFields: FAL_FLUX_LORA_ADVANCED,
        evidenceNote: [FAL_FLUX_LORA_DOCS],
    }),
    "fal-flux2-generate": falProfile("fal-flux2-generate", "generate", {
        label: "Fal FLUX.2 generation",
        advancedFields: FAL_SEED_ONLY,
    }),
    "fal-flux2-edit": falProfile("fal-flux2-edit", "edit", {
        label: "Fal FLUX.2 edit",
        referenceCount: references(1, null, "fal flux-2 */edit 收 image_urls 数组；官方上限未核到"),
        referenceField: "image_urls[]",
        advancedFields: FAL_SEED_ONLY,
        evidenceNote: [FAL_EDIT_PROBE],
    }),
    "fal-flux2-lora-generate": falProfile("fal-flux2-lora-generate", "generate", {
        label: "Fal FLUX.2 LoRA generation",
        advancedFields: FAL_FLUX2_LORA_ADVANCED,
        evidenceNote: [FAL_FLUX2_LORA_DOCS],
    }),
    "fal-banana-generate": falProfile("fal-banana-generate", "generate", {
        label: "Fal nano-banana generation",
        sizeField: "aspect_ratio+resolution",
    }),
    "fal-banana-edit": falProfile("fal-banana-edit", "edit", {
        label: "Fal nano-banana edit",
        referenceCount: references(1, null, "nano-banana(-pro)/edit 收 image_urls 数组；官方上限未核到"),
        referenceField: "image_urls[]",
        sizeField: "aspect_ratio+resolution",
        evidenceNote: [FAL_EDIT_PROBE],
    }),
    "fal-seedream-generate": falProfile("fal-seedream-generate", "generate", {
        label: "Fal Seedream 4.5 generation",
        advancedFields: FAL_SEED_ONLY,
    }),
    "fal-seedream-edit": falProfile("fal-seedream-edit", "edit", {
        label: "Fal Seedream 4.5 edit",
        referenceCount: references(1, null, "bytedance/seedream/v4.5/edit 收 image_urls 数组；官方上限未核到"),
        referenceField: "image_urls[]",
        advancedFields: FAL_SEED_ONLY,
        evidenceNote: [FAL_EDIT_PROBE],
    }),
};

export const IMAGE_CAPABILITY_PROFILE_IDS = Object.freeze(Object.keys(IMAGE_CAPABILITY_PROFILES) as ImageCapabilityProfileId[]);

export function isImageCapabilityProfileId(value: unknown): value is ImageCapabilityProfileId {
    return typeof value === "string" && value in IMAGE_CAPABILITY_PROFILES;
}

export function normalizeImageCapabilityProfiles(
    value: unknown,
): Record<string, ImageCapabilityProfileSelection> | undefined {
    if (!isRecord(value)) return undefined;
    const normalized: Record<string, ImageCapabilityProfileSelection> = {};
    for (const [rawModel, rawSelection] of Object.entries(value)) {
        const model = rawModel.trim();
        if (!model) continue;
        if (isImageCapabilityProfileId(rawSelection)) {
            normalized[model] = rawSelection;
            continue;
        }
        if (!isRecord(rawSelection)) continue;
        const byOperation: Partial<Record<ImageOperation, ImageCapabilityProfileId>> = {};
        for (const operation of IMAGE_OPERATIONS) {
            const candidate = rawSelection[operation];
            if (isImageCapabilityProfileId(candidate) && IMAGE_CAPABILITY_PROFILES[candidate].operation === operation) {
                byOperation[operation] = candidate;
            }
        }
        if (Object.keys(byOperation).length) normalized[model] = byOperation;
    }
    return Object.keys(normalized).length ? normalized : undefined;
}

export function nativeImageAdapterType(provider?: ImageCapabilityProvider): ImageProviderFamily | "" {
    if (!provider) return "";
    const explicit = String(provider.adapterType || "").trim().toLowerCase();
    if (explicit) {
        if (explicit === "openai" || explicit === "openai-images" || explicit === "openai-compat" || explicit === "openai-compatible") return "openai";
        // Studio Grok / Imagine relays speak the OpenAI Images wire protocol.
        if (explicit === "xai-imagine" || explicit === "xai") return "openai";
        if (explicit === "agnes") return "agnes";
        if (explicit === "dashscope") return "dashscope";
        if (explicit === "ark" || explicit === "ark-plan") return "ark";
        if (explicit === "sensenova") return "sensenova";
        if (explicit === "sensenova-miaohua" || explicit === "sensetime-miaohua") return "sensenova-miaohua";
        if (explicit === "civitai" || explicit === "civitai-orchestration") return "civitai";
        if (explicit === "fal" || explicit === "fal-ai" || explicit === "fal.ai") return "fal";
        return "";
    }
    const host = urlHostname(provider.baseUrl);
    if (!host) return "";
    if (host === "api.openai.com") return "openai";
    if (host === "agnes-ai.com" || host.endsWith(".agnes-ai.com")) return "agnes";
    if (host === "dashscope.aliyuncs.com" || host.endsWith(".dashscope.aliyuncs.com") || host.endsWith(".maas.aliyuncs.com")) return "dashscope";
    if (host === "ark.cn-beijing.volces.com" || host.endsWith(".volces.com")) return "ark";
    if (host === "token.sensenova.cn") return "sensenova";
    if (host === "mhapi.sensetime.com") return "sensenova-miaohua";
    if (host === "orchestration.civitai.com") return "civitai";
    if (host === "fal.run" || host === "fal.ai" || host.endsWith(".fal.ai") || host.endsWith(".fal.run")) return "fal";
    return "";
}

/**
 * Capability profiles describe an exact wire serializer, not merely a set of
 * UI fields. A custom model may use any profile implemented by its selected
 * adapter, but a profile from another provider family would submit to the
 * wrong endpoint/body shape and must be rejected before network I/O.
 */
export function imageCapabilityProfileCompatibility(
    provider: ImageCapabilityProvider | undefined,
    profileId: ImageCapabilityProfileId,
): { readonly compatible: boolean; readonly adapter: ImageProviderFamily | ""; readonly reason: string } {
    const profile = IMAGE_CAPABILITY_PROFILES[profileId];
    const explicitAdapter = String(provider?.adapterType || "").trim();
    const detectedAdapter = nativeImageAdapterType(provider);
    // An empty adapter is the explicit OpenAI-compatible passthrough choice.
    // A recognized native hostname remains authoritative for migrated configs.
    const adapter = detectedAdapter || (!explicitAdapter ? "openai" : "");
    if (adapter === profile.provider) return { compatible: true, adapter, reason: "" };
    const selected = adapter || explicitAdapter || "OpenAI-compatible";
    return {
        compatible: false,
        adapter,
        reason: `能力模板 ${profile.label} 使用 ${profile.provider} wire 协议，与当前 ${selected} adapter 不兼容`,
    };
}

export function resolveImageModelCapability(options: {
    readonly model: string;
    readonly operation: ImageOperation;
    readonly provider?: ImageCapabilityProvider;
    readonly service?: ImageCapabilityService;
}): ResolvedImageModelCapability {
    const model = String(options.model || "").trim();
    const provider = options.provider;
    const configured = configuredImageProfile(provider?.imageCapabilityProfiles, model, options.operation);
    if (configured.kind === "resolved") {
        const specializedId = specializeXaiImagineProfile(configured.id, model);
        const compatibility = imageCapabilityProfileCompatibility(provider, specializedId);
        if (!compatibility.compatible) {
            return resolvedDynamic(
                unavailableProfile(options.operation, "profile-adapter-mismatch", compatibility.reason),
                model,
                provider,
                true,
                "configured profile adapter mismatch",
            );
        }
        return resolvedProfile(
            specializedId,
            model,
            provider,
            true,
            specializedId === configured.id
                ? "explicit imageCapabilityProfiles mapping"
                : "explicit imageCapabilityProfiles mapping specialized to Imagine 2.0 official fields",
        );
    }
    if (configured.kind === "mismatch") {
        return resolvedDynamic(
            unavailableProfile(options.operation, "profile-operation-mismatch", "配置的图片 capability profile 与请求 operation 不一致"),
            model,
            provider,
            true,
            "configured profile operation mismatch",
        );
    }

    const adapter = nativeImageAdapterType(provider);
    if (adapter === "openai") return resolveOpenAI(model, options.operation, provider);
    if (adapter === "agnes") return resolveAgnes(model, options.operation, provider);
    if (adapter === "dashscope") return resolveDashscope(model, options.operation, provider);
    if (adapter === "ark") return resolveArk(model, options.operation, provider);
    if (adapter === "sensenova") return resolveSenseNova(model, options.operation, provider);
    if (adapter === "sensenova-miaohua") return resolveMiaohua(model, options.operation, provider);
    if (adapter === "civitai") return resolveCivitai(model, options.operation, provider, options.service);
    if (adapter === "fal") return resolveFal(model, options.operation, provider);

    // An empty adapterType is the application's established OpenAI-compatible
    // passthrough mode. Preserve known Images API model contracts (OpenAI plus
    // the verified xAI/Gemini relay-translated cases) while keeping opaque
    // model IDs conservative. A non-empty, unrecognized adapter is not
    // assumed to be OpenAI-compatible.
    const passthroughKey = normalizeModelKey(model);
    if (!String(provider?.adapterType || "").trim() && (isKnownOpenAIImageModel(model) || isXaiImageModelKey(passthroughKey) || isGeminiImageModelKey(passthroughKey))) {
        return resolveOpenAI(model, options.operation, provider);
    }

    return resolvedDynamic(unknownCustomProfile(options.operation), model, provider, false, "custom endpoint without an explicit image profile");
}

export function validateImageModelRequest(
    capability: ResolvedImageModelCapability | ImageCapabilityProfile,
    request: ImageRequestValidationInput,
): ImageRequestValidationResult {
    const errors: ImageCapabilityIssue[] = [];
    const warnings: ImageCapabilityIssue[] = [];
    const addError = (code: ImageCapabilityIssueCode, field: ImageCapabilityIssue["field"], message: string) => errors.push({ code, field, message });
    const addWarning = (code: ImageCapabilityIssueCode, field: ImageCapabilityIssue["field"], message: string) => warnings.push({ code, field, message });
    const subject = capabilitySubject(capability);

    if (request.operation !== capability.operation) {
        addError("operation_mismatch", "operation", `${subject} 的 profile 是 ${capability.operation}，不能处理 ${request.operation}`);
    }
    const prompt = typeof request.prompt === "string" ? request.prompt : "";
    if (capability.serialization.kind === "openai-images-variation" && prompt.trim()) {
        addError("prompt_invalid", "prompt", `${subject} 的 legacy variation 合同不接受 prompt`);
    }
    if (capability.serialization.kind === "openai-responses-image-tool" && !prompt.trim()) {
        addError("prompt_invalid", "prompt", `${subject} 需要非空 prompt`);
    }
    if (capability.availability.state === "unsupported") {
        addError("operation_unsupported", "operation", `${subject}：${capability.availability.reason}`);
    } else if (capability.availability.state === "unknown") {
        if (capability.requiresExplicitProfile || request.operation !== "generate") {
            addError("explicit_profile_required", "operation", `${subject}：${capability.availability.reason}；请显式配置 imageCapabilityProfiles`);
        } else {
            addWarning("operation_unverified", "operation", `${subject}：${capability.availability.reason}`);
        }
    }

    const outputCount = request.outputCount ?? 1;
    validateOutputCount(imageOutputCountCapability(capability, request.sequential === true), outputCount, subject, addError, addWarning);

    const referenceCount = request.referenceCount ?? 0;
    if (!Number.isInteger(referenceCount) || referenceCount < 0) {
        addError("invalid_reference_count", "referenceCount", `参考图数量必须是大于或等于 0 的整数，当前为 ${String(referenceCount)}`);
    } else if (referenceCount > 0 && (capability.requiresExplicitProfileForReferences || capability.requiresExplicitProfile)) {
        addError("explicit_profile_required", "referenceCount", `${subject} 的参考图合同未知；不会把它猜成 OpenAI、Agnes 或其他 provider，请显式配置 imageCapabilityProfiles`);
    } else {
        validateReferenceCount(capability.referenceCount, referenceCount, subject, addError, addWarning);
    }

    if (request.hasMask) {
        if (referenceCount < 1) addError("mask_requires_reference", "mask", "mask 必须和至少 1 张参考图一起提交");
        if (capability.mask.state === "unsupported") addError("mask_unsupported", "mask", `${subject}：${capability.mask.reason}`);
        if (capability.mask.state === "unknown") addError("mask_unverified", "mask", `${subject}：${capability.mask.reason}；不会静默丢弃 mask`);
    }

    validateSize(capability.size, request, subject, addError, addWarning);
    validateSequentialImageMode(capability, request, subject, addError);
    validateEnumField("quality", capability.quality, request.quality, subject, addError);
    validateEnumField("outputFormat", capability.outputFormat, request.outputFormat, subject, addError);
    validateAdvancedFields(capability.advancedFields, request, subject, addError);

    return { ok: errors.length === 0, errors, warnings };
}

export function planImageOutputRequests(
    capability: ResolvedImageModelCapability | ImageCapabilityProfile,
    requestedOutputCount: number,
    options: { readonly sequential?: boolean } = {},
): ImageOutputRequestPlan {
    const errors: ImageCapabilityIssue[] = [];
    const warnings: ImageCapabilityIssue[] = [];
    const addError = (code: ImageCapabilityIssueCode, field: ImageCapabilityIssue["field"], message: string) => errors.push({ code, field, message });
    const addWarning = (code: ImageCapabilityIssueCode, field: ImageCapabilityIssue["field"], message: string) => warnings.push({ code, field, message });
    const outputCapability = imageOutputCountCapability(capability, options.sequential === true);
    validateOutputCount(outputCapability, requestedOutputCount, capabilitySubject(capability), addError, addWarning);
    if (errors.length || !Number.isInteger(requestedOutputCount) || requestedOutputCount < 1) {
        return { ok: false, transport: outputCapability.state === "supported" ? outputCapability.transport : "unknown", expectedOutputCount: requestedOutputCount, batches: [], errors, warnings };
    }
    if (outputCapability.state !== "supported") {
        return {
            ok: true,
            transport: "unknown",
            expectedOutputCount: requestedOutputCount,
            batches: [{ providerOutputCount: requestedOutputCount, repeat: 1 }],
            errors,
            warnings,
        };
    }
    if (outputCapability.transport === "client-fanout") {
        return {
            ok: true,
            transport: "client-fanout",
            expectedOutputCount: requestedOutputCount,
            batches: [{ providerOutputCount: 1, repeat: requestedOutputCount }],
            errors,
            warnings,
        };
    }
    return {
        ok: true,
        transport: "native-batch",
        expectedOutputCount: requestedOutputCount,
        batches: [{ providerOutputCount: requestedOutputCount, repeat: 1 }],
        errors,
        warnings,
    };
}

/** Exact count contract used by validation and the settings UI. */
export function imageOutputCountCapability(
    capability: ResolvedImageModelCapability | ImageCapabilityProfile,
    sequential: boolean,
): ImageOutputCountCapability {
    const field = capability.advancedFields.sequential;
    if (field.state !== "supported" || field.kind !== "boolean") return capability.outputCount;
    return nativeBatch(1, sequential ? 12 : 4, sequential
        ? "Sequential image-set mode treats n as a maximum and may return fewer images"
        : "Normal mode returns n images");
}

const IMAGE_OPERATIONS: readonly ImageOperation[] = ["generate", "edit", "variation", "responses-tool"];

/**
 * Relay-only gpt-image-2 variants, verified live against an OpenAI-compatible
 * relay (api.klong.lat, 2026-08-14): gpt-image-2, gpt-image-2-high and
 * gpt-image-2-c returned standard Images API generations; gpt-image-2-vip
 * routed through the same contract but its upstream was temporarily
 * unavailable (503 model_temporarily_unavailable) at test time. These IDs do
 * not exist on the official OpenAI host, so they only resolve on other hosts.
 */
const GPT_IMAGE_2_RELAY_VARIANTS: ReadonlySet<string> = new Set(["gpt-image-2-c", "gpt-image-2-high", "gpt-image-2-vip"]);

function resolveOpenAI(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    const key = normalizeModelKey(model);
    if (operation === "responses-tool") {
        return resolvedDynamic(
            unknownNativeProfile(operation, "Responses image_generation tool 必须为具体 Responses 模型显式配置 capability profile"),
            model,
            provider,
            false,
            "Responses tool is not inferred from an arbitrary OpenAI model",
        );
    }
    if (key === "dall-e-2" || key === "dalle-2" || key === "dall-e-3" || key === "dalle-3") {
        if (urlHostname(provider?.baseUrl) === "api.openai.com") {
            return resolvedDynamic(
                removedOpenAIProfile(operation, key),
                model,
                provider,
                false,
                "official OpenAI endpoint after DALL-E removal",
            );
        }
        const legacy = legacyDallEProfile(key, operation);
        return legacy
            ? resolvedProfile(legacy, model, provider, false, "explicit OpenAI-compatible legacy relay contract")
            : unsupportedResolved(operation, model, provider, "该 DALL-E 模型没有此历史 operation");
    }
    // Relay-only variants (gpt-image-2-high/-vip/-c) are verified on
    // OpenAI-compatible relays but do not exist on the official OpenAI host.
    // Official snapshot IDs (gpt-image-2-2026-04-21) and chatgpt-image-latest
    // share the GPT Image 2 Images API contract.
    if (isGptImage2ModelKey(key) || (urlHostname(provider?.baseUrl) !== "api.openai.com" && GPT_IMAGE_2_RELAY_VARIANTS.has(key))) {
        const id = operation === "generate" ? "openai-gpt-image-2-generate" : operation === "edit" ? "openai-gpt-image-2-edit" : undefined;
        return id ? resolvedProfile(id, model, provider, false, "OpenAI model ID") : unsupportedResolved(operation, model, provider, "GPT Image 2 不支持该 operation");
    }
    if (key === "gpt-image-1" || key === "gpt-image-1-5" || key === "gpt-image-1-mini") {
        const id = operation === "generate" ? "openai-gpt-image-legacy-generate" : operation === "edit" ? "openai-gpt-image-legacy-edit" : undefined;
        return id ? resolvedProfile(id, model, provider, false, "OpenAI legacy GPT Image model ID") : unsupportedResolved(operation, model, provider, "该 GPT Image 旧模型不支持此 operation");
    }
    // Grok/Gemini image models never exist on the official OpenAI host; only
    // recognize them on OpenAI-compatible relays/passthrough endpoints.
    if (urlHostname(provider?.baseUrl) !== "api.openai.com") {
        if (isXaiImageModelKey(key)) {
            if (operation === "generate") {
                return resolvedProfile(
                    isXaiImagine2ModelKey(key) ? "xai-grok-imagine-2-generate" : "xai-grok-image-generate",
                    model,
                    provider,
                    false,
                    isXaiImagine2ModelKey(key)
                        ? "xAI Imagine 2.0 generation: n 1-10, aspect_ratio, resolution 1k|2k, quality low|medium"
                        : "xAI Grok image model ID on an OpenAI-compatible endpoint",
                );
            }
            if (operation === "edit") {
                if (key.startsWith("grok-imagine-image")) {
                    return resolvedProfile(
                        isXaiImagine2ModelKey(key) ? "xai-grok-imagine-2-edit" : "xai-grok-imagine-edit",
                        model,
                        provider,
                        false,
                        "xAI Grok Imagine edit uses the official JSON /images/edits contract (not OpenAI multipart)",
                    );
                }
                return unsupportedResolved(operation, model, provider, "grok-2-image 已被 xAI 官方模型清单移除，其编辑合同未经官方发布；grok-imagine-image* 才支持编辑");
            }
            return unsupportedResolved(operation, model, provider, "xAI Grok 图片模型只验证了文生图与 JSON 编辑合同");
        }
        if (isGeminiImageModelKey(key)) {
            if (key === "imagen" || key.startsWith("imagen-")) {
                return resolvedDynamic(
                    unknownNativeProfile(operation, "识别为 Google Imagen 模型；Imagen 系已被官方弃用并将于 2026-08-17 停服，不会自动映射合同；请改用 Gemini 图片模型或显式配置 imageCapabilityProfiles"),
                    model,
                    provider,
                    false,
                    "Imagen recognized; officially deprecated with shutdown on 2026-08-17, no contract is auto-mapped",
                );
            }
            if (operation === "generate") return resolvedProfile("google-gemini-chat-image-generate", model, provider, false, "Gemini image model on an OpenAI-compatible relay; chat/completions is the live-verified path (relay-implemented, not the official Google OpenAI layer)");
            if (operation === "edit") return resolvedProfile("google-gemini-chat-image-edit", model, provider, false, "Gemini image model edit on an OpenAI-compatible relay; chat/completions with image_url parts is the live-verified path");
            return unsupportedResolved(operation, model, provider, "Gemini 图片模型在中转上只验证了 chat/completions 的生成与编辑；不支持该 operation");
        }
    }
    return unknownNativeResolved(operation, model, provider, "OpenAI adapter 下未识别的图片模型");
}

function resolveAgnes(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    const key = normalizeModelKey(model);
    const version = key.startsWith("agnes-image-2-1") ? "2.1" : key.startsWith("agnes-image-2-0") ? "2.0" : "";
    if (!version) return unknownNativeResolved(operation, model, provider, "Agnes 图片模型版本未识别");
    if (operation !== "generate" && operation !== "edit") return unsupportedResolved(operation, model, provider, "Agnes Image 2.x 仅验证了生成与多图合成");
    return resolvedProfile(`agnes-image-${version}-${operation}` as ImageCapabilityProfileId, model, provider, false, `Agnes ${version} model ID`);
}

function resolveDashscope(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    const key = normalizeModelKey(model);
    let id: ImageCapabilityProfileId | undefined;
    if (key === "z-image-turbo") id = operation === "generate" ? "dashscope-z-image-generate" : undefined;
    else if (key === "qwen-image") {
        if (operation === "generate") id = "dashscope-qwen-single-generate";
    } else if (key.startsWith("qwen-image-max") || key.startsWith("qwen-image-plus")) {
        if (operation === "generate") id = "dashscope-qwen-single-generate";
    } else if (key === "qwen-image-edit") {
        if (operation === "edit") id = "dashscope-qwen-legacy-edit";
    } else if (key.startsWith("qwen-image-edit-max") || key.startsWith("qwen-image-edit-plus")) {
        if (operation === "edit") id = "dashscope-qwen-max-plus-edit";
    } else if (key.startsWith("qwen-image-2-") || key.startsWith("qwen-image-3-")) {
        if (operation === "generate") id = "dashscope-qwen-multi-generate";
        else if (operation === "edit") id = "dashscope-qwen-multi-edit";
    } else if (key === "wan2-7-image" || key.startsWith("wan2-7-image-")) {
        if (operation === "generate") id = key.includes("-pro") ? "dashscope-wan-2.7-pro-generate" : "dashscope-wan-2.7-generate";
        else if (operation === "edit") id = "dashscope-wan-2.7-edit";
    } else if (key === "wan2-6-image") {
        if (operation === "generate") id = "dashscope-wan-2.6-generate";
        else if (operation === "edit") id = "dashscope-wan-2.6-edit";
    } else if (key === "wan2-6-t2i") {
        if (operation === "generate") id = "dashscope-wan-2.6-t2i-generate";
    }
    if (id) return resolvedProfile(id, model, provider, false, "DashScope model ID and operation");
    if (isKnownImageModelKey(key)) return unsupportedResolved(operation, model, provider, "该 DashScope 图片模型没有此 operation");
    return unknownNativeResolved(operation, model, provider, "DashScope 图片模型合同未识别");
}

function resolveFal(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    const key = normalizeModelKey(model);
    const family = /nano-banana/.test(key)
        ? "banana"
        : /seedream/.test(key)
          ? "seedream"
          : /flux[-/]?2[-/]?lora/.test(key)
            ? "flux2-lora"
            : /flux[-/]lora/.test(key)
              ? "flux1-lora"
              : /flux[-/]?2/.test(key)
                ? "flux2"
                : /schnell/.test(key)
                  ? "schnell"
                  : /flux[-/](?:dev|pro)\b|^flux-dev$|^flux-pro$/.test(key)
                    ? "flux1"
                    : "";
    if (!family) return unknownNativeResolved(operation, model, provider, "Fal 图片模型合同未识别");
    if (operation !== "generate" && operation !== "edit") {
        return unsupportedResolved(operation, model, provider, "Fal 图片适配器当前只验证了 generate 与 edit");
    }
    if (family === "flux1-lora") {
        if (operation === "edit") return unsupportedResolved(operation, model, provider, "Fal FLUX.1 LoRA 官方 endpoint 仅发布了 text-to-image；未猜测 image-to-image");
        return resolvedProfile("fal-flux-lora-generate", model, provider, false, "Fal FLUX.1 LoRA model ID");
    }
    if (family === "flux2-lora") {
        if (operation === "edit") return unsupportedResolved(operation, model, provider, "Fal FLUX.2 LoRA 官方 endpoint 仅发布了 text-to-image；未猜测 image-to-image");
        return resolvedProfile("fal-flux2-lora-generate", model, provider, false, "Fal FLUX.2 LoRA model ID");
    }
    if (family === "schnell") {
        if (operation === "edit") return unsupportedResolved(operation, model, provider, "fal 没有 flux-schnell 的编辑/图生图端点；flux-dev 起才提供 image-to-image");
        return resolvedProfile("fal-flux-schnell-generate", model, provider, false, "Fal flux-schnell model ID");
    }
    if (family === "flux1") {
        return resolvedProfile(operation === "edit" ? "fal-flux-dev-edit" : "fal-flux-dev-generate", model, provider, false, "Fal flux-1 dev/pro model ID");
    }
    if (family === "flux2") {
        return resolvedProfile(operation === "edit" ? "fal-flux2-edit" : "fal-flux2-generate", model, provider, false, "Fal FLUX.2 model ID");
    }
    if (family === "banana") {
        return resolvedProfile(operation === "edit" ? "fal-banana-edit" : "fal-banana-generate", model, provider, false, "Fal nano-banana model ID");
    }
    return resolvedProfile(operation === "edit" ? "fal-seedream-edit" : "fal-seedream-generate", model, provider, false, "Fal Seedream model ID");
}

function resolveArk(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    const key = normalizeModelKey(model);
    const isImageModel = key.includes("seedream") || key.startsWith("ark-") || key.includes("doubao");
    if (!isImageModel) return unknownNativeResolved(operation, model, provider, "Ark 图片模型合同未识别");
    if (operation === "generate") return resolvedProfile("ark-seedream-generate", model, provider, false, "Ark Seedream / Endpoint ID");
    if (operation === "edit") return resolvedProfile("ark-seedream-edit", model, provider, false, "Ark Seedream / Endpoint ID");
    return resolvedProfile("ark-seedream-generate", model, provider, false, "Ark Seedream / Endpoint ID");
}

function resolveSenseNova(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    if (normalizeModelKey(model) !== "sensenova-u1-fast") return unknownNativeResolved(operation, model, provider, "Token Plan SenseNova 图片模型合同未识别");
    return operation === "generate"
        ? resolvedProfile("sensenova-u1-generate", model, provider, false, "SenseNova U1 Fast model ID")
        : unsupportedResolved(operation, model, provider, "SenseNova U1 Fast 官方合同仅支持文生图；秒画是另一个 adapter 和端点");
}

function resolveMiaohua(model: string, operation: ImageOperation, provider?: ImageCapabilityProvider) {
    if (operation === "generate") return resolvedProfile("sensenova-miaohua-generate", model, provider, false, "Miaohua adapter");
    if (operation === "edit") return resolvedProfile("sensenova-miaohua-edit", model, provider, false, "Miaohua standard I2I adapter");
    return unsupportedResolved(operation, model, provider, "秒画标准生图端点不支持该 operation；inpaint 等能力使用独立端点/profile");
}

export function isExactCivitaiOpenAIGptImage2Service(service: ImageCapabilityService | undefined) {
    if (!service?.id) return false;
    const id = service.id.trim().toLowerCase();
    const engine = String(service.parameters?.engine || "").trim().toLowerCase();
    const model = String(service.parameters?.model || "").trim().toLowerCase();
    const operation = String(service.parameters?.operation || "").trim().toLowerCase();
    if (engine !== "openai" || model !== "gpt-image-2") return false;
    return (operation === "createimage" && id === "image/openai/gpt-image-2/createimage")
        || (operation === "editimage" && id === "image/openai/gpt-image-2/editimage");
}

const CIVITAI_Z_IMAGE_CREATE_SERVICE = /^image\/sdcpp\/zimage\/(turbo|base)\/createimage$/;

/**
 * Studio catalog engines are short ids (`krea2-turbo`), while size contracts
 * are keyed off live OpenAPI service ids (`image/comfy/krea2/turbo/createImage`).
 * Without this mapping, generate UI hid aspect chips and sent the 1:1 default.
 */
const CIVITAI_CATALOG_ENGINE_SERVICES: Readonly<Record<string, ImageCapabilityService>> = {
    "krea2-turbo": { id: "image/comfy/krea2/turbo/createImage", step: "imageGen", parameters: { engine: "comfy", ecosystem: "krea2", model: "turbo", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "krea2-raw": { id: "image/comfy/krea2/raw/createImage", step: "imageGen", parameters: { engine: "comfy", ecosystem: "krea2", model: "raw", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    flux1: { id: "image/comfy/flux1/createImage", step: "imageGen", parameters: { engine: "comfy", ecosystem: "flux1", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "flux2-klein": { id: "image/flux2/klein/createImage/9b", step: "imageGen", parameters: { engine: "flux2", model: "klein", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "flux2-pro": { id: "image/flux2/pro/createImage", step: "imageGen", parameters: { engine: "flux2", model: "pro", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "flux2-dev": { id: "image/flux2/dev/createImage", step: "imageGen", parameters: { engine: "flux2", model: "dev", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "z-image-turbo": { id: "image/sdcpp/zImage/turbo/createImage", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "zImage", model: "turbo", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "civitai-grok": { id: "image/grok/v1.0/createImage", step: "imageGen", parameters: { engine: "grok", version: "v1.0", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    sdxl: { id: "image/sdcpp/sdxl/createImage", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "sdxl", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    anima: { id: "image/sdcpp/anima/createImage", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "anima", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "qwen-3.0-pro": { id: "image/qwen/createImage/3.0-pro", step: "imageGen", parameters: { engine: "qwen", model: "3.0-pro", operation: "createImage" }, modalities: { input: ["text"], output: ["image"] } },
    "seedream-4.5": { id: "image/seedream/v4.5", step: "imageGen", parameters: { engine: "seedream", version: "v4.5" }, modalities: { input: ["text", "image"], output: ["image"] } },
    "seedream-5.0-pro": { id: "image/seedream/v5.0-pro", step: "imageGen", parameters: { engine: "seedream", version: "v5.0-pro" }, modalities: { input: ["text", "image"], output: ["image"] } },
};

function civitaiCatalogEngineService(model: string, operation: ImageOperation): ImageCapabilityService | undefined {
    const key = String(model || "").trim().toLowerCase();
    const generate = CIVITAI_CATALOG_ENGINE_SERVICES[key];
    if (!generate) return undefined;
    if (operation === "generate") return generate;
    if (operation === "edit") {
        if (key === "krea2-turbo" || key === "krea2-raw") {
            return { id: "image/comfy/krea2/edit/editImage", step: "imageGen", parameters: { engine: "comfy", ecosystem: "krea2", model: "edit", operation: "editImage" }, modalities: { input: ["text", "image"], output: ["image"] } };
        }
        if (key === "flux2-klein") {
            return { id: "image/flux2/klein/editImage/9b", step: "imageGen", parameters: { engine: "flux2", model: "klein", operation: "editImage" }, modalities: { input: ["text", "image"], output: ["image"] } };
        }
        if (key === "flux2-pro") {
            return { id: "image/flux2/pro/editImage", step: "imageGen", parameters: { engine: "flux2", model: "pro", operation: "editImage" }, modalities: { input: ["text", "image"], output: ["image"] } };
        }
        if (key === "flux2-dev") {
            return { id: "image/flux2/dev/editImage", step: "imageGen", parameters: { engine: "flux2", model: "dev", operation: "editImage" }, modalities: { input: ["text", "image"], output: ["image"] } };
        }
        if (key === "civitai-grok") {
            return { id: "image/grok/v1.0/editImage", step: "imageGen", parameters: { engine: "grok", version: "v1.0", operation: "editImage" }, modalities: { input: ["text", "image"], output: ["image"] } };
        }
        if (key === "qwen-3.0-pro") {
            return { id: "image/qwen/editImage/3.0-pro", step: "imageGen", parameters: { engine: "qwen", model: "3.0-pro", operation: "editImage" }, modalities: { input: ["text", "image"], output: ["image"] } };
        }
        if (key === "flux1") {
            return { id: "image/comfy/flux1/createVariant", step: "imageGen", parameters: { engine: "comfy", ecosystem: "flux1", operation: "createVariant" }, modalities: { input: ["image"], output: ["image"] } };
        }
        if (key === "sdxl") {
            return { id: "image/sdcpp/sdxl/createVariant", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "sdxl", operation: "createVariant" }, modalities: { input: ["image"], output: ["image"] } };
        }
        if (key === "seedream-4.5" || key === "seedream-5.0-pro") return generate;
        return undefined;
    }
    if (operation === "variation") {
        if (key === "flux1") {
            return { id: "image/comfy/flux1/createVariant", step: "imageGen", parameters: { engine: "comfy", ecosystem: "flux1", operation: "createVariant" }, modalities: { input: ["image"], output: ["image"] } };
        }
        if (key === "sdxl") {
            return { id: "image/sdcpp/sdxl/createVariant", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "sdxl", operation: "createVariant" }, modalities: { input: ["image"], output: ["image"] } };
        }
        if (key === "flux2-klein") {
            return { id: "image/sdcpp/flux2Klein/createVariant/9b", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "flux2Klein", operation: "createVariant" }, modalities: { input: ["image"], output: ["image"] } };
        }
        if (key === "flux2-dev") {
            return { id: "image/sdcpp/flux2Dev/createVariant", step: "imageGen", parameters: { engine: "sdcpp", ecosystem: "flux2Dev", operation: "createVariant" }, modalities: { input: ["image"], output: ["image"] } };
        }
    }
    return undefined;
}

function isExactCivitaiZImageCreateService(id: string, service: ImageCapabilityService | undefined) {
    const match = CIVITAI_Z_IMAGE_CREATE_SERVICE.exec(id);
    if (!match) return false;
    if (!service) return true;
    const engine = String(service.parameters?.engine || "").trim().toLowerCase();
    const ecosystem = String(service.parameters?.ecosystem || "").trim().toLowerCase();
    const model = String(service.parameters?.model || "").trim().toLowerCase();
    const operation = String(service.parameters?.operation || "").trim().toLowerCase();
    return engine === "sdcpp" && ecosystem === "zimage" && model === match[1] && operation === "createimage";
}

function isCivitaiZImageFamily(id: string, service: ImageCapabilityService | undefined) {
    const engine = String(service?.parameters?.engine || "").trim().toLowerCase();
    const ecosystem = String(service?.parameters?.ecosystem || "").trim().toLowerCase();
    return id.startsWith("image/sdcpp/zimage/") || (engine === "sdcpp" && ecosystem === "zimage");
}

function resolveCivitai(
    model: string,
    operation: ImageOperation,
    provider: ImageCapabilityProvider | undefined,
    service: ImageCapabilityService | undefined,
) {
    service = service || civitaiCatalogEngineService(model, operation);
    const id = String(service?.id || model).trim().toLowerCase();
    const parameters = service?.parameters || {};
    const engine = String(parameters.engine || "").toLowerCase();
    const declaredOperation = String(parameters.operation || operationFromServiceId(id)).toLowerCase();
    const optionalImages = engine === "seedream" || engine === "google" || engine === "flux1-kontext" || service?.modalities?.input?.includes("image");
    if (isCivitaiFalKrea2Service(service) && declaredOperation === "createimage") {
        if (operation !== "generate") {
            return unsupportedResolved(operation, model, provider, "Civitai Krea FAL createImage 不是 edit 合同；风格参考走 imageStyleReferences，不会改成 Comfy editImage");
        }
        return resolvedCivitaiServiceProfile("civitai-generic-generate", model, provider, service, "Civitai Krea FAL createImage service");
    }
    if (isCivitaiZImageFamily(id, service)) {
        if (!isExactCivitaiZImageCreateService(id, service) || declaredOperation !== "createimage") {
            return unsupportedResolved(operation, model, provider, "Civitai Z-Image 仅有 Turbo/Base createImage 目录合同，不支持编辑或变体路径");
        }
        return operation === "generate"
            ? resolvedProfile("civitai-z-image-generate", model, provider, false, "exact Civitai Z-Image Turbo/Base createImage service")
            : unsupportedResolved(operation, model, provider, "Civitai Z-Image 仅声明 createImage");
    }
    if (declaredOperation === "createvariant") {
        if (operation !== "variation") return unsupportedResolved(operation, model, provider, "该 Civitai service 仅声明 createVariant");
        return resolvedCivitaiServiceProfile("civitai-generic-variation", model, provider, service, "Civitai createVariant service");
    }
    if (declaredOperation === "editimage" || declaredOperation === "proeditimage" || declaredOperation === "image-to-image") {
        if (operation !== "edit") return unsupportedResolved(operation, model, provider, "该 Civitai service 仅声明图生图/编辑");
        return resolvedCivitaiServiceProfile("civitai-generic-edit", model, provider, service, "Civitai editImage service");
    }
    if ((declaredOperation === "createimage" || declaredOperation === "text-to-image" || declaredOperation === "procreateimage") && !optionalImages && operation !== "generate") {
        return unsupportedResolved(operation, model, provider, "该 Civitai service 是纯 createImage，不接受参考图");
    }
    if ((id.includes("/imagen") || parameters.model?.toLowerCase().includes("imagen")) && operation === "edit") {
        return unsupportedResolved(operation, model, provider, "Civitai Google Imagen service 是纯文生图，不接受参考图");
    }
    if (operation === "generate") return resolvedCivitaiServiceProfile("civitai-generic-generate", model, provider, service, "Civitai image service");
    if (operation === "edit" && optionalImages) return resolvedCivitaiServiceProfile("civitai-generic-edit", model, provider, service, "Civitai image-capable service");
    return unsupportedResolved(operation, model, provider, "Civitai service 目录没有声明此 operation");
}

type ProfileFactoryInput<O extends ImageOperation> = Omit<
    ImageCapabilityProfileBase<O>,
    "availability" | "lifecycle" | "advancedFields" | "storyIdentityReferenceStrategy" | "storyPromptConstraintStyle"
> & Partial<Pick<ImageCapabilityProfileBase<O>, "availability" | "lifecycle" | "advancedFields" | "storyIdentityReferenceStrategy" | "storyPromptConstraintStyle">>;

function profile<O extends ImageOperation>(input: ProfileFactoryInput<O>): ImageCapabilityProfileBase<O> {
    return {
        ...input,
        availability: input.availability || { state: "supported" },
        lifecycle: input.lifecycle || "active",
        advancedFields: input.advancedFields || unknownAdvancedFields(),
        storyIdentityReferenceStrategy: input.storyIdentityReferenceStrategy || "shot-angle",
        storyPromptConstraintStyle: input.storyPromptConstraintStyle || "explicit-exclusions",
    };
}

function evidence(kind: ImageCapabilityEvidence["kind"], url: string, note: string): ImageCapabilityEvidence {
    return { kind, url, note };
}

function unsupported(reason: string) {
    return { state: "unsupported" as const, reason };
}

function unknown(reason: string) {
    return { state: "unknown" as const, reason };
}

function nativeBatch(min: number, max: number | null, note?: string): ImageOutputCountCapability {
    return { state: "supported", min, max, perRequestMax: max, transport: "native-batch", ...(note ? { note } : {}) };
}

function clientFanout(max: number | null, note?: string): ImageOutputCountCapability {
    return {
        state: "supported",
        min: 1,
        max,
        perRequestMax: 1,
        transport: "client-fanout",
        ...(note ? { note } : {}),
    };
}

function references(min: number, max: number | null, note?: string): ImageReferenceCountCapability {
    return { state: "supported", min, max, ordered: true, ...(note ? { note } : {}) };
}

function supportedMask(appliesTo: Extract<ImageMaskCapability, { state: "supported" }>["appliesTo"], note?: string): ImageMaskCapability {
    return { state: "supported", appliesTo, ...(note ? { note } : {}) };
}

function enumField(
    values: readonly string[],
    options: { readonly requestable?: boolean; readonly note?: string } = {},
): ImageEnumFieldCapability {
    return { state: "supported", values, ...options };
}

function dimensions(options: Omit<Extract<ImageSizeCapability, { kind: "dimensions" }>, "state" | "kind">): ImageSizeCapability {
    return { state: "supported", kind: "dimensions", ...options };
}

function enumSize(
    values: readonly string[],
    options: Omit<Extract<ImageSizeCapability, { kind: "enum" }>, "state" | "kind" | "values"> = {},
): ImageSizeCapability {
    return { state: "supported", kind: "enum", values, ...options };
}

function tierAndRatio(
    tiers: readonly string[],
    ratios: readonly string[],
    options: Omit<Extract<ImageSizeCapability, { kind: "tier-and-ratio" }>, "state" | "kind" | "tiers" | "ratios"> = {},
): ImageSizeCapability {
    return { state: "supported", kind: "tier-and-ratio", tiers, ratios, ...options };
}

function serialization(
    input: Pick<ImageSerializationPolicy, "kind" | "endpoint"> & Partial<Omit<ImageSerializationPolicy, "kind" | "endpoint">>,
): ImageSerializationPolicy {
    return {
        quantityField: null,
        referenceField: null,
        maskField: null,
        sizeField: null,
        qualityField: null,
        outputFormatField: null,
        responseEncodingField: null,
        ...input,
    };
}

function unknownAdvancedFields(): ImageAdvancedFieldsCapability {
    return {
        negativePrompt: unknown("negativePrompt 未在该 profile 的已验证合同中"),
        steps: unknown("steps 未在该 profile 的已验证合同中"),
        cfgScale: unknown("CFG/guidance 未在该 profile 的已验证合同中"),
        seed: unknown("seed 未在该 profile 的已验证合同中"),
        sampler: unknown("sampler 未在该 profile 的已验证合同中"),
        scheduler: unknown("scheduler 未在该 profile 的已验证合同中"),
        sequential: unknown("sequential mode 未在该 profile 的已验证合同中"),
        clipSkip: unknown("clipSkip 未在该 profile 的已验证合同中"),
        loras: unknown("LoRA map 未在该 profile 的已验证合同中"),
    };
}

function agnesProfile<O extends "generate" | "edit">(
    id: ImageCapabilityProfileId,
    operation: O,
    size: ImageSizeCapability,
    evidenceItems: readonly ImageCapabilityEvidence[],
): ImageCapabilityProfileBase<O> {
    return profile({
        id,
        provider: "agnes",
        label: `Agnes Image ${id.includes("2.1") ? "2.1" : "2.0"} ${operation}`,
        operation,
        outputCount: clientFanout(null, "Agnes does not document n; requested multiple outputs must use independent single-output calls"),
        referenceCount: operation === "edit" ? references(1, null, "Official examples show multiple images but publish no maximum") : UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: UNKNOWN_OUTPUT_FORMAT,
        serialization: serialization({
            kind: "agnes-images-generate",
            endpoint: "/images/generations",
            referenceField: operation === "edit" ? "extra_body.image[]" : null,
            sizeField: id.includes("2.1") ? "size+ratio" : "size",
            responseEncodingField: "extra_body.response_format",
        }),
        storyIdentityReferenceStrategy: "shot-angle",
        storyPromptConstraintStyle: "positive-only",
        evidence: evidenceItems,
    });
}

function dashscopeProfile<O extends "generate" | "edit">(options: {
    readonly id: ImageCapabilityProfileId;
    readonly operation: O;
    readonly label: string;
    readonly outputCount: ImageOutputCountCapability;
    readonly referenceCount: ImageReferenceCountCapability;
    readonly size: ImageSizeCapability;
    readonly quantityField: ImageSerializationPolicy["quantityField"];
    readonly advancedFields?: ImageAdvancedFieldsCapability;
    readonly evidence: readonly ImageCapabilityEvidence[];
}): ImageCapabilityProfileBase<O> {
    return profile({
        id: options.id,
        provider: "dashscope",
        label: options.label,
        operation: options.operation,
        outputCount: options.outputCount,
        referenceCount: options.referenceCount,
        mask: UNSUPPORTED_MASK,
        size: options.size,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: enumField(["png"], { requestable: false, note: "The verified contracts return PNG and expose no output-format request field" }),
        ...(options.advancedFields ? { advancedFields: options.advancedFields } : {}),
        serialization: serialization({
            kind: "dashscope-multimodal-image",
            endpoint: "/services/aigc/multimodal-generation/generation",
            quantityField: options.quantityField,
            referenceField: options.operation === "edit" ? "input.messages[].content[].image" : null,
            sizeField: options.size.state === "unsupported" ? null : "parameters.size",
        }),
        evidence: options.evidence,
    });
}

function arkProfile<O extends "generate" | "edit">(id: ImageCapabilityProfileId, operation: O): ImageCapabilityProfileBase<O> {
    return profile({
        id,
        provider: "ark",
        label: `Ark Seedream ${operation}`,
        operation,
        outputCount: clientFanout(null, "Direct quantity is not a generic n field; sequential image generation is a distinct provider mode"),
        referenceCount: operation === "edit" ? references(1, null, "Multiple input images are official, but a cross-version maximum is not encoded") : UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: UNKNOWN_SIZE,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: UNKNOWN_OUTPUT_FORMAT,
        serialization: serialization({
            kind: "ark-images-generate",
            endpoint: "/api/v3/images/generations",
            referenceField: operation === "edit" ? "image[]-json" : null,
            sizeField: "size",
            responseEncodingField: "response_format",
        }),
        evidence: [ARK_IMAGE_API, ARK_SEEDREAM_GUIDE],
    });
}

function miaohuaProfile<O extends "generate" | "edit">(id: ImageCapabilityProfileId, operation: O): ImageCapabilityProfileBase<O> {
    return profile({
        id,
        provider: "sensenova-miaohua",
        label: `SenseTime Miaohua standard ${operation}`,
        operation,
        outputCount: nativeBatch(1, 8),
        referenceCount: operation === "edit" ? references(1, 1) : UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        size: MIAOHUA_SIZE,
        quality: UNSUPPORTED_QUALITY,
        outputFormat: enumField(["JPG", "PNG"]),
        serialization: serialization({
            kind: "sensenova-miaohua-image",
            endpoint: "/v1/imgenstd/imgen",
            quantityField: "samples",
            referenceField: operation === "edit" ? "img_url" : null,
            sizeField: "width+height",
            outputFormatField: "format",
        }),
        evidence: [SENSENOVA_MIAOHUA_DOC],
    });
}

function civitaiGenericProfile<O extends "generate" | "edit" | "variation">(
    id: ImageCapabilityProfileId,
    operation: O,
): ImageCapabilityProfileBase<O> {
    const referenceCount = operation === "generate"
        ? unsupported(civitaiPureTextToImageReferenceMessage())
        : operation === "variation"
          ? references(1, 1)
          : references(1, null, "The maximum must be resolved from the selected live service schema");
    return profile({
        id,
        provider: "civitai",
        label: `Civitai ${operation} service`,
        operation,
        outputCount: unknown("Civitai quantity limits are service-specific and require a resolved service"),
        referenceCount,
        mask: UNSUPPORTED_MASK,
        size: UNKNOWN_SIZE,
        // Civitai imageGen 合同只有 outputFormat，没有 quality 请求字段；
        // resolvedCivitaiServiceProfile 也不覆盖它，所以这里断言 unsupported 是事实而非猜测。
        quality: UNSUPPORTED_QUALITY,
        outputFormat: operation === "variation"
            ? unsupported("SDXL createVariant live OpenAPI 没有 outputFormat 字段")
            : enumField(["jpeg", "png", "webP"]),
        ...(operation === "variation" ? { advancedFields: CIVITAI_Z_ADVANCED_FIELDS } : {}),
        serialization: serialization({
            kind: "civitai-workflow",
            endpoint: "/v2/consumer/workflows",
            referenceField: operation === "generate" ? null : operation === "variation" ? "image[]-json" : "images[]",
            outputFormatField: operation === "variation" ? null : "outputFormat",
        }),
        evidence: [CIVITAI_IMAGE_OPENAPI],
    });
}

function configuredImageProfile(
    profiles: ImageCapabilityProvider["imageCapabilityProfiles"],
    model: string,
    operation: ImageOperation,
): { kind: "none" } | { kind: "resolved"; id: ImageCapabilityProfileId } | { kind: "mismatch" } {
    if (!profiles) return { kind: "none" };
    const modelKey = normalizeModelKey(model);
    const entry = profiles[model]
        ?? Object.entries(profiles).find(([candidate]) => normalizeModelKey(candidate) === modelKey)?.[1]
        ?? profiles["*"];
    if (entry === undefined) return { kind: "none" };
    if (isImageCapabilityProfileId(entry)) {
        return IMAGE_CAPABILITY_PROFILES[entry].operation === operation ? { kind: "resolved", id: entry } : { kind: "mismatch" };
    }
    if (!isRecord(entry)) return { kind: "mismatch" };
    if (!Object.prototype.hasOwnProperty.call(entry, operation)) return { kind: "none" };
    const id = entry[operation];
    if (id === undefined || id === null || (typeof id === "string" && !id.trim())) return { kind: "none" };
    return isImageCapabilityProfileId(id) && IMAGE_CAPABILITY_PROFILES[id].operation === operation
        ? { kind: "resolved", id }
        : { kind: "mismatch" };
}

function resolvedProfile(
    id: ImageCapabilityProfileId,
    model: string,
    provider: ImageCapabilityProvider | undefined,
    profileConfigured: boolean,
    resolutionReason: string,
): ResolvedImageModelCapability {
    return resolvedDynamic(IMAGE_CAPABILITY_PROFILES[id], model, provider, profileConfigured, resolutionReason);
}

function resolvedDynamic(
    capability: ImageCapabilityProfile,
    model: string,
    provider: ImageCapabilityProvider | undefined,
    profileConfigured: boolean,
    resolutionReason: string,
): ResolvedImageModelCapability {
    return {
        ...capability,
        model,
        providerLabel: String(provider?.displayName || provider?.name || "").trim() || capability.label,
        profileConfigured,
        resolutionReason,
    };
}

function unsupportedResolved(operation: ImageOperation, model: string, provider: ImageCapabilityProvider | undefined, reason: string) {
    return resolvedDynamic(unavailableProfile(operation, "unsupported-operation", reason), model, provider, false, "operation unsupported by resolved model profile");
}

function unknownNativeResolved(operation: ImageOperation, model: string, provider: ImageCapabilityProvider | undefined, reason: string) {
    return resolvedDynamic(unknownNativeProfile(operation, reason), model, provider, false, "native adapter with unknown model contract");
}

function unavailableProfile(operation: ImageOperation, id: ResolvedImageCapabilityId, reason: string): ImageCapabilityProfile {
    return dynamicProfile(operation, {
        id,
        availability: { state: "unsupported", reason },
        referenceCount: UNSUPPORTED_REFERENCES,
        mask: UNSUPPORTED_MASK,
        outputCount: unsupported(reason),
        size: unsupported(reason),
        requiresExplicitProfile: false,
    });
}

function unknownNativeProfile(operation: ImageOperation, reason: string): ImageCapabilityProfile {
    return dynamicProfile(operation, {
        id: "unknown-native-model",
        availability: { state: "unknown", reason },
        referenceCount: unknown(reason),
        mask: unknown(reason),
        outputCount: unknown(reason),
        size: unknown(reason),
        requiresExplicitProfile: true,
    });
}

function unknownCustomProfile(operation: ImageOperation): ImageCapabilityProfile {
    const reason = "该自定义 Endpoint 没有已验证的图片 capability profile";
    return dynamicProfile(operation, {
        id: "unknown-custom-endpoint",
        availability: { state: "unknown", reason },
        referenceCount: unknown(reason),
        mask: unknown(reason),
        outputCount: unknown(reason),
        size: unknown(reason),
        requiresExplicitProfile: true,
        requiresExplicitProfileForReferences: true,
    });
}

function dynamicProfile(
    operation: ImageOperation,
    overrides: {
        readonly id: ResolvedImageCapabilityId;
        readonly availability: ImageAvailability;
        readonly referenceCount: ImageReferenceCountCapability;
        readonly mask: ImageMaskCapability;
        readonly outputCount: ImageOutputCountCapability;
        readonly size: ImageSizeCapability;
        readonly requiresExplicitProfile?: boolean;
        readonly requiresExplicitProfileForReferences?: boolean;
    },
): ImageCapabilityProfile {
    return {
        id: overrides.id,
        provider: "custom",
        label: "Unverified image endpoint",
        operation,
        availability: overrides.availability,
        lifecycle: "active",
        outputCount: overrides.outputCount,
        referenceCount: overrides.referenceCount,
        mask: overrides.mask,
        size: overrides.size,
        quality: unknown("quality 合同未知"),
        outputFormat: unknown("output format 合同未知"),
        advancedFields: unknownAdvancedFields(),
        storyIdentityReferenceStrategy: "shot-angle",
        storyPromptConstraintStyle: "explicit-exclusions",
        serialization: serialization({ kind: "custom-profile", endpoint: "provider-specific" }),
        evidence: [],
        ...(overrides.requiresExplicitProfile ? { requiresExplicitProfile: true } : {}),
        ...(overrides.requiresExplicitProfileForReferences ? { requiresExplicitProfileForReferences: true } : {}),
    } as ImageCapabilityProfile;
}

function removedOpenAIProfile(operation: ImageOperation, model: string): ImageCapabilityProfile {
    const reason = `${model} 已于 2026-05-12 从 OpenAI API 移除`;
    return { ...unavailableProfile(operation, "unsupported-operation", reason), lifecycle: "removed", evidence: [OPENAI_DEPRECATIONS] } as ImageCapabilityProfile;
}

function legacyDallEProfile(model: string, operation: ImageOperation): ImageCapabilityProfileId | undefined {
    if (model.includes("3")) return operation === "generate" ? "openai-dall-e-3-generate" : undefined;
    if (operation === "generate") return "openai-dall-e-2-generate";
    if (operation === "edit") return "openai-dall-e-2-edit";
    if (operation === "variation") return "openai-dall-e-2-variation";
    return undefined;
}

type CivitaiImageSizeContract = {
    readonly size: ImageSizeCapability;
    readonly sizeField: ImageSerializationPolicy["sizeField"];
};

function civitaiDimensionSize(
    min: number,
    max: number,
    defaults: { readonly width: number; readonly height: number },
    options: { readonly required?: boolean; readonly multipleOf?: number } = {},
): ImageSizeCapability {
    return dimensions({
        required: options.required === true,
        boundsPublished: true,
        rules: {
            minWidth: min,
            minHeight: min,
            maxWidth: max,
            maxHeight: max,
            defaultWidth: defaults.width,
            defaultHeight: defaults.height,
            ...(options.multipleOf !== undefined ? { multipleOf: options.multipleOf } : {}),
        },
    });
}

function civitaiRequiredDimensionSize(min: number, max: number): ImageSizeCapability {
    return dimensions({
        required: true,
        boundsPublished: true,
        rules: { minWidth: min, minHeight: min, maxWidth: max, maxHeight: max },
    });
}

function civitaiEnumSize(
    values: readonly string[],
    options: { readonly required?: boolean; readonly default?: string; readonly allowAuto?: boolean } = {},
): ImageSizeCapability {
    return enumSize(values, {
        required: options.required === true,
        ...(options.default !== undefined ? { default: options.default } : {}),
        ...(options.allowAuto ? { allowAuto: true } : {}),
    });
}

function civitaiImageSizeCapability(
    service: ImageCapabilityService,
    operation: ImageOperation,
): CivitaiImageSizeContract {
    const id = String(service.id || "").toLowerCase();
    const engine = String(service.parameters?.engine || "").toLowerCase();
    const ecosystem = String(service.parameters?.ecosystem || "").toLowerCase();
    const model = String(service.parameters?.model || "").toLowerCase();
    const version = String(service.parameters?.version || "").toLowerCase();
    const widthHeight = (size: ImageSizeCapability): CivitaiImageSizeContract => ({ size, sizeField: "width+height" });
    const haystack = `${id} ${model} ${ecosystem} ${version}`;

    if (engine === "qwen") {
        return widthHeight(civitaiDimensionSize(512, 2048, { width: 1024, height: 1024 }));
    }
    if (engine === "openai") {
        if (haystack.includes("dall-e-3") || haystack.includes("dalle-3")) {
            return { size: civitaiEnumSize(CIVITAI_OPENAI_DALLE3_SIZES, { required: true }), sizeField: "size" };
        }
        if (haystack.includes("dall-e-2") || haystack.includes("dalle-2")) {
            return { size: civitaiEnumSize(CIVITAI_OPENAI_DALLE2_SIZES, { required: true }), sizeField: "size" };
        }
        if (haystack.includes("gpt-image-1.5") || haystack.includes("gpt-1.5")) {
            if (operation === "edit") {
                return {
                    size: civitaiEnumSize(["auto", ...CIVITAI_OPENAI_GPT1_SIZES], { default: "auto", allowAuto: true }),
                    sizeField: "size",
                };
            }
            return { size: civitaiEnumSize(CIVITAI_OPENAI_GPT1_SIZES, { default: "1024x1024" }), sizeField: "size" };
        }
        if (haystack.includes("gpt-image-1") || /(^|[^0-9])gpt-1([^0-9.]|$)/.test(haystack)) {
            return { size: civitaiEnumSize(CIVITAI_OPENAI_GPT1_SIZES, { default: "1024x1024" }), sizeField: "size" };
        }
        if (operation === "edit") {
            return widthHeight(dimensions({
                required: false,
                boundsPublished: true,
                rules: { minWidth: 256, minHeight: 256, maxWidth: 3840, maxHeight: 3840 },
            }));
        }
        return widthHeight(civitaiDimensionSize(256, 3840, { width: 1024, height: 1024 }));
    }
    if (engine === "gemini") {
        return { size: unsupported("Civitai Gemini imageGen 没有 size 请求字段"), sizeField: null };
    }
    if (engine === "google") {
        if (haystack.includes("nano-banana-2-lite")) {
            return { size: civitaiEnumSize(CIVITAI_NANO_BANANA_RATIOS, { default: "1:1" }), sizeField: "aspectRatio" };
        }
        if (haystack.includes("imagen4") || haystack.includes("imagen-4")) {
            return { size: civitaiEnumSize(CIVITAI_IMAGEN4_RATIOS, { default: "1:1" }), sizeField: "aspectRatio" };
        }
        return {
            size: tierAndRatio(CIVITAI_NANO_BANANA_TIERS, CIVITAI_NANO_BANANA_RATIOS, {
                required: false,
                defaultTier: "1K",
                defaultRatio: "1:1",
            }),
            sizeField: "aspectRatio+resolution",
        };
    }
    if (engine === "fal") {
        if (model === "krea2" || id.includes("/krea2/")) {
            return {
                size: tierAndRatio(CIVITAI_FAL_KREA2_TIERS, CIVITAI_FAL_KREA2_RATIOS, {
                    required: false,
                    defaultTier: "medium",
                    defaultRatio: "1:1",
                }),
                sizeField: "size+aspectRatio",
            };
        }
        if (model === "qwen2" || id.includes("/qwen2/")) {
            return { size: civitaiEnumSize(CIVITAI_FAL_QWEN2_IMAGE_SIZES, { default: "square_hd" }), sizeField: "imageSize" };
        }
        if (model === "maiimage" || model === "mai-image" || id.includes("/mai")) {
            return { size: civitaiEnumSize(CIVITAI_FAL_MAI_RATIOS, { default: "auto", allowAuto: true }), sizeField: "aspectRatio" };
        }
        if (model === "reve" || id.includes("/reve")) {
            return { size: civitaiEnumSize(CIVITAI_FAL_REVE_RATIOS, { default: "auto", allowAuto: true }), sizeField: "aspectRatio" };
        }
        return { size: UNKNOWN_SIZE, sizeField: null };
    }
    if (engine === "wan") {
        return { size: civitaiEnumSize(CIVITAI_FAL_QWEN2_IMAGE_SIZES, { default: "square_hd" }), sizeField: "imageSize" };
    }
    if (engine === "flux1-kontext") {
        return { size: civitaiEnumSize(CIVITAI_FLUX1_KONTEXT_RATIOS, { default: "1:1" }), sizeField: "aspectRatio" };
    }
    if (engine === "grok") {
        const grokV2 = version.startsWith("v2") || id.includes("/v2") || model.includes("v2");
        const grokV1 = version.startsWith("v1") || id.includes("/v1");
        if (operation === "edit" && grokV1 && !grokV2) {
            return { size: unsupported("Civitai Grok v1 editImage 没有 size 请求字段"), sizeField: null };
        }
        if (operation === "edit") {
            return {
                size: civitaiEnumSize(["auto", ...CIVITAI_GROK_RATIOS], { default: "auto", allowAuto: true }),
                sizeField: "aspectRatio",
            };
        }
        return { size: civitaiEnumSize(CIVITAI_GROK_RATIOS, { default: "1:1" }), sizeField: "aspectRatio" };
    }
    if (engine === "seedream") {
        return widthHeight(civitaiDimensionSize(256, 4096, { width: 1024, height: 1024 }));
    }
    if (engine === "flux2") {
        return widthHeight(civitaiDimensionSize(512, 2048, { width: 1024, height: 1024 }));
    }
    if (engine === "comfy") {
        if (ecosystem === "sd1" || id.includes("/sd1/")) {
            return widthHeight(civitaiDimensionSize(64, 1024, { width: 512, height: 512 }));
        }
        if (ecosystem === "hidream-o1" || id.includes("/hidream")) {
            return widthHeight(civitaiDimensionSize(64, 2048, { width: 2048, height: 2048 }));
        }
        if (ecosystem === "mageflow" || id.includes("/mageflow") || ecosystem === "flux2dev" || id.includes("/flux2")) {
            return widthHeight(civitaiDimensionSize(512, 2048, { width: 1024, height: 1024 }));
        }
        return widthHeight(civitaiDimensionSize(64, 2048, { width: 1024, height: 1024 }));
    }
    if (engine === "sdcpp") {
        if (ecosystem === "qwen" || id.includes("/qwen/20b/")) {
            return widthHeight(civitaiDimensionSize(64, 2048, { width: 1024, height: 1024 }, { multipleOf: 8 }));
        }
        if (ecosystem === "sd1" || id.includes("/sd1/")) {
            return widthHeight(civitaiDimensionSize(64, 2048, { width: 512, height: 512 }));
        }
        if (ecosystem === "flux1" || id.includes("/flux1")) {
            return widthHeight(civitaiDimensionSize(832, 1216, { width: 1024, height: 1024 }));
        }
        if (ecosystem === "flux2dev" || ecosystem === "flux2klein" || id.includes("/flux2")) {
            return widthHeight(civitaiDimensionSize(512, 2048, { width: 1024, height: 1024 }));
        }
        if (ecosystem === "zimage" || id.includes("/zimage/")) {
            return widthHeight(civitaiDimensionSize(64, 2048, { width: 1024, height: 1024 }, { multipleOf: 16 }));
        }
        return widthHeight(civitaiDimensionSize(64, 2048, { width: 1024, height: 1024 }));
    }
    return { size: UNKNOWN_SIZE, sizeField: null };
}

function resolvedCivitaiServiceProfile(
    baseId: "civitai-generic-generate" | "civitai-generic-edit" | "civitai-generic-variation",
    model: string,
    provider: ImageCapabilityProvider | undefined,
    service: ImageCapabilityService | undefined,
    reason: string,
): ResolvedImageModelCapability {
    const base = resolvedProfile(baseId, model, provider, false, reason);
    if (!service?.id) return base;
    const id = service.id.toLowerCase();
    const engine = String(service.parameters?.engine || "").toLowerCase();
    const ecosystem = String(service.parameters?.ecosystem || "").toLowerCase();
    const serviceOperation = String(service.parameters?.operation || "").toLowerCase();
    const isFlux2KleinVariant = engine === "sdcpp" && ecosystem === "flux2klein" && serviceOperation === "createvariant";
    const isFlux2DevVariant = engine === "sdcpp" && ecosystem === "flux2dev" && serviceOperation === "createvariant";
    let outputCount = base.outputCount;
    let referenceCount = base.referenceCount;
    let mask = base.mask;
    const sizeContract = civitaiImageSizeCapability(service, base.operation);
    const size = sizeContract.size;
    let quantityField: ImageSerializationPolicy["quantityField"] = "quantity";
    let referenceField = base.serialization.referenceField;

    // These engines accept an optional image input on createImage.  Keep the
    // generic profile conservative when no live service is resolved, then
    // open only this explicitly verified service contract.  The live schema
    // does not publish a request-level maxItems, so preserve every image and
    // its order while warning at validation time for 2+ references.
    if (base.operation === "generate" && acceptsOptionalCivitaiImages(service)) {
        referenceCount = references(0, null, "Civitai optional-image service accepts zero or more images; the live schema does not publish maxItems");
        referenceField = "images[]";
    } else if (base.operation === "generate" && referenceCount.state === "unsupported") {
        referenceCount = unsupported(civitaiPureTextToImageReferenceMessage(service.id));
    }

    if (base.operation === "variation") {
        outputCount = nativeBatch(1, isFlux2KleinVariant || isFlux2DevVariant ? 4 : 12);
        referenceField = "image";
    }
    if ((id.includes("/comfy/anima/") || id.includes("/comfy/krea2/") || id.includes("/sdcpp/anima/")) && base.operation === "generate") {
        outputCount = nativeBatch(1, 12);
    }
    if (id.includes("/fal/krea2/") && base.operation === "generate") {
        outputCount = nativeBatch(1, 10);
        referenceCount = references(0, 10, "Krea FAL imageStyleReferences maxItems=10");
        referenceField = "imageStyleReferences[]";
    }
    if (id.includes("/comfy/krea2/") && base.operation === "edit") {
        outputCount = nativeBatch(1, 4, "Civitai Comfy krea2 editImage quantity max 4 per live OpenAPI");
        referenceCount = references(1, 2, "Civitai Comfy krea2 editImage accepts 1-2 images");
        referenceField = "images[]";
    }
    if (id.includes("boogu") && base.operation === "edit") {
        outputCount = nativeBatch(1, 4);
        referenceCount = references(1, 2);
    }
    if (id.includes("/fal/qwen2/") && base.operation === "edit") {
        outputCount = nativeBatch(1, 10);
        referenceCount = references(1, 3);
    }
    if (id.includes("flux1-kontext")) {
        outputCount = nativeBatch(1, 4);
        if (base.operation === "edit") referenceCount = references(1, null);
    }
    if (id.includes("flux2/klein") && base.operation === "edit") {
        outputCount = nativeBatch(1, 4);
        referenceCount = references(1, 2);
    }
    if (id.includes("flux2/dev") && base.operation === "edit") {
        outputCount = nativeBatch(1, 4);
        referenceCount = references(1, null);
    }
    if (engine === "google" || id.includes("/google/")) {
        outputCount = nativeBatch(1, 4);
        quantityField = "numImages";
        if (base.operation === "edit") referenceCount = references(1, 10);
    }
    if (engine === "grok" || id.includes("/grok/")) {
        outputCount = nativeBatch(1, 4);
        if (base.operation === "edit") referenceCount = references(1, 3);
    }
    if (isExactCivitaiOpenAIGptImage2Service(service)) {
        outputCount = nativeBatch(1, 4);
        if (base.operation === "edit") {
            referenceCount = references(1, null, "Civitai live schema requires images but does not publish maxItems");
            mask = supportedMask("first-reference", "Civitai maskImage applies to the first input image");
        }
    }
    if (id.includes("/sdcpp/qwen/20b/") && base.operation === "generate") {
        outputCount = nativeBatch(1, 12);
    }
    if (id.includes("/sdcpp/qwen/20b/") && base.operation === "edit") {
        outputCount = nativeBatch(1, 12);
        referenceCount = references(1, 10, "Qwen20b live schema edit images maxItems=10");
        referenceField = "images[]";
    }
    if (engine === "qwen" && base.operation === "generate") {
        outputCount = nativeBatch(1, 6);
    }
    if (engine === "qwen" && base.operation === "edit") {
        outputCount = nativeBatch(1, 6);
        referenceCount = references(1, 3, "Qwen API live schema edit images maxItems=3");
        referenceField = "images[]";
    }
    if (engine === "seedream" || id.includes("/seedream/")) {
        outputCount = nativeBatch(1, 12);
        if (base.operation === "edit") referenceCount = references(1, 10);
    }
    if ((id.includes("/wan/v2.7/") || (engine === "wan" && (id.includes("editimage") || id.includes("image-to-image")))) && base.operation === "edit") {
        outputCount = nativeBatch(1, 10);
        referenceCount = references(1, 4, "The service description documents 1-4; live schema omits minItems/maxItems");
    }
    const verifiedService = isVerifiedCivitaiImageService(service);
    const availability = verifiedService
        ? base.availability
        : {
            state: "unknown" as const,
            reason: "该 Civitai image service 的 engine 未在已验证合同中；不会猜测其 workflow 字段",
        };
    // engine-specific advanced fields from the live OpenAPI oneOf contract:
    // sdcpp → sampleMethod/schedule; comfy → sampler/scheduler. 其它 engine
    // （seedream/google/flux/openai/grok 等）参数合同未覆盖，保持 fail-closed。
    // clipSkip 仅 SD1 ecosystem 开放（SDXL 上游会 400）。
    const engineAdvanced = isFlux2DevVariant
        ? {
            ...CIVITAI_SDCPP_ADVANCED_FIELDS,
            loras: {
                state: "supported" as const,
                kind: "number-map" as const,
                wireName: "loras",
                min: 0,
                max: 4,
                note: "Flux2 Dev createVariant UI uses an AIR→strength map; the serializer emits the official {air,strength}[] wire shape",
            },
        }
        : engine === "comfy"
          ? CIVITAI_COMFY_ADVANCED_FIELDS
          : engine === "sdcpp"
            ? CIVITAI_SDCPP_ADVANCED_FIELDS
            : overlayCivitaiLoraAdvancedFields(id, engine, base.advancedFields);
    const advancedFields = (engine === "comfy" || engine === "sdcpp") && service?.parameters?.ecosystem === "sd1"
        ? { ...engineAdvanced, clipSkip: CIVITAI_SD1_CLIP_SKIP }
        : engineAdvanced;
    return {
        ...base,
        availability,
        ...(verifiedService ? {} : { requiresExplicitProfile: true }),
        advancedFields,
        outputCount,
        referenceCount,
        mask,
        size,
        serialization: {
            ...base.serialization,
            quantityField,
            referenceField,
            maskField: mask.state === "supported" ? "maskImage" : null,
            sizeField: sizeContract.sizeField,
        },
        resolutionReason: `${reason}: ${service.id}`,
    } as ResolvedImageModelCapability;
}

// Single source of truth: engines whose createImage schema also accepts an
// optional images[] array. Duplicating this list in civitai-orchestration.ts
// let the two sides drift, so both now read this export.
export const CIVITAI_OPTIONAL_IMAGE_ENGINES = [
    "seedream",
    "google",
    "flux1-kontext",
    "krea2",
    "krea",
    "comfy",
    "flux1",
    "sdxl",
    "sd1",
] as const;

export function civitaiEngineAcceptsOptionalImages(engine: string) {
    const normalized = String(engine || "").trim().toLowerCase();
    return (CIVITAI_OPTIONAL_IMAGE_ENGINES as readonly string[]).includes(normalized);
}

function acceptsOptionalCivitaiImages(service: ImageCapabilityService | undefined) {
    return civitaiEngineAcceptsOptionalImages(String(service?.parameters?.engine || ""));
}

export function civitaiPureTextToImageReferenceMessage(serviceId = "") {
    const sibling = civitaiReferenceSiblingService(serviceId);
    return `schema 无 images[]，不会发送参考图以免上游 400。请改用 ${sibling}`;
}

function civitaiReferenceSiblingService(serviceId: string) {
    const id = String(serviceId || "").trim().toLowerCase();
    if (!id) return CIVITAI_KLEIN_OR_QWEN_EDIT;
    if (id.includes("/zimage/") || id.includes("/z-image/") || id.includes("/anima/") || id.includes("/ernie/")) {
        return CIVITAI_KLEIN_OR_QWEN_EDIT;
    }
    if (id.includes("/sdxl/") && !id.includes("createvariant")) {
        return "image/sdcpp/sdxl/createVariant、image/flux1-kontext/pro 或 image/flux2/klein/editImage/9b";
    }
    if (id.includes("/krea2/") && id.includes("createimage")) return "image/qwen/editImage/3.0-pro 或 image/flux2/klein/editImage/9b";
    if (id.includes("/sdcpp/qwen/20b/") && id.includes("createimage")) return "image/sdcpp/qwen/20b/editImage";
    if (id.includes("/fal/qwen2/") && id.includes("createimage")) return "image/fal/qwen2/editImage";
    if (id.includes("/qwen/createimage")) return "image/qwen/editImage/3.0-pro";
    if (id.includes("/grok/") && id.includes("createimage")) return "image/grok/v1.0/editImage";
    if (id.includes("/openai/") && id.includes("createimage")) return "image/openai/gpt-image-2/editImage";
    if (id.includes("/wan/") && id.includes("createimage")) return "image/wan/v2.7/fal/editImage";
    if (id.includes("/gemini/") && id.includes("createimage")) return CIVITAI_KLEIN_OR_QWEN_EDIT;
    if (id.includes("/comfy/flux1/") && id.includes("createimage")) return "image/comfy/flux1/createVariant";
    if (id.includes("/flux2/") && id.includes("createimage")) return "image/flux2/klein/editImage/9b";
    return CIVITAI_KLEIN_OR_QWEN_EDIT;
}

function overlayCivitaiLoraAdvancedFields(
    serviceId: string,
    engine: string,
    base: ImageAdvancedFieldsCapability,
): ImageAdvancedFieldsCapability {
    if (engine === "flux2" && serviceId.includes("/flux2/klein")) {
        // Live Flux2KleinImageGenInput: negativePrompt, cfgScale 1-20, steps 4-50,
        // sampleMethod/schedule (SdCpp), seed, loras map. https://orchestration.civitai.com/openapi/v2-consumers.json
        return {
            negativePrompt: { state: "supported", kind: "string", wireName: "negativePrompt" },
            steps: { state: "supported", kind: "number", wireName: "steps", min: 4, max: 50, integer: true },
            cfgScale: { state: "supported", kind: "number", wireName: "cfgScale", min: 1, max: 20 },
            seed: { state: "supported", kind: "int64", wireName: "seed" },
            sampler: {
                state: "supported",
                kind: "enum",
                wireName: "sampleMethod",
                values: [...CIVITAI_SDCPP_SAMPLE_METHOD_ENUM],
                note: "Flux2 Klein 用 sdcpp 风格 sampleMethod",
            },
            scheduler: {
                state: "supported",
                kind: "enum",
                wireName: "schedule",
                values: [...CIVITAI_SDCPP_SCHEDULE_ENUM],
                note: "Flux2 Klein 用 sdcpp 风格 schedule",
            },
            sequential: unknown("sequential mode 不属于 Flux2 Klein 合同"),
            clipSkip: unknown("clipSkip 仅 Civitai SD1 ecosystem 服务可用"),
            loras: {
                state: "supported",
                kind: "number-map",
                wireName: "loras",
                note: "Flux 2 Klein live LoRA map; keys are original model-version AIR identifiers",
            },
        };
    }
    if (engine === "flux2" && serviceId.includes("/flux2/dev")) {
        // Live Flux2DevImageGenInput: guidanceScale 0-20, numInferenceSteps 4-50,
        // seed, loras array ({air,strength}, strength 0-4). No negativePrompt/sampler/scheduler.
        return {
            negativePrompt: unsupported("Flux2 Dev live schema 没有 negativePrompt 字段"),
            steps: unsupported("Flux2 Dev 用 numInferenceSteps，不用 steps；请用 guidanceScale/numInferenceSteps"),
            cfgScale: unsupported("Flux2 Dev 用 guidanceScale，不用 cfgScale"),
            seed: { state: "supported", kind: "int64", wireName: "seed" },
            sampler: unsupported("Flux2 Dev live schema 没有 sampler 字段"),
            scheduler: unsupported("Flux2 Dev live schema 没有 scheduler 字段"),
            sequential: unknown("sequential mode 不属于 Flux2 Dev 合同"),
            clipSkip: unknown("clipSkip 仅 Civitai SD1 ecosystem 服务可用"),
            loras: {
                state: "supported",
                kind: "number-map",
                wireName: "loras",
                min: 0,
                max: 4,
                note: "Live ImageGenInputLora array {air,strength}; UI keeps an AIR→strength map and the serializer emits the official array",
            },
        };
    }
    if (engine === "wan") {
        return {
            ...base,
            loras: {
                state: "supported",
                kind: "number-map",
                wireName: "loras",
                min: 0,
                max: 4,
                note: "Live ImageGenInputLora array {air,strength}; UI keeps an AIR→strength map and the serializer emits the official array",
            },
        };
    }
    if (engine === "fal" || engine === "google" || engine === "gemini" || engine === "grok" || engine === "openai" || engine === "seedream" || engine === "flux1-kontext" || serviceId.includes("/flux2/pro")) {
        return {
            ...base,
            loras: { state: "unsupported", reason: "该服务不接受 LoRA。已验证 map 服务请使用完整 AIR，例如 urn:air:zimageturbo:lora:civitai:<id>@<ver>" },
        };
    }
    return base;
}

const VERIFIED_CIVITAI_IMAGE_ENGINES = new Set([
    "comfy",
    "fal",
    "flux1-kontext",
    "flux2",
    "gemini",
    "google",
    "grok",
    "openai",
    "qwen",
    "sdcpp",
    "seedream",
    "wan",
]);

export function isCivitaiFalKrea2Service(service?: Pick<ImageCapabilityService, "id" | "parameters">) {
    const id = String(service?.id || "").toLowerCase();
    const engine = String(service?.parameters?.engine || "").toLowerCase();
    const model = String(service?.parameters?.model || "").toLowerCase();
    return engine === "fal" && (model === "krea2" || id.includes("/fal/krea2/"));
}

function isVerifiedCivitaiFalModel(service: ImageCapabilityService) {
    const id = String(service.id || "").toLowerCase();
    const model = String(service.parameters?.model || "").toLowerCase();
    return model === "krea2" || id.includes("/krea2/")
        || model === "qwen2" || id.includes("/qwen2/")
        || model === "maiimage" || model === "mai-image" || id.includes("/mai")
        || model === "reve" || id.includes("/reve");
}

function isVerifiedCivitaiImageService(service: ImageCapabilityService | undefined) {
    const engine = String(service?.parameters?.engine || "").trim().toLowerCase();
    if (!service?.step || service.step !== "imageGen" || !VERIFIED_CIVITAI_IMAGE_ENGINES.has(engine)) return false;
    if (engine === "fal") return isVerifiedCivitaiFalModel(service);
    if (engine === "openai") return isExactCivitaiOpenAIGptImage2Service(service);
    return true;
}

function validateOutputCount(
    capability: ImageOutputCountCapability,
    count: number,
    subject: string,
    addError: IssueAdder,
    addWarning: IssueAdder,
) {
    if (!Number.isInteger(count) || count < 1) {
        addError("invalid_output_count", "outputCount", `输出数量必须是大于 0 的整数，当前为 ${String(count)}`);
        return;
    }
    if (capability.state === "unsupported") {
        if (count !== 1) addError("output_count_too_high", "outputCount", `${subject}：${capability.reason}`);
        return;
    }
    if (capability.state === "unknown") {
        addWarning("output_count_unverified", "outputCount", `${subject}：${capability.reason}；数量不会被静默截断`);
        return;
    }
    if (count < capability.min) addError("output_count_too_low", "outputCount", `${subject} 最少生成 ${capability.min} 张，当前为 ${count}`);
    if (capability.max !== null && count > capability.max) addError("output_count_too_high", "outputCount", `${subject} 最多生成 ${capability.max} 张，当前为 ${count}；不会自动截断`);
    if (capability.max === null && count > capability.min) {
        addWarning("output_count_unverified", "outputCount", `${subject} 官方未公布输出数量上限，当前请求 ${count} 张`);
    }
    if (capability.transport === "client-fanout" && count > 1) {
        addWarning("client_fanout_required", "outputCount", `${subject} 单次只请求 1 张；应执行 ${count} 次独立请求，不能把 ${count} 重复传给每次调用`);
    }
}

function validateReferenceCount(
    capability: ImageReferenceCountCapability,
    count: number,
    subject: string,
    addError: IssueAdder,
    addWarning: IssueAdder,
) {
    if (capability.state === "unsupported") {
        if (count > 0) addWarning("references_unsupported", "referenceCount", `${subject}：${capability.reason}；已将参考意图保留`);
        return;
    }
    if (capability.state === "unknown") {
        if (count > 0) addWarning("reference_limit_unpublished", "referenceCount", `${subject}：${capability.reason}`);
        return;
    }
    if (count < capability.min) addError("reference_count_too_low", "referenceCount", `${subject} 至少需要 ${capability.min} 张参考图，当前为 ${count}`);
    if (capability.max !== null && count > capability.max) {
        addError("reference_count_too_high", "referenceCount", `${subject} 最多接受 ${capability.max} 张参考图，当前为 ${count}；不会自动 slice 或丢图`);
    }
    if (capability.max === null && count > Math.max(1, capability.min)) {
        addWarning("reference_limit_unpublished", "referenceCount", `${subject} 支持多参考图，但官方未公布上限；当前保留全部 ${count} 张及其顺序`);
    }
}

function validateSize(
    capability: ImageSizeCapability,
    request: ImageRequestValidationInput,
    subject: string,
    addError: IssueAdder,
    addWarning: IssueAdder,
) {
    const rawSize = String(request.size || "").trim();
    const hasDimensions = request.width !== undefined || request.height !== undefined;
    const hasAny = Boolean(rawSize || hasDimensions || request.aspectRatio);
    if (capability.state === "unsupported") {
        if (hasAny) addError("size_unsupported", "size", `${subject}：${capability.reason}`);
        return;
    }
    if (capability.state === "unknown") {
        if (hasAny) addWarning("size_unverified", "size", `${subject}：${capability.reason}；不会吸附到其他 provider 的尺寸`);
        return;
    }
    if (!hasAny) {
        if (capability.required) addError("size_required", "size", `${subject} 必须提供 size`);
        return;
    }
    if (rawSize && hasDimensions) {
        addError("size_conflict", "size", "不能同时提供 size 字符串和 width/height");
        return;
    }
    if (hasDimensions && (!Number.isInteger(request.width) || !Number.isInteger(request.height) || Number(request.width) < 1 || Number(request.height) < 1)) {
        addError("size_invalid", "size", `width/height 必须同时是正整数，当前为 ${String(request.width)}x${String(request.height)}`);
        return;
    }
    if (capability.kind === "enum") {
        const pixelMapped = hasDimensions
            ? mapPixelSizeToPublishedEnum(capability.values, Number(request.width), Number(request.height))
            : undefined;
        const candidate = pixelMapped || rawSize || String(request.aspectRatio || "").trim();
        if (!enumIncludes(capability.values, candidate)) {
            addError("size_invalid", "size", `${subject} 不支持尺寸 ${candidate || `${request.width}x${request.height}`}；可选值：${capability.values.join(", ")}`);
        }
        if (
            request.aspectRatio
            && rawSize
            && !enumIncludes(capability.values, request.aspectRatio)
            && normalizeEnumValue(request.aspectRatio) !== normalizeEnumValue(candidate)
        ) {
            addError("size_invalid", "size", `${subject} 使用完整 size 枚举，不接受独立 aspectRatio ${request.aspectRatio}`);
        }
        return;
    }
    if (capability.kind === "tier-and-ratio") {
        const parsed = hasDimensions ? { width: Number(request.width), height: Number(request.height) } : parseDimensions(rawSize);
        if (parsed) {
            if (capability.dimensions) {
                validateDimensionRules(parsed.width, parsed.height, capability.dimensions.rules, subject, addError);
                if (!capability.dimensions.boundsPublished) addWarning("size_unverified", "size", `${subject} 接受精确尺寸，但官方未公布完整边界；请求值不会被改写`);
            } else {
                addError("size_invalid", "size", `${subject} 使用档位/比例合同，不接受精确尺寸 ${parsed.width}x${parsed.height}`);
            }
        } else if (rawSize && !enumIncludes(capability.tiers, rawSize) && !enumIncludes(capability.ratios, rawSize)) {
            addError("size_invalid", "size", capability.tiers.length
                ? `${subject} 的 size 必须是 ${capability.tiers.join("/")}、已发布宽高比${capability.dimensions ? "或合法 WIDTHxHEIGHT" : ""}`
                : `${subject} 的 size 必须是已发布宽高比`);
        }
        if (capability.ratioRequired && !request.aspectRatio && !parsed && !enumIncludes(capability.ratios, rawSize)) {
            addError("size_required", "size", `${subject} 必须提供 aspectRatio`);
        }
        if (request.aspectRatio && !enumIncludes(capability.ratios, request.aspectRatio)) {
            addError("size_invalid", "size", `${subject} 不支持比例 ${request.aspectRatio}；可选值：${capability.ratios.join(", ")}`);
        }
        return;
    }
    if (rawSize.toLowerCase() === "auto") {
        if (!capability.allowAuto) addError("size_invalid", "size", `${subject} 不支持 auto 尺寸`);
        return;
    }
    const parsed = hasDimensions ? { width: Number(request.width), height: Number(request.height) } : parseDimensions(rawSize);
    if (!parsed) {
        addError("size_invalid", "size", `${subject} 需要 WIDTHxHEIGHT${capability.allowAuto ? " 或 auto" : ""}，当前为 ${rawSize || "空"}`);
        return;
    }
    validateDimensionRules(parsed.width, parsed.height, capability.rules, subject, addError);
    if (!capability.boundsPublished) addWarning("size_unverified", "size", `${subject} 官方未公布完整尺寸边界；请求值 ${parsed.width}x${parsed.height} 保持原样`);
    if (request.aspectRatio) addError("size_invalid", "size", `${subject} 的精确尺寸合同不接受额外 aspectRatio`);
}

function validateDimensionRules(width: number, height: number, rules: ImageDimensionRules, subject: string, addError: IssueAdder) {
    const area = width * height;
    const ratio = Math.max(width / height, height / width);
    const failures: string[] = [];
    if (rules.minWidth !== undefined && width < rules.minWidth) failures.push(`width >= ${rules.minWidth}`);
    if (rules.maxWidth !== undefined && width > rules.maxWidth) failures.push(`width <= ${rules.maxWidth}`);
    if (rules.minHeight !== undefined && height < rules.minHeight) failures.push(`height >= ${rules.minHeight}`);
    if (rules.maxHeight !== undefined && height > rules.maxHeight) failures.push(`height <= ${rules.maxHeight}`);
    if (rules.minPixels !== undefined && area < rules.minPixels) failures.push(`总像素 >= ${rules.minPixels}`);
    if (rules.maxPixels !== undefined && area > rules.maxPixels) failures.push(`总像素 <= ${rules.maxPixels}`);
    if (rules.multipleOf !== undefined && (width % rules.multipleOf !== 0 || height % rules.multipleOf !== 0)) failures.push(`宽高均为 ${rules.multipleOf} 的倍数`);
    if (rules.maxAspectRatio !== undefined && ratio > rules.maxAspectRatio) failures.push(`长短边比例 <= ${rules.maxAspectRatio}:1`);
    if (failures.length) addError("size_invalid", "size", `${subject} 不支持 ${width}x${height}：需要 ${failures.join("、")}`);
}

function validateEnumField(
    field: "quality" | "outputFormat",
    capability: ImageEnumFieldCapability,
    rawValue: string | undefined,
    subject: string,
    addError: IssueAdder,
) {
    const value = String(rawValue || "").trim();
    if (!value) return;
    if (capability.state === "unsupported") {
        addError("field_unsupported", field, `${subject} 不支持 ${field}=${value}；不会静默丢弃该字段`);
        return;
    }
    if (capability.state === "unknown") {
        addError("field_unverified", field, `${subject}：${capability.reason}；不会静默发送未知字段`);
        return;
    }
    if (capability.requestable === false) {
        addError("field_not_requestable", field, `${subject} 的 ${field}=${value} 是固定输出属性，不是可发送的请求字段`);
        return;
    }
    if (!enumIncludes(capability.values, value)) {
        addError("field_value_invalid", field, `${subject} 不支持 ${field}=${value}；可选值：${capability.values.join(", ")}`);
    }
}

function validateAdvancedFields(
    capabilities: ImageAdvancedFieldsCapability,
    request: ImageRequestValidationInput,
    subject: string,
    addError: IssueAdder,
) {
    const values: Record<ImageAdvancedFieldName, unknown> = {
        negativePrompt: request.negativePrompt,
        steps: request.steps,
        cfgScale: request.cfgScale,
        seed: request.seed,
        sampler: request.sampler,
        scheduler: request.scheduler,
        sequential: request.sequential,
        clipSkip: request.clipSkip,
        loras: request.loras,
    };
    for (const field of Object.keys(values) as ImageAdvancedFieldName[]) {
        const value = values[field];
        if (!hasAdvancedValue(value)) continue;
        const capability = capabilities[field];
        if (capability.state === "unsupported") {
            addError("advanced_field_unsupported", field, `${subject}：${capability.reason}；不会忽略 ${field}`);
            continue;
        }
        if (capability.state === "unknown") {
            addError("advanced_field_unverified", field, `${subject}：${capability.reason}；请使用已验证 profile 后重试`);
            continue;
        }
        const invalid = advancedFieldError(capability, value);
        if (invalid) addError("advanced_field_invalid", field, `${subject} 的 ${field} 无效：${invalid}`);
    }
}

function advancedFieldError(capability: Extract<ImageAdvancedFieldCapability, { state: "supported" }>, value: unknown) {
    if (capability.kind === "string") {
        if (typeof value !== "string") return "必须是字符串";
        if (capability.maxLength !== undefined && value.length > capability.maxLength) return `最长 ${capability.maxLength} 字符`;
        return "";
    }
    if (capability.kind === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) return "必须是有限数字";
        if (capability.integer && !Number.isInteger(value)) return "必须是整数";
        if (capability.min !== undefined && value < capability.min) return `必须 >= ${capability.min}`;
        if (capability.max !== undefined && value > capability.max) return `必须 <= ${capability.max}`;
        return "";
    }
    if (capability.kind === "int64") return isSignedInt64(value) ? "" : "必须是有符号 int64；超出 JS 安全整数时请用十进制字符串";
    if (capability.kind === "enum") {
        return typeof value === "string" && enumIncludes(capability.values, value) ? "" : `可选值：${capability.values.join(", ")}`;
    }
    if (capability.kind === "boolean") return typeof value === "boolean" ? "" : "必须是布尔值";
    if (!isRecord(value) || !Object.keys(value).length) return "必须是非空 AIR -> strength 数字映射";
    for (const [key, strength] of Object.entries(value)) {
        if (!key.trim() || typeof strength !== "number" || !Number.isFinite(strength)) return "每个 AIR key 必须非空且 strength 必须是有限数字";
        if (capability.min !== undefined && strength < capability.min) return `strength 必须 >= ${capability.min}`;
        if (capability.max !== undefined && strength > capability.max) return `strength 必须 <= ${capability.max}`;
    }
    return "";
}

function validateSequentialImageMode(
    capability: ResolvedImageModelCapability | ImageCapabilityProfile,
    request: ImageRequestValidationInput,
    subject: string,
    addError: IssueAdder,
) {
    if (request.sequential !== true) return;
    const field = capability.advancedFields.sequential;
    if (field.state !== "supported" || field.kind !== "boolean") return;
    if (capability.id !== "dashscope-wan-2.7-pro-generate") return;
    const dimensions = request.size ? parseDimensions(request.size) : undefined;
    const width = request.width ?? dimensions?.width;
    const height = request.height ?? dimensions?.height;
    if (width && height && width * height > 2048 * 2048) {
        addError("size_invalid", "size", `${subject} 连续组图模式最高为 2K；4K 仅支持无参考图的普通文生图`);
    }
}

type IssueAdder = (code: ImageCapabilityIssueCode, field: ImageCapabilityIssue["field"], message: string) => void;

function capabilitySubject(capability: ResolvedImageModelCapability | ImageCapabilityProfile) {
    const resolved = capability as Partial<ResolvedImageModelCapability>;
    return `${resolved.providerLabel || capability.label} / ${resolved.model || capability.label}`;
}

function parseDimensions(value: string) {
    const match = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(String(value || "").trim());
    if (!match) return undefined;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height } : undefined;
}

function mapPixelSizeToPublishedEnum(values: readonly string[], width: number, height: number) {
    const exact = `${width}x${height}`;
    if (enumIncludes(values, exact)) return exact;
    const imageSize = mapPixelSizeToFalImageSize(width, height);
    if (enumIncludes(values, imageSize)) return imageSize;
    const ratio = closestPublishedAspectRatio(values, width, height);
    return ratio && enumIncludes(values, ratio) ? ratio : undefined;
}

function mapPixelSizeToFalImageSize(width: number, height: number) {
    if (width === height) return width >= 1024 ? "square_hd" : "square";
    const landscape = width > height;
    const wide = Math.max(width, height) / Math.max(1, Math.min(width, height)) >= 1.5;
    return `${landscape ? "landscape" : "portrait"}_${wide ? "16_9" : "4_3"}`;
}

function closestPublishedAspectRatio(values: readonly string[], width: number, height: number) {
    const target = Math.max(1, width) / Math.max(1, height);
    const candidates = values.flatMap((value) => {
        const parts = String(value || "").trim().split(":");
        if (parts.length !== 2) return [];
        const left = Number(parts[0]);
        const right = Number(parts[1]);
        if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return [];
        return [{ value, ratio: left / right }];
    });
    if (!candidates.length) return undefined;
    return candidates.reduce((best, candidate) => (
        Math.abs(candidate.ratio - target) < Math.abs(best.ratio - target) ? candidate : best
    )).value;
}

function enumIncludes(values: readonly string[], value: string) {
    const normalized = normalizeEnumValue(value);
    return values.some((candidate) => normalizeEnumValue(candidate) === normalized);
}

function normalizeEnumValue(value: string) {
    return String(value || "").trim().toLowerCase().replace(/[×*]/g, "x");
}

function hasAdvancedValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (isRecord(value)) return Object.keys(value).length > 0;
    return true;
}

function isSignedInt64(value: unknown) {
    if (typeof value === "number") return Number.isSafeInteger(value);
    if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return false;
    try {
        const parsed = BigInt(value.trim());
        return parsed >= -(2n ** 63n) && parsed <= 2n ** 63n - 1n;
    } catch {
        return false;
    }
}

function operationFromServiceId(id: string) {
    if (/createvariant/i.test(id)) return "createvariant";
    if (/proeditimage/i.test(id) || /image-to-image/i.test(id) || /editimage/i.test(id)) return "editimage";
    if (/procreateimage/i.test(id) || /text-to-image/i.test(id) || /createimage/i.test(id)) return "createimage";
    return "";
}

function isKnownImageModelKey(key: string) {
    return key.startsWith("qwen-image") || key === "wan2-6-t2i" || key.startsWith("wan2-6-image") || key.startsWith("wan2-7-image") || key === "z-image-turbo";
}

function isKnownOpenAIImageModel(model: string) {
    const key = normalizeModelKey(model);
    // Relay variants pass the empty-adapter passthrough gate here; the
    // official-host restriction is enforced inside resolveOpenAI.
    return isGptImage2ModelKey(key)
        || GPT_IMAGE_2_RELAY_VARIANTS.has(key)
        || key === "gpt-image-1"
        || key === "gpt-image-1-5"
        || key === "gpt-image-1-mini"
        || key === "dall-e-2"
        || key === "dalle-2"
        || key === "dall-e-3"
        || key === "dalle-3";
}

function isGptImage2ModelKey(key: string) {
    return key === "gpt-image-2"
        || /^gpt-image-2-\d{4}-\d{2}-\d{2}$/.test(key)
        || key === "chatgpt-image-latest";
}

function isXaiImagine2ModelKey(key: string) {
    return key === "grok-imagine-image-2-0" || key.startsWith("grok-imagine-image-2-0-");
}

function specializeXaiImagineProfile(id: ImageCapabilityProfileId, model: string): ImageCapabilityProfileId {
    if (!isXaiImagine2ModelKey(normalizeModelKey(model))) return id;
    if (id === "xai-grok-image-generate") return "xai-grok-imagine-2-generate";
    if (id === "xai-grok-imagine-edit") return "xai-grok-imagine-2-edit";
    return id;
}

/** xAI Grok image models: grok-2-image* (legacy) and grok-imagine-image* (Imagine). */
function isXaiImageModelKey(key: string) {
    return key.startsWith("grok-imagine-image") || key === "grok-2-image" || key.startsWith("grok-2-image-");
}

/** Google image models: gemini-*-image* chat-image hybrids and imagen-*. */
function isGeminiImageModelKey(key: string) {
    return (key.includes("gemini") && key.includes("image")) || key === "imagen" || key.startsWith("imagen-");
}

function normalizeModelKey(model: string) {
    return String(model || "").trim().toLowerCase().replace(/[._]+/g, "-").replace(/-+/g, "-");
}

function urlHostname(baseUrl: string | undefined) {
    try {
        return new URL(String(baseUrl || "").trim()).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
