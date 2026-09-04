export type CivitaiVideoMediaProfileId =
    | "civitai-text-video"
    | "civitai-i2v"
    | "civitai-first-last"
    | "civitai-source-images"
    | "civitai-untyped-images"
    | "civitai-reference-images"
    | "civitai-reference-videos"
    | "civitai-frames-or-references"
    | "civitai-multimodal";

export type CivitaiVideoReferenceKind =
    | "none"
    | "first_frame"
    | "first_last_frame"
    | "reference_set"
    | "reference_set_with_first"
    | "reference_set_with_frames";

export type CivitaiVideoMediaTransport =
    | "text-only"
    | "grok-single-image-array"
    | "happyhorse-single-image"
    | "happyhorse-reference-images"
    | "kling-optional-source-image"
    | "kling-v3"
    | "ltx-optional-source-array"
    | "ltx-first-last"
    | "minimax-multimodal"
    | "seedance-multimodal"
    | "generic-reference-images"
    | "vidu-frames-or-references"
    | "wan26-reference-videos"
    | "wan27-first-last"
    | "wan27-reference-media";

export type CivitaiVideoMediaContract = {
    readonly serviceId: string;
    readonly profileId: CivitaiVideoMediaProfileId;
    readonly transport: CivitaiVideoMediaTransport;
    readonly referenceKinds: readonly CivitaiVideoReferenceKind[];
    /** null means no verified request-level maximum is published; exact upstream limits may narrow a proxy array. */
    readonly imageMaximum: number | null;
    readonly acceptsReferenceVideos: boolean;
    /** Zero for services that do not accept videos. */
    readonly videoMinimum: number;
    /** null means the verified serializer/schema publishes no video maximum. */
    readonly videoMaximum: number | null;
    /** Optional official shared cap across reference images + videos (e.g. MiniMax H3 combined ≤ 12). */
    readonly sharedImageVideoMaximum?: number;
    readonly acceptsReferenceAudios: boolean;
    readonly storyAutoReferencePolicy?: "disabled" | "current-shot" | "semantic-references";
    readonly evidence: string;
};

const LIVE_OPENAPI_EVIDENCE = "Civitai videoGen live OpenAPI SHA-256 4e59dbe90eccad8d8666e5ce98ef9ec8049c30ecb313a166a4ca2f677453a33b (verified 2026-08-04)";
const FIXED_OPENAPI_EVIDENCE = "Civitai official v2-consumers.json commit 80ef09a51b70fe8aca750c3390b7c9fdbb818507 (verified 2026-08-09)";
const HAPPYHORSE_REFERENCE_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; HappyHorseV1_1ReferenceToVideoInput description: 1–9 reference images`;
const VIDU_REFERENCE_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; Vidu official Reference to Video: Q1 accepts 1–7 images (verified 2026-08-09)`;
const KLING_V3_REFERENCE_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; KlingV3VideoGenInput images[] has no request-level maxItems; Kling v3 Omni official API (klingai.com/document-api, verified 2026-08-15): refer-only reference images/subjects ≤ 7, ≤ 4 when a feature reference video is present`;
const VIDU_Q3_REFERENCE_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; Vidu official Reference to Video docs (platform.vidu.com, verified 2026-08-15): viduq3 accepts image/text subjects ≤ 7`;
const MINIMAX_H3_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; MiniMax official video-generation docs (platform.minimax.io, verified 2026-08-15): reference images ≤ 9, reference videos ≤ 3, combined ≤ 12`;
const WAN22_FAL_I2V_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; fal.ai official Wan v2.2 image-to-video schema (verified 2026-08-15): single image_url, no end_image field`;
const WAN26_REFERENCE_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; Wan26FalReferenceToVideoInput: referenceVideoUrls 1–3, no image/audio field`;
const WAN21_CIVITAI_I2V_EVIDENCE = `${FIXED_OPENAPI_EVIDENCE}; Wan21CivitaiVideoGenInput publishes images[] (URL/DataURL/Base64), width, and height; official WAN recipe (developer.civitai.com/orchestration/recipes/wan.md) lists Civitai v2.1 image-to-video`;

function contract(
    serviceId: string,
    profileId: CivitaiVideoMediaProfileId,
    transport: CivitaiVideoMediaTransport,
    referenceKinds: readonly CivitaiVideoReferenceKind[],
    imageMaximum: number | null,
    options: {
        acceptsReferenceVideos?: boolean;
        videoMinimum?: number;
        videoMaximum?: number | null;
        sharedImageVideoMaximum?: number;
        acceptsReferenceAudios?: boolean;
        storyAutoReferencePolicy?: "disabled" | "current-shot" | "semantic-references";
        evidence?: string;
    } = {},
): CivitaiVideoMediaContract {
    return {
        serviceId,
        profileId,
        transport,
        referenceKinds,
        imageMaximum,
        acceptsReferenceVideos: options.acceptsReferenceVideos === true,
        videoMinimum: options.acceptsReferenceVideos === true ? options.videoMinimum ?? 0 : 0,
        videoMaximum: options.acceptsReferenceVideos === true ? options.videoMaximum ?? null : 0,
        ...(options.sharedImageVideoMaximum !== undefined ? { sharedImageVideoMaximum: options.sharedImageVideoMaximum } : {}),
        acceptsReferenceAudios: options.acceptsReferenceAudios === true,
        ...(options.storyAutoReferencePolicy ? { storyAutoReferencePolicy: options.storyAutoReferencePolicy } : {}),
        evidence: options.evidence || LIVE_OPENAPI_EVIDENCE,
    };
}

const DEFINITIONS = [
    contract("video/grok/image-to-video", "civitai-i2v", "grok-single-image-array", ["first_frame"], 1),
    contract("video/happyHorse/v1.1/imageToVideo", "civitai-i2v", "happyhorse-single-image", ["first_frame"], 1),
    contract("video/happyHorse/v1.1/referenceToVideo", "civitai-reference-images", "happyhorse-reference-images", ["reference_set"], 9, { storyAutoReferencePolicy: "semantic-references", evidence: HAPPYHORSE_REFERENCE_EVIDENCE }),
    contract("video/hunyuan", "civitai-text-video", "text-only", ["none"], 0),
    contract("video/wan/v2.2/comfy", "civitai-text-video", "text-only", ["none"], 0),
    contract("video/kling", "civitai-i2v", "kling-optional-source-image", ["none", "first_frame"], 1),
    contract("video/kling-v3", "civitai-frames-or-references", "kling-v3", ["none", "first_frame", "first_last_frame", "reference_set", "reference_set_with_frames"], 7, { acceptsReferenceVideos: true, videoMaximum: 1, storyAutoReferencePolicy: "semantic-references", evidence: KLING_V3_REFERENCE_EVIDENCE }),
    contract("video/ltx2.3/createVideo", "civitai-i2v", "ltx-optional-source-array", ["none", "first_frame"], 1),
    contract("video/ltx2.3/firstLastFrameToVideo", "civitai-first-last", "ltx-first-last", ["first_frame", "first_last_frame"], 2),
    contract("video/minimax-h3", "civitai-multimodal", "minimax-multimodal", ["none", "first_frame", "first_last_frame", "reference_set", "reference_set_with_first", "reference_set_with_frames"], 9, { acceptsReferenceVideos: true, videoMaximum: 3, sharedImageVideoMaximum: 12, acceptsReferenceAudios: true, storyAutoReferencePolicy: "semantic-references", evidence: MINIMAX_H3_EVIDENCE }),
    contract("video/seedance", "civitai-untyped-images", "seedance-multimodal", ["none", "reference_set"], null, { acceptsReferenceVideos: true, acceptsReferenceAudios: true, storyAutoReferencePolicy: "semantic-references" }),
    contract("video/sora/image-to-video", "civitai-source-images", "generic-reference-images", ["none", "first_frame", "reference_set"], null, { storyAutoReferencePolicy: "semantic-references" }),
    contract("video/vidu-q3", "civitai-untyped-images", "generic-reference-images", ["none", "reference_set"], 7, { storyAutoReferencePolicy: "semantic-references", evidence: VIDU_Q3_REFERENCE_EVIDENCE }),
    contract("video/vidu", "civitai-frames-or-references", "vidu-frames-or-references", ["none", "first_frame", "first_last_frame", "reference_set"], 7, { storyAutoReferencePolicy: "semantic-references", evidence: VIDU_REFERENCE_EVIDENCE }),
    contract("video/wan/v2.1/civitai", "civitai-i2v", "generic-reference-images", ["first_frame"], 1, { evidence: WAN21_CIVITAI_I2V_EVIDENCE }),
    contract("video/wan/v2.2-5b/fal/image-to-video", "civitai-source-images", "generic-reference-images", ["none", "first_frame", "reference_set"], 1, { storyAutoReferencePolicy: "semantic-references", evidence: WAN22_FAL_I2V_EVIDENCE }),
    contract("video/wan/v2.2/fal/image-to-video", "civitai-untyped-images", "generic-reference-images", ["none", "reference_set"], 1, { storyAutoReferencePolicy: "semantic-references", evidence: WAN22_FAL_I2V_EVIDENCE }),
    contract("video/wan/v2.5/fal/image-to-video", "civitai-untyped-images", "generic-reference-images", ["none", "reference_set"], null, { storyAutoReferencePolicy: "semantic-references" }),
    contract("video/wan/v2.6/fal/reference-to-video", "civitai-reference-videos", "wan26-reference-videos", ["none"], 0, { acceptsReferenceVideos: true, videoMinimum: 1, videoMaximum: 3, storyAutoReferencePolicy: "disabled", evidence: WAN26_REFERENCE_EVIDENCE }),
    contract("video/wan/v2.7/fal/image-to-video", "civitai-first-last", "wan27-first-last", ["first_frame", "first_last_frame"], 2),
    contract("video/wan/v2.7/fal/reference-to-video", "civitai-reference-images", "wan27-reference-media", ["none", "reference_set"], null, { acceptsReferenceVideos: true, storyAutoReferencePolicy: "semantic-references" }),
] as const;

export const CIVITAI_VIDEO_MEDIA_CONTRACT_SERVICE_IDS = Object.freeze(DEFINITIONS.map((item) => item.serviceId));

const BY_SERVICE_ID = new Map(DEFINITIONS.map((item) => [item.serviceId.toLowerCase(), item]));

export function resolveCivitaiVideoMediaContract(serviceId: string): CivitaiVideoMediaContract | undefined {
    return BY_SERVICE_ID.get(String(serviceId || "").trim().toLowerCase());
}

export function resolveCivitaiVideoMediaContractForIntent(
    serviceId: string,
    referenceKind: string,
): CivitaiVideoMediaContract | undefined {
    const direct = resolveCivitaiVideoMediaContract(serviceId);
    if (direct) return direct;
    const model = String(serviceId || "").trim().toLowerCase();
    if (model === "hunyuan") return resolveCivitaiVideoMediaContract("video/hunyuan");
    if (model === "ltx2.3" || model === "ltx2-3") {
        return resolveCivitaiVideoMediaContract(
            referenceKind === "first_last_frame"
                ? "video/ltx2.3/firstLastFrameToVideo"
                : "video/ltx2.3/createVideo",
        );
    }
    return undefined;
}
