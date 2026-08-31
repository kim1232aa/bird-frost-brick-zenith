import { resolveCivitaiService, type CivitaiGenerationService } from "@/services/api/civitai-services";
import { resolveCivitaiVideoMediaContract } from "@/services/api/civitai-video-media-contract";
import { assertCivitaiLoraCompatibility, civitaiLoraUnsupportedMessage, isCivitaiArrayLoraService, parseCivitaiLoraAir } from "@/services/api/civitai-lora-resource";
import { civitaiEngineAcceptsOptionalImages, civitaiPureTextToImageReferenceMessage, isCivitaiFalKrea2Service, isExactCivitaiOpenAIGptImage2Service } from "@/services/api/image-model-capabilities";
import {
    VIDEO_GENERATION_PARAMETER_NAMES,
    resolveVideoModelCapability,
    validateVideoGenerationParameters,
    type ResolvedVideoModelCapability,
    type VideoGenerationDimensions,
    type VideoGenerationParameterName,
    type VideoGenerationParameters,
} from "@/services/api/video-model-capabilities";

export type CivitaiBlob = {
    readonly id: string;
    readonly url: string;
};

export type CivitaiWorkflowState =
    | { readonly status: "pending"; readonly workflowId: string }
    | { readonly status: "completed"; readonly workflowId: string; readonly blobs: readonly CivitaiBlob[] }
    | { readonly status: "failed"; readonly workflowId: string; readonly error: string };

export function isCivitaiAdapterType(value: unknown) {
    return String(value || "").trim().toLowerCase() === "civitai-orchestration";
}

/** Bump when the default Civitai mature policy changes so old false values can be migrated. */
export const CIVITAI_MATURE_POLICY_VERSION = 1;

export function civitaiAllowsMatureContent(provider?: { adapterType?: string; allowMatureContent?: boolean } | null) {
    if (!isCivitaiAdapterType(provider?.adapterType)) return provider?.allowMatureContent === true;
    return provider?.allowMatureContent !== false;
}

export function buildCivitaiWorkflowQuery(waitSeconds: number, whatif = false, allowMatureContent = true) {
    return {
        whatif,
        wait: Math.max(0, Math.min(100, Math.floor(waitSeconds))),
        // Official default is false. Only hide URLs when the provider explicitly forbids mature content.
        hideMatureContent: allowMatureContent === false,
    } as const;
}

export function normalizeCivitaiVideoDuration(model: string, value: string, service?: CivitaiGenerationService) {
    const capability = civitaiVideoCapability(model, service);
    const field = capability.generationParameters.duration;
    const parsed = field.valueType === "string" ? String(value || "").trim() : Number(String(value || "").trim());
    validateVideoGenerationParameters(capability, { duration: parsed });
    return parsed;
}

export function normalizeCivitaiVideoResolution(model: string, value: string, service?: CivitaiGenerationService) {
    const capability = civitaiVideoCapability(model, service);
    const resolution = exactVideoEnumString(capability, "resolution", value);
    validateVideoGenerationParameters(capability, { resolution });
    return resolution;
}

export function normalizeCivitaiVideoAspectRatio(model: string, value: string, service?: CivitaiGenerationService) {
    const ratio = String(value || "").trim();
    if (!ratio) return undefined;
    const capability = civitaiVideoCapability(model, service);
    const aspectRatio = exactVideoEnumString(capability, "aspectRatio", ratio);
    validateVideoGenerationParameters(capability, { aspectRatio });
    return aspectRatio;
}

export type CivitaiImageWorkflowOptions = {
    readonly model: string;
    readonly service?: CivitaiGenerationService;
    readonly prompt: string;
    readonly width?: number;
    readonly height?: number;
    readonly size?: string;
    readonly aspectRatio?: string;
    readonly imageSize?: string;
    readonly quantity: number;
    readonly images?: readonly string[];
    readonly maskImage?: string;
    readonly negativePrompt?: string;
    readonly seed?: number;
    readonly steps?: number;
    readonly guidance?: number;
    readonly cfgScale?: number;
    readonly guidanceScale?: number;
    readonly numInferenceSteps?: number;
    readonly sampler?: CivitaiSdCppSampleMethod | CivitaiComfySampler | "";
    readonly sampleMethod?: CivitaiSdCppSampleMethod | "";
    readonly scheduler?: CivitaiSdCppSchedule | CivitaiComfyScheduler | "";
    readonly schedule?: CivitaiSdCppSchedule | "";
    /** SD1-only CLIP skip; SDXL rejects this field upstream. */
    readonly clipSkip?: number;
    /** engine: "comfy" img2img denoise strength (wire: denoiseStrength). */
    readonly denoiseStrength?: number;
    readonly outputFormat?: "jpeg" | "png" | "webP" | "";
    readonly loras?: Readonly<Record<string, number>>;
    /** Official FAL Krea2 style refs; never mixed with Comfy `images[]`. */
    readonly imageStyleReferences?: readonly CivitaiImageStyleReference[];
    readonly checkpointAir?: string;
    readonly strength?: number;
    readonly vaeAir?: string;
    readonly embeddings?: readonly string[];
    readonly uCache?: "off" | "normal";
    readonly allowMatureContent?: boolean;
    /** Flux2 Klein model version. */
    readonly modelVersion?: "4b" | "4b-base" | "9b" | "9b-base" | "9b-kv";
};

const CIVITAI_SDCPP_SAMPLE_METHODS = [
    "euler", "heun", "dpm2", "dpm++2s_a", "dpm++2m", "dpm++2mv2", "ipndm", "ipndm_v",
    "ddim_trailing", "euler_a", "lcm", "res_multistep", "res_2s", "tcd", "er_sde",
] as const;

const CIVITAI_SDCPP_SCHEDULES = [
    "simple", "discrete", "karras", "exponential", "ays", "bong_tangent", "gits", "sgm_uniform",
    "smoothstep", "kl_optimal", "lcm",
] as const;

/** Live OpenAPI ComfySampler enum (engine: "comfy" → wire field `sampler`). */
const CIVITAI_COMFY_SAMPLERS = [
    "euler", "euler_ancestral", "euler_cfg_pp", "euler_ancestral_cfg_pp", "heun", "heunpp2",
    "dpm_2", "dpm_2_ancestral", "lms", "dpm_fast", "dpm_adaptive",
    "dpmpp_2s_ancestral", "dpmpp_2s_ancestral_cfg_pp", "dpmpp_sde", "dpmpp_sde_gpu",
    "dpmpp_2m", "dpmpp_2m_cfg_pp", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
    "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ipndm", "ipndm_v", "deis", "ddim",
    "uni_pc", "uni_pc_bh2", "res_multistep", "er_sde",
] as const;

/** Live OpenAPI ComfyScheduler enum (engine: "comfy" → wire field `scheduler`). */
const CIVITAI_COMFY_SCHEDULERS = [
    "normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta",
] as const;

type CivitaiSdCppSampleMethod = (typeof CIVITAI_SDCPP_SAMPLE_METHODS)[number];
type CivitaiSdCppSchedule = (typeof CIVITAI_SDCPP_SCHEDULES)[number];
type CivitaiComfySampler = (typeof CIVITAI_COMFY_SAMPLERS)[number];
type CivitaiComfyScheduler = (typeof CIVITAI_COMFY_SCHEDULERS)[number];

export type CivitaiImageStyleReference = {
    readonly imageUrl: string;
    readonly strength?: number;
};

const CIVITAI_IMAGE_LORA_STRENGTH_MIN = 0;
const CIVITAI_IMAGE_LORA_STRENGTH_MAX = 4;
const CIVITAI_KREA_FAL_STYLE_REF_MAX = 10;
const CIVITAI_KREA_FAL_STYLE_STRENGTH_MIN = -2;
const CIVITAI_KREA_FAL_STYLE_STRENGTH_MAX = 2;

export type CivitaiVideoWorkflowOptions = {
    readonly model: string;
    readonly service?: CivitaiGenerationService;
    readonly prompt: string;
    /** Strict provider/model scoped parameters. Unsupported non-empty fields are rejected. */
    readonly generationParameters?: VideoGenerationParameters;
    /** @deprecated Use generationParameters.duration. */
    readonly duration?: number | string;
    readonly aspectRatio?: string;
    readonly resolution?: string;
    readonly referenceKind: "none" | "first_frame" | "first_last_frame" | "reference_set" | "reference_set_with_first" | "reference_set_with_frames";
    readonly images: readonly string[];
    /** Explicit partitions are required for reference_set_with_frames; flattened images are never position-guessed. */
    readonly firstFrameImage?: string;
    readonly lastFrameImage?: string;
    readonly referenceImages?: readonly string[];
    readonly videos?: readonly string[];
    readonly audios?: readonly string[];
    readonly allowMatureContent?: boolean;
    /** LTX 2.3 uses a map; Hunyuan and WAN v2.2 Comfy use VideoGenInputLora arrays. */
    readonly loras?: Readonly<Record<string, number>>;
};

type CivitaiVideoReferenceParts = {
    readonly firstFrameImage?: string;
    readonly lastFrameImage?: string;
    readonly referenceImages: readonly string[];
};

export function buildCivitaiImageWorkflow(options: CivitaiImageWorkflowOptions) {
    const service = requireCivitaiService(options.model, options.service, "imageGen");
    if (String(service.parameters.engine || "").trim().toLowerCase() === "openai" && !isExactCivitaiOpenAIGptImage2Service(service)) {
        throw new Error(`Civitai / ${service.id} 不在已验证的 OpenAI 图片服务目录中；仅支持 gpt-image-2 createImage/editImage`);
    }
    const images = requireCompleteMediaArray(options.images || [], `Civitai / ${service.id} 参考图片`);
    const operation = service.parameters.operation || "";
    const engine = service.parameters.engine.toLowerCase();
    const kreaFal = isCivitaiFalKrea2Service(service);
    const acceptsOptionalImages = civitaiEngineAcceptsOptionalImages(engine);
    const requiresImage = (
        service.modalities.input.includes("image")
        || operation === "editImage"
        || operation === "proEditImage"
        || operation === "createVariant"
        || operation === "image-to-image"
    ) && !acceptsOptionalImages && !kreaFal;
    if (requiresImage && !images.length) throw new Error(`Civitai / ${options.model} 需要参考图片，请连接图片后重试`);
    if (images.length && !requiresImage && !acceptsOptionalImages && !kreaFal) {
        throw new Error(`Civitai / ${options.model} ${civitaiPureTextToImageReferenceMessage(service.id || options.model)}`);
    }
    if (operation === "createVariant" && images.length !== 1) throw new Error(`Civitai / ${options.model} 仅接受 1 张变体源图`);
    const imageInput = kreaFal
        ? {}
        : operation === "createVariant"
          ? { image: requireCivitaiImageSource(images[0], service) }
          : images.length
            ? { images }
            : {};
    const maskInput = buildCivitaiImageMaskInput(service, options.maskImage);
    const advancedInput = buildCivitaiImageAdvancedInput(service, options, images);
    return {
        allowMatureContent: options.allowMatureContent !== false,
        steps: [{
            $type: "imageGen",
            input: {
                ...service.parameters,
                ...(service.modalities.input.includes("text") || acceptsOptionalImages || kreaFal || operation === "createVariant" ? { prompt: options.prompt } : {}),
                ...buildCivitaiImageSettings(service, options),
                ...advancedInput,
                ...imageInput,
                ...maskInput,
            },
        }],
    };
}

function requireCivitaiImageSource(value: string | undefined, service: CivitaiGenerationService) {
    const source = nonEmptyString(value);
    const isUrl = /^https?:\/\/\S+$/i.test(source);
    const isDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(source);
    const isBase64 = source.length >= 4 && source.length % 4 === 0 && /^[a-z0-9+/]+={0,2}$/i.test(source);
    if (!isUrl && !isDataUrl && !isBase64) {
        throw new Error(`Civitai / ${service.id} 的 createVariant image 必须是 URL、图片 DataURL 或 Base64 字符串`);
    }
    return source;
}

function buildCivitaiImageMaskInput(service: CivitaiGenerationService, value: string | undefined) {
    if (value === undefined) return {};
    const maskImage = nonEmptyString(value);
    if (!maskImage) throw new Error(`Civitai / ${service.id} 的 maskImage 不能为空`);
    const parameters = service.parameters;
    const engine = String(parameters.engine || "").toLowerCase();
    const model = String(parameters.model || "").toLowerCase();
    const operation = String(parameters.operation || "").toLowerCase();
    const supportsMaskImage = engine === "openai" && model === "gpt-image-2" && operation === "editimage";
    if (!supportsMaskImage) throw new Error(`Civitai / ${service.id} 不支持 maskImage；不会把 Civitai 字段套到其他 service`);
    return { maskImage };
}

function buildCivitaiImageAdvancedInput(
    service: CivitaiGenerationService,
    options: CivitaiImageWorkflowOptions,
    images: readonly string[] = [],
) {
    const provided = providedCivitaiImageAdvancedFields(options);
    const parameters = service.parameters;
    const engine = parameters.engine.toLowerCase();
    const ecosystem = String(parameters.ecosystem || "").toLowerCase();
    const operation = String(parameters.operation || "").toLowerCase();
    const isZImage = engine === "sdcpp" && ecosystem === "zimage";
    const isSdxlVariant = engine === "sdcpp" && ecosystem === "sdxl" && operation === "createvariant";
    if (isCivitaiFalKrea2Service(service)) return buildCivitaiFalKrea2AdvancedInput(service, options, images);
    if (isSdxlVariant) return buildCivitaiSdxlVariantAdvancedInput(service, options);
    if (engine === "comfy") return buildCivitaiComfyAdvancedInput(service, options);
    if (engine === "sdcpp" && operation === "createvariant") {
        return buildCivitaiSdcppVariantAdvancedInput(service, options);
    }
    if (engine === "sdcpp" && (operation === "createimage" || operation === "editimage")) {
        return buildCivitaiSdcppAdvancedInput(service, options, isZImage);
    }
    if (isCivitaiFlux2KleinService(service)) return buildCivitaiFlux2KleinAdvancedInput(service, options);
    if (isCivitaiFlux2DevService(service)) return buildCivitaiFlux2DevAdvancedInput(service, options);
    if (isCivitaiArrayLoraImageService(service)) {
        const leftover = provided.filter((field) => field !== "loras");
        if (leftover.length) throw new Error(`Civitai / ${service.id} 不支持高级图片参数：${leftover.join("、")}；当前 service 没有已验证的 serializer`);
        const loras = normalizeCivitaiLoraArray(options.loras, service);
        return loras ? { loras } : {};
    }
    if (provided.includes("loras")) throw new Error(civitaiLoraUnsupportedMessage(service.id));
    if (provided.length) throw new Error(`Civitai / ${service.id} 不支持高级图片参数：${provided.join("、")}；当前 service 没有已验证的 serializer`);
    return {};
}

function isCivitaiFlux2KleinService(service: CivitaiGenerationService) {
    return service.parameters.engine.toLowerCase() === "flux2" && String(service.parameters.model || "").toLowerCase() === "klein";
}

function isCivitaiFlux2DevService(service: CivitaiGenerationService) {
    return service.parameters.engine.toLowerCase() === "flux2" && String(service.parameters.model || "").toLowerCase() === "dev";
}

function isCivitaiArrayLoraImageService(service: CivitaiGenerationService) {
    return isCivitaiArrayLoraService(service.id)
        || (service.parameters.engine.toLowerCase() === "flux2" && String(service.parameters.model || "").toLowerCase() === "dev")
        || service.parameters.engine.toLowerCase() === "wan";
}

function buildCivitaiFalKrea2AdvancedInput(
    service: CivitaiGenerationService,
    options: CivitaiImageWorkflowOptions,
    images: readonly string[],
) {
    const leftover = providedCivitaiImageAdvancedFields(options).filter((field) => field !== "seed" && field !== "imageStyleReferences");
    if (leftover.length) throw new Error(`Civitai / ${service.id} 不支持高级图片参数：${leftover.join("、")}；Krea FAL 合同只有 seed / imageStyleReferences`);
    if (options.seed !== undefined && !Number.isSafeInteger(options.seed)) {
        throw new Error(`Civitai / ${service.id} 的 seed 必须是 JavaScript 可精确表示的安全整数`);
    }
    return {
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        imageStyleReferences: normalizeCivitaiKreaFalStyleReferences(service, options, images),
    };
}

function normalizeCivitaiKreaFalStyleReferences(
    service: CivitaiGenerationService,
    options: CivitaiImageWorkflowOptions,
    images: readonly string[],
) {
    const explicit = options.imageStyleReferences;
    if (explicit && images.length) {
        throw new Error(`Civitai / ${service.id} 不能同时发送 images[] 和 imageStyleReferences；FAL Krea 只用 imageStyleReferences`);
    }
    const refs = explicit
        ? explicit.map((entry, index) => normalizeCivitaiKreaFalStyleReference(service, entry, index))
        : images.map((imageUrl, index) => normalizeCivitaiKreaFalStyleReference(service, { imageUrl }, index));
    if (refs.length > CIVITAI_KREA_FAL_STYLE_REF_MAX) {
        throw new Error(`Civitai / ${service.id} 的 imageStyleReferences 最多 ${CIVITAI_KREA_FAL_STYLE_REF_MAX} 项`);
    }
    return refs;
}

function normalizeCivitaiKreaFalStyleReference(
    service: CivitaiGenerationService,
    entry: CivitaiImageStyleReference | undefined,
    index: number,
) {
    if (!entry || typeof entry !== "object") {
        throw new Error(`Civitai / ${service.id} 的 imageStyleReferences[${index}] 必须是 {imageUrl, strength?} 对象`);
    }
    const imageUrl = nonEmptyString(entry.imageUrl);
    if (!imageUrl) throw new Error(`Civitai / ${service.id} 的 imageStyleReferences[${index}].imageUrl 不能为空`);
    if (entry.strength === undefined) return { imageUrl };
    if (typeof entry.strength !== "number" || !Number.isFinite(entry.strength)) {
        throw new Error(`Civitai / ${service.id} 的 imageStyleReferences[${index}].strength 必须是有限数字`);
    }
    if (entry.strength < CIVITAI_KREA_FAL_STYLE_STRENGTH_MIN || entry.strength > CIVITAI_KREA_FAL_STYLE_STRENGTH_MAX) {
        throw new Error(`Civitai / ${service.id} 的 imageStyleReferences strength 必须在 ${CIVITAI_KREA_FAL_STYLE_STRENGTH_MIN}..${CIVITAI_KREA_FAL_STYLE_STRENGTH_MAX} 范围内`);
    }
    return { imageUrl, strength: entry.strength };
}

/** engine: "sdcpp" createVariant — image + strength. SDXL checkpoint AIR stays on the dedicated serializer. */
function buildCivitaiSdcppVariantAdvancedInput(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions) {
    const parameters = service.parameters;
    const allowedParameters = new Set(["engine", "ecosystem", "model", "operation", "version", "provider", "modelVersion"]);
    const unknownParameters = Object.keys(parameters).filter((key) => !allowedParameters.has(key));
    if (unknownParameters.length) throw new Error(`Civitai / ${service.id} 的 sdcpp createVariant service parameters 含未声明字段：${unknownParameters.join("、")}`);
    const leftover = providedCivitaiImageAdvancedFields(options).filter((field) => field !== "strength" && field !== "loras");
    if (leftover.length) throw new Error(`Civitai / ${service.id} 的 createVariant 不支持高级图片参数：${leftover.join("、")}`);
    const ecosystem = String(parameters.ecosystem || "").toLowerCase();
    const flux2Variant = ecosystem === "flux2klein" || ecosystem === "flux2dev";
    if (flux2Variant) {
        assertOptionalIntegerRange("width", options.width, 512, 2048, service);
        assertOptionalIntegerRange("height", options.height, 512, 2048, service);
        assertIntegerRange("quantity", options.quantity, 1, 4, service);
    }
    const strength = options.strength ?? 0.7;
    assertFiniteRange("strength", strength, 0, 1, service);
    const loras = ecosystem === "flux2dev"
        ? normalizeCivitaiLoraArray(options.loras, service)
        : normalizeCivitaiLoras(options.loras, service);
    return {
        strength,
        ...(parameters.modelVersion ? { modelVersion: parameters.modelVersion } : {}),
        ...(loras ? { loras } : {}),
    };
}

/** engine: "sdcpp" → sampleMethod/schedule。覆盖 Z-Image、anima、sdxl、qwen 等 createImage/editImage 服务。 */
function buildCivitaiSdcppAdvancedInput(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions, isZImage: boolean) {
    const parameters = service.parameters;
    const allowedParameters = new Set(["engine", "ecosystem", "model", "operation", "version", "provider", "modelVersion"]);
    const unknownParameters = Object.keys(parameters).filter((key) => !allowedParameters.has(key));
    if (unknownParameters.length) throw new Error(`Civitai / ${service.id} 的 sdcpp service parameters 含未声明字段：${unknownParameters.join("、")}`);
    if (isZImage && parameters.model !== "turbo" && parameters.model !== "base") throw new Error(`Civitai / ${service.id} 的 Z-Image model ${parameters.model || "未声明"} 不受支持`);
    if (options.outputFormat && !["jpeg", "png", "webP"].includes(options.outputFormat)) {
        throw new Error(`Civitai / ${service.id} 的 outputFormat 不支持 ${options.outputFormat}；允许值：jpeg, png, webP`);
    }

    assertOptionalIntegerRange("width", options.width, 64, 2048, service);
    assertOptionalIntegerRange("height", options.height, 64, 2048, service);
    assertIntegerRange("quantity", options.quantity, 1, 12, service);
    if ([...options.prompt].length > 10_000) throw new Error(`Civitai / ${service.id} 的 prompt 最长为 10000 个字符`);

    const negativePrompt = nonEmptyString(options.negativePrompt);
    if (negativePrompt && [...negativePrompt].length > 10_000) throw new Error(`Civitai / ${service.id} 的 negativePrompt 最长为 10000 个字符`);
    const cfgScale = resolveNumberAlias(options.guidance, options.cfgScale, "guidance", "cfgScale", service);
    const sampleMethod = resolveStringAlias(options.sampler, options.sampleMethod, "sampler", "sampleMethod", service);
    const schedule = resolveStringAlias(options.scheduler, options.schedule, "scheduler", "schedule", service);

    if (options.steps !== undefined) assertIntegerRange("steps", options.steps, 1, 150, service);
    if (cfgScale !== undefined) assertFiniteRange("cfgScale", cfgScale, 0, 30, service);
    if (options.seed !== undefined) {
        if (!Number.isFinite(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是有限数字`);
        if (!Number.isInteger(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是整数`);
        if (!Number.isSafeInteger(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是 JavaScript 可精确表示的安全整数`);
    }
    if (sampleMethod && !CIVITAI_SDCPP_SAMPLE_METHODS.some((value) => value === sampleMethod)) {
        throw new Error(`Civitai / ${service.id} 的 sampleMethod 不支持 ${sampleMethod}；允许值：${CIVITAI_SDCPP_SAMPLE_METHODS.join(", ")}`);
    }
    if (schedule && !CIVITAI_SDCPP_SCHEDULES.some((value) => value === schedule)) {
        throw new Error(`Civitai / ${service.id} 的 schedule 不支持 ${schedule}；允许值：${CIVITAI_SDCPP_SCHEDULES.join(", ")}`);
    }
    const loras = normalizeCivitaiLoras(options.loras, service);
    const clipSkip = resolveCivitaiClipSkip(service, options);
    const isEdit = parameters.operation === "editImage";
    const strength = isEdit && options.strength !== undefined ? options.strength : undefined;
    if (strength !== undefined) assertFiniteRange("strength", strength, 0, 1, service);

    return {
        ...(negativePrompt ? { negativePrompt } : {}),
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.steps !== undefined ? { steps: options.steps } : {}),
        ...(cfgScale !== undefined ? { cfgScale } : {}),
        ...(sampleMethod ? { sampleMethod } : {}),
        ...(schedule ? { schedule } : {}),
        ...(loras ? { loras } : {}),
        ...(clipSkip !== undefined ? { clipSkip } : {}),
        ...(strength !== undefined ? { strength } : {}),
    };
}

/** engine: "flux2" Klein — cfgScale 1-20, steps 4-50, sampleMethod/schedule, negativePrompt, seed, modelVersion, loras map. https://orchestration.civitai.com/openapi/v2-consumers.json */
function buildCivitaiFlux2KleinAdvancedInput(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions) {
    const parameters = service.parameters;
    const allowedParameters = new Set(["engine", "model", "operation", "version", "provider", "modelVersion"]);
    const unknownParameters = Object.keys(parameters).filter((key) => !allowedParameters.has(key));
    if (unknownParameters.length) throw new Error(`Civitai / ${service.id} 的 flux2 klein service parameters 含未声明字段：${unknownParameters.join("、")}`);
    const leftover = providedCivitaiImageAdvancedFields(options).filter((field) => (
        field !== "negativePrompt" && field !== "cfgScale" && field !== "steps"
        && field !== "seed" && field !== "sampler" && field !== "scheduler"
        && field !== "loras" && field !== "modelVersion"
    ));
    if (leftover.length) throw new Error(`Civitai / ${service.id} 不支持高级图片参数：${leftover.join("、")}；Flux2 Klein 只有 negativePrompt/cfgScale/steps/seed/sampler/scheduler/loras/modelVersion`);
    assertOptionalIntegerRange("width", options.width, 512, 2048, service);
    assertOptionalIntegerRange("height", options.height, 512, 2048, service);
    assertIntegerRange("quantity", options.quantity, 1, 4, service);
    if ([...options.prompt].length > 1000) throw new Error(`Civitai / ${service.id} 的 prompt 最长为 1000 个字符`);

    const negativePrompt = nonEmptyString(options.negativePrompt);
    const cfgScale = resolveNumberAlias(options.guidance, options.cfgScale, "guidance", "cfgScale", service);
    const sampleMethod = resolveStringAlias(options.sampler, options.sampleMethod, "sampler", "sampleMethod", service);
    const schedule = resolveStringAlias(options.scheduler, options.schedule, "scheduler", "schedule", service);
    if (options.steps !== undefined) assertIntegerRange("steps", options.steps, 4, 50, service);
    if (cfgScale !== undefined) assertFiniteRange("cfgScale", cfgScale, 1, 20, service);
    if (options.seed !== undefined && !Number.isSafeInteger(options.seed)) {
        throw new Error(`Civitai / ${service.id} 的 seed 必须是 JavaScript 可精确表示的安全整数`);
    }
    if (sampleMethod && !CIVITAI_SDCPP_SAMPLE_METHODS.some((value) => value === sampleMethod)) {
        throw new Error(`Civitai / ${service.id} 的 sampleMethod 不支持 ${sampleMethod}；允许值：${CIVITAI_SDCPP_SAMPLE_METHODS.join(", ")}`);
    }
    if (schedule && !CIVITAI_SDCPP_SCHEDULES.some((value) => value === schedule)) {
        throw new Error(`Civitai / ${service.id} 的 schedule 不支持 ${schedule}；允许值：${CIVITAI_SDCPP_SCHEDULES.join(", ")}`);
    }
    const modelVersion = options.modelVersion;
    if (modelVersion !== undefined && !["4b", "4b-base", "9b", "9b-base", "9b-kv"].includes(modelVersion)) {
        throw new Error(`Civitai / ${service.id} 的 modelVersion 不支持 ${modelVersion}；允许值：4b, 4b-base, 9b, 9b-base, 9b-kv`);
    }
    const loras = normalizeCivitaiLoras(options.loras, service);
    return {
        ...(negativePrompt ? { negativePrompt } : {}),
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.steps !== undefined ? { steps: options.steps } : {}),
        ...(cfgScale !== undefined ? { cfgScale } : {}),
        ...(sampleMethod ? { sampleMethod } : {}),
        ...(schedule ? { schedule } : {}),
        ...(modelVersion ? { modelVersion } : {}),
        ...(loras ? { loras } : {}),
    };
}

/** engine: "flux2" Dev — guidanceScale 0-20, numInferenceSteps 4-50, seed, loras array; no negativePrompt/sampler/scheduler. https://orchestration.civitai.com/openapi/v2-consumers.json */
function buildCivitaiFlux2DevAdvancedInput(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions) {
    const parameters = service.parameters;
    const allowedParameters = new Set(["engine", "model", "operation", "version", "provider"]);
    const unknownParameters = Object.keys(parameters).filter((key) => !allowedParameters.has(key));
    if (unknownParameters.length) throw new Error(`Civitai / ${service.id} 的 flux2 dev service parameters 含未声明字段：${unknownParameters.join("、")}`);
    const leftover = providedCivitaiImageAdvancedFields(options).filter((field) => (
        field !== "seed" && field !== "guidanceScale" && field !== "numInferenceSteps" && field !== "loras"
    ));
    if (leftover.length) throw new Error(`Civitai / ${service.id} 不支持高级图片参数：${leftover.join("、")}；Flux2 Dev 只有 seed/guidanceScale/numInferenceSteps/loras`);
    assertOptionalIntegerRange("width", options.width, 512, 2048, service);
    assertOptionalIntegerRange("height", options.height, 512, 2048, service);
    assertIntegerRange("quantity", options.quantity, 1, 4, service);
    if ([...options.prompt].length > 1000) throw new Error(`Civitai / ${service.id} 的 prompt 最长为 1000 个字符`);
    if (options.seed !== undefined && !Number.isSafeInteger(options.seed)) {
        throw new Error(`Civitai / ${service.id} 的 seed 必须是 JavaScript 可精确表示的安全整数`);
    }
    if (options.guidanceScale !== undefined) assertFiniteRange("guidanceScale", options.guidanceScale, 0, 20, service);
    if (options.numInferenceSteps !== undefined) assertIntegerRange("numInferenceSteps", options.numInferenceSteps, 4, 50, service);
    const loras = normalizeCivitaiLoraArray(options.loras, service);
    return {
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.guidanceScale !== undefined ? { guidanceScale: options.guidanceScale } : {}),
        ...(options.numInferenceSteps !== undefined ? { numInferenceSteps: options.numInferenceSteps } : {}),
        ...(loras ? { loras } : {}),
    };
}

/** engine: "comfy" → sampler/scheduler（与 sdcpp 的 sampleMethod/schedule 互斥，混传上游 400）。 */
function buildCivitaiComfyAdvancedInput(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions) {
    const parameters = service.parameters;
    const allowedParameters = new Set(["engine", "ecosystem", "model", "operation", "version", "provider", "modelVersion"]);
    const unknownParameters = Object.keys(parameters).filter((key) => !allowedParameters.has(key));
    if (unknownParameters.length) throw new Error(`Civitai / ${service.id} 的 comfy service parameters 含未声明字段：${unknownParameters.join("、")}`);
    if (parameters.operation !== "createImage" && parameters.operation !== "editImage" && parameters.operation !== "createVariant") {
        throw new Error(`Civitai / ${service.id} 的 comfy operation ${parameters.operation || "未声明"} 没有已验证的 serializer`);
    }
    if (options.outputFormat && !["jpeg", "png", "webP"].includes(options.outputFormat)) {
        throw new Error(`Civitai / ${service.id} 的 outputFormat 不支持 ${options.outputFormat}；允许值：jpeg, png, webP`);
    }

    assertOptionalIntegerRange("width", options.width, 64, 2048, service);
    assertOptionalIntegerRange("height", options.height, 64, 2048, service);
    assertIntegerRange("quantity", options.quantity, 1, 12, service);
    if ([...options.prompt].length > 10_000) throw new Error(`Civitai / ${service.id} 的 prompt 最长为 10000 个字符`);

    const negativePrompt = nonEmptyString(options.negativePrompt);
    if (negativePrompt && [...negativePrompt].length > 10_000) throw new Error(`Civitai / ${service.id} 的 negativePrompt 最长为 10000 个字符`);
    const cfgScale = resolveNumberAlias(options.guidance, options.cfgScale, "guidance", "cfgScale", service);
    const sampler = resolveStringAlias(options.sampler, undefined, "sampler", "sampler", service);
    const scheduler = resolveStringAlias(options.scheduler, undefined, "scheduler", "scheduler", service);
    if (options.sampleMethod) throw new Error(`Civitai / ${service.id} 是 comfy 引擎，不接受 sdcpp 的 sampleMethod；请使用 sampler`);
    if (options.schedule) throw new Error(`Civitai / ${service.id} 是 comfy 引擎，不接受 sdcpp 的 schedule；请使用 scheduler`);

    if (options.steps !== undefined) assertIntegerRange("steps", options.steps, 1, 150, service);
    if (cfgScale !== undefined) assertFiniteRange("cfgScale", cfgScale, 0, 30, service);
    if (options.seed !== undefined) {
        if (!Number.isFinite(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是有限数字`);
        if (!Number.isInteger(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是整数`);
        if (!Number.isSafeInteger(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是 JavaScript 可精确表示的安全整数`);
    }
    if (sampler && !CIVITAI_COMFY_SAMPLERS.some((value) => value === sampler)) {
        throw new Error(`Civitai / ${service.id} 的 sampler 不支持 ${sampler}；允许值：${CIVITAI_COMFY_SAMPLERS.join(", ")}`);
    }
    if (scheduler && !CIVITAI_COMFY_SCHEDULERS.some((value) => value === scheduler)) {
        throw new Error(`Civitai / ${service.id} 的 scheduler 不支持 ${scheduler}；允许值：${CIVITAI_COMFY_SCHEDULERS.join(", ")}`);
    }
    const loras = normalizeCivitaiLoras(options.loras, service);
    const clipSkip = resolveCivitaiClipSkip(service, options);
    const krea2Edit = parameters.ecosystem === "krea2" && parameters.operation === "editImage";
    const denoiseStrength = krea2Edit
        ? options.denoiseStrength
        : options.denoiseStrength
          ?? (parameters.operation === "editImage" || parameters.operation === "createVariant" ? options.strength : undefined);
    if (denoiseStrength !== undefined) assertFiniteRange("denoiseStrength", denoiseStrength, 0, 1, service);

    return {
        ...(negativePrompt ? { negativePrompt } : {}),
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.steps !== undefined ? { steps: options.steps } : {}),
        ...(cfgScale !== undefined ? { cfgScale } : {}),
        ...(sampler ? { sampler: sampler as CivitaiComfySampler } : {}),
        ...(scheduler ? { scheduler: scheduler as CivitaiComfyScheduler } : {}),
        ...(loras ? { loras } : {}),
        ...(clipSkip !== undefined ? { clipSkip } : {}),
        ...(denoiseStrength !== undefined ? { denoiseStrength } : {}),
    };
}

function resolveCivitaiClipSkip(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions) {
    if (options.clipSkip === undefined) return undefined;
    assertIntegerRange("clipSkip", options.clipSkip, 1, 12, service);
    if (service.parameters.ecosystem !== "sd1") {
        throw new Error(`Civitai / ${service.id} 的 clipSkip 仅 SD1 ecosystem 可用；SDXL 传 clipSkip 会被上游拒绝`);
    }
    return options.clipSkip;
}

function normalizeCivitaiSdxlLoras(value: Readonly<Record<string, number>> | undefined, service: CivitaiGenerationService) {
    if (value === undefined) return undefined;
    if (!isRecord(value)) throw new Error(`Civitai / ${service.id} 的 loras 必须是 AIR 到权重的对象映射`);
    const normalized: Record<string, number> = {};
    for (const [resource, weight] of Object.entries(value)) {
        if (typeof weight !== "number" || !Number.isFinite(weight)) throw new Error(`Civitai / ${service.id} 的 loras 权重必须是有限数字：${resource || "空 key"}`);
        const parsed = parseCivitaiLoraAir(resource);
        if (!parsed || parsed.ecosystem !== "sdxl") throw new Error(`Civitai / ${service.id} 的 loras key 必须是完整 SDXL LoRA model-version AIR：${resource || "空 key"}`);
        if (Object.prototype.hasOwnProperty.call(normalized, parsed.air)) throw new Error(`Civitai / ${service.id} 的多个 loras key 规范化为同一个 AIR：${parsed.air}`);
        normalized[parsed.air] = weight;
    }
    return Object.keys(normalized).length ? normalized : undefined;
}

function buildCivitaiSdxlVariantAdvancedInput(service: CivitaiGenerationService, options: CivitaiImageWorkflowOptions) {
    const allowedParameters = new Set(["engine", "ecosystem", "operation"]);
    const unknownParameters = Object.keys(service.parameters).filter((key) => !allowedParameters.has(key));
    if (unknownParameters.length) throw new Error(`Civitai / ${service.id} 的 SDXL createVariant service parameters 含未声明字段：${unknownParameters.join("、")}`);
    if (options.outputFormat) throw new Error(`Civitai / ${service.id} 的 live OpenAPI 没有 outputFormat 字段`);
    assertOptionalIntegerRange("width", options.width, 64, 2048, service);
    assertOptionalIntegerRange("height", options.height, 64, 2048, service);
    assertIntegerRange("quantity", options.quantity, 1, 12, service);
    if ([...options.prompt].length > 10_000) throw new Error(`Civitai / ${service.id} 的 prompt 最长为 10000 个字符`);
    const model = requireCivitaiSdxlAir("checkpointAir", options.checkpointAir, "checkpoint");
    const vaeModel = options.vaeAir ? requireCivitaiSdxlAir("vaeAir", options.vaeAir, "vae") : undefined;
    const embeddings = options.embeddings?.map((value, index) => requireCivitaiSdxlAir(`embeddings[${index}]`, value, "embedding"));
    const strength = options.strength ?? 0.7;
    assertFiniteRange("strength", strength, 0, 1, service);
    const negativePrompt = nonEmptyString(options.negativePrompt);
    if (negativePrompt && [...negativePrompt].length > 10_000) throw new Error(`Civitai / ${service.id} 的 negativePrompt 最长为 10000 个字符`);
    if (options.steps !== undefined) assertIntegerRange("steps", options.steps, 1, 150, service);
    if (options.cfgScale !== undefined) assertFiniteRange("cfgScale", options.cfgScale, 0, 30, service);
    if (options.seed !== undefined) {
        if (!Number.isSafeInteger(options.seed)) throw new Error(`Civitai / ${service.id} 的 seed 必须是 JavaScript 可精确表示的安全整数`);
    }
    const sampleMethod = resolveStringAlias(options.sampler, options.sampleMethod, "sampler", "sampleMethod", service);
    const schedule = resolveStringAlias(options.scheduler, options.schedule, "scheduler", "schedule", service);
    if (sampleMethod && !CIVITAI_SDCPP_SAMPLE_METHODS.some((value) => value === sampleMethod)) {
        throw new Error(`Civitai / ${service.id} 的 sampleMethod 不支持 ${sampleMethod}；允许值：${CIVITAI_SDCPP_SAMPLE_METHODS.join(", ")}`);
    }
    if (schedule && !CIVITAI_SDCPP_SCHEDULES.some((value) => value === schedule)) {
        throw new Error(`Civitai / ${service.id} 的 schedule 不支持 ${schedule}；允许值：${CIVITAI_SDCPP_SCHEDULES.join(", ")}`);
    }
    const loras = normalizeCivitaiSdxlLoras(options.loras, service);
    return {
        prompt: options.prompt,
        model,
        strength,
        ...(negativePrompt ? { negativePrompt } : {}),
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.steps !== undefined ? { steps: options.steps } : {}),
        ...(options.cfgScale !== undefined ? { cfgScale: options.cfgScale } : {}),
        ...(sampleMethod ? { sampleMethod } : {}),
        ...(schedule ? { schedule } : {}),
        ...(vaeModel ? { vaeModel } : {}),
        ...(loras ? { loras } : {}),
        ...(embeddings?.length ? { embeddings } : {}),
        ...(options.uCache ? { uCache: options.uCache } : {}),
    };
}

function requireCivitaiSdxlAir(label: string, value: string | undefined, type: "checkpoint" | "vae" | "embedding") {
    const normalized = nonEmptyString(value);
    const pattern = new RegExp(`^urn:air:sdxl:${type}:civitai:[1-9]\\d*@[1-9]\\d*$`, "i");
    if (!pattern.test(normalized)) {
        throw new Error(`Civitai SDXL createVariant 的 ${label} 必须是完整 model-version AIR：urn:air:sdxl:${type}:civitai:<modelId>@<versionId>`);
    }
    return normalized;
}

function providedCivitaiImageAdvancedFields(options: CivitaiImageWorkflowOptions) {
    const fields: string[] = [];
    if (nonEmptyString(options.outputFormat)) fields.push("outputFormat");
    if (nonEmptyString(options.negativePrompt)) fields.push("negativePrompt");
    if (options.seed !== undefined) fields.push("seed");
    if (options.steps !== undefined) fields.push("steps");
    if (options.guidance !== undefined) fields.push("guidance");
    if (options.cfgScale !== undefined) fields.push("cfgScale");
    if (options.guidanceScale !== undefined) fields.push("guidanceScale");
    if (options.numInferenceSteps !== undefined) fields.push("numInferenceSteps");
    if (nonEmptyString(options.sampler)) fields.push("sampler");
    if (nonEmptyString(options.sampleMethod)) fields.push("sampleMethod");
    if (nonEmptyString(options.scheduler)) fields.push("scheduler");
    if (nonEmptyString(options.schedule)) fields.push("schedule");
    if (options.loras !== undefined && (!isRecord(options.loras) || Object.keys(options.loras).length)) fields.push("loras");
    if (options.imageStyleReferences !== undefined) fields.push("imageStyleReferences");
    if (nonEmptyString(options.checkpointAir)) fields.push("checkpointAir");
    if (options.strength !== undefined) fields.push("strength");
    if (nonEmptyString(options.vaeAir)) fields.push("vaeAir");
    if (options.embeddings?.length) fields.push("embeddings");
    if (options.uCache) fields.push("uCache");
    if (options.clipSkip !== undefined) fields.push("clipSkip");
    if (options.denoiseStrength !== undefined) fields.push("denoiseStrength");
    if (options.modelVersion !== undefined) fields.push("modelVersion");
    return fields;
}

function resolveNumberAlias(
    alias: number | undefined,
    canonical: number | undefined,
    aliasName: string,
    canonicalName: string,
    service: CivitaiGenerationService,
) {
    if (alias !== undefined && canonical !== undefined && !Object.is(alias, canonical)) {
        throw new Error(`Civitai / ${service.id} 的 ${aliasName} 与 ${canonicalName} 值冲突`);
    }
    return canonical ?? alias;
}

function resolveStringAlias(
    alias: string | undefined,
    canonical: string | undefined,
    aliasName: string,
    canonicalName: string,
    service: CivitaiGenerationService,
) {
    const normalizedAlias = nonEmptyString(alias);
    const normalizedCanonical = nonEmptyString(canonical);
    if (normalizedAlias && normalizedCanonical && normalizedAlias !== normalizedCanonical) {
        throw new Error(`Civitai / ${service.id} 的 ${aliasName} 与 ${canonicalName} 值冲突`);
    }
    return normalizedCanonical || normalizedAlias || undefined;
}

function normalizeCivitaiLoras(value: Readonly<Record<string, number>> | undefined, service: CivitaiGenerationService) {
    if (value === undefined) return undefined;
    if (!isRecord(value)) throw new Error(`Civitai / ${service.id} 的 loras 必须是 AIR 到权重的对象映射`);
    const entries = Object.entries(value);
    if (!entries.length) return undefined;
    const normalized: Record<string, number> = {};
    for (const [resource, weight] of entries) {
        if (typeof weight !== "number" || !Number.isFinite(weight)) throw new Error(`Civitai / ${service.id} 的 loras 权重必须是有限数字：${resource || "空 key"}`);
        const parsed = parseCivitaiLoraAir(resource);
        if (!parsed) throw new Error(`Civitai / ${service.id} 的 loras key 必须是完整的 Civitai LoRA model-version AIR：${resource || "空 key"}`);
        assertCivitaiLoraCompatibility(parsed, service.id);
        if (Object.prototype.hasOwnProperty.call(normalized, parsed.air)) {
            throw new Error(`Civitai / ${service.id} 的多个 loras key 规范化为同一个 AIR：${parsed.air}`);
        }
        normalized[parsed.air] = weight;
    }
    return normalized;
}

function normalizeCivitaiLoraArray(value: Readonly<Record<string, number>> | undefined, service: CivitaiGenerationService) {
    const mapped = normalizeCivitaiLoras(value, service);
    if (!mapped) return undefined;
    return Object.entries(mapped).map(([air, strength]) => {
        if (strength < CIVITAI_IMAGE_LORA_STRENGTH_MIN || strength > CIVITAI_IMAGE_LORA_STRENGTH_MAX) {
            throw new Error(`Civitai / ${service.id} 的 loras strength 必须在 ${CIVITAI_IMAGE_LORA_STRENGTH_MIN}..${CIVITAI_IMAGE_LORA_STRENGTH_MAX} 范围内`);
        }
        return { air, strength };
    });
}

function assertIntegerRange(label: string, value: number, minimum: number, maximum: number, service: CivitaiGenerationService) {
    if (!Number.isFinite(value)) throw new Error(`Civitai / ${service.id} 的 ${label} 必须是有限数字`);
    if (!Number.isInteger(value)) throw new Error(`Civitai / ${service.id} 的 ${label} 必须是整数`);
    if (value < minimum || value > maximum) throw new Error(`Civitai / ${service.id} 的 ${label} 必须在 ${minimum}..${maximum} 范围内`);
}

function assertOptionalIntegerRange(label: string, value: number | undefined, minimum: number, maximum: number, service: CivitaiGenerationService) {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    assertIntegerRange(label, value, minimum, maximum, service);
}

function assertFiniteRange(label: string, value: number, minimum: number, maximum: number, service: CivitaiGenerationService) {
    if (!Number.isFinite(value)) throw new Error(`Civitai / ${service.id} 的 ${label} 必须是有限数字`);
    if (value < minimum || value > maximum) throw new Error(`Civitai / ${service.id} 的 ${label} 必须在 ${minimum}..${maximum} 范围内`);
}

function nonEmptyString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function requireCompleteMediaValue(value: unknown, label: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label}内容为空或无效；已停止提交，未发送 HTTP 请求`);
    }
    return value;
}

function requireCompleteMediaArray(values: readonly unknown[], label: string): string[] {
    return values.map((value, index) => requireCompleteMediaValue(value, `${label}第 ${index + 1} 项`));
}

export function buildCivitaiVideoWorkflow(options: CivitaiVideoWorkflowOptions) {
    const service = requireCivitaiService(options.model, options.service, "videoGen");
    const capability = civitaiVideoCapability(options.model, service);
    const generationParameters = resolveCivitaiVideoGenerationParameters(capability, options);
    const images = requireCompleteMediaArray(options.images, `Civitai / ${service.id} 参考图片`);
    const videos = requireCompleteMediaArray(options.videos || [], `Civitai / ${service.id} 参考视频`);
    const audios = requireCompleteMediaArray(options.audios || [], `Civitai / ${service.id} 参考音频`);
    const referenceParts: CivitaiVideoReferenceParts = {
        ...(options.firstFrameImage !== undefined
            ? { firstFrameImage: requireCompleteMediaValue(options.firstFrameImage, `Civitai / ${service.id} 首帧`) }
            : {}),
        ...(options.lastFrameImage !== undefined
            ? { lastFrameImage: requireCompleteMediaValue(options.lastFrameImage, `Civitai / ${service.id} 尾帧`) }
            : {}),
        referenceImages: requireCompleteMediaArray(options.referenceImages || [], `Civitai / ${service.id} 普通参考图片`),
    };
    const mediaInput = buildCivitaiVideoMediaInput(service, options.referenceKind, images, videos, audios, referenceParts);
    const videoSettings = buildCivitaiVideoSettings(capability, generationParameters);
    const videoLoras = buildCivitaiVideoLoras(service, options.loras);
    return {
        allowMatureContent: options.allowMatureContent !== false,
        steps: [{
            $type: "videoGen",
            input: {
                ...service.parameters,
                prompt: options.prompt,
                ...mediaInput,
                ...videoSettings,
                ...videoLoras,
            },
        }],
    };
}

function normalizeCivitaiVideoLoras(value: Readonly<Record<string, number>>, service: CivitaiGenerationService) {
    if (!isRecord(value)) throw new Error(`Civitai / ${service.id} 的 loras 必须是 AIR 到权重的对象映射`);
    const normalized: Record<string, number> = {};
    for (const [resource, strength] of Object.entries(value)) {
        if (typeof strength !== "number" || !Number.isFinite(strength)) {
            throw new Error(`Civitai / ${service.id} 的 loras strength 必须是有限数字：${resource || "空 key"}`);
        }
        const parsed = parseCivitaiLoraAir(resource);
        if (!parsed) throw new Error(`Civitai / ${service.id} 的 loras key 必须是完整的 Civitai LoRA model-version AIR：${resource || "空 key"}`);
        if (Object.prototype.hasOwnProperty.call(normalized, parsed.air)) {
            throw new Error(`Civitai / ${service.id} 的多个 loras key 规范化为同一个 AIR：${parsed.air}`);
        }
        normalized[parsed.air] = strength;
    }
    return normalized;
}

/** LTX 2.3 uses a map; Hunyuan and WAN v2.2 Comfy use VideoGenInputLora arrays with no published strength max. */
function buildCivitaiVideoLoras(service: CivitaiGenerationService, value: Readonly<Record<string, number>> | undefined) {
    if (value === undefined || !Object.keys(value).length) return {};
    const engine = service.parameters.engine.toLowerCase();
    const version = String(service.parameters.version || "").toLowerCase();
    const provider = String(service.parameters.provider || "").toLowerCase();
    if (engine === "ltx2.3") return { loras: normalizeCivitaiVideoLoras(value, service) };
    if (engine === "hunyuan" || (engine === "wan" && version === "v2.2" && provider === "comfy")) {
        return {
            loras: Object.entries(normalizeCivitaiVideoLoras(value, service)).map(([air, strength]) => ({ air, strength })),
        };
    }
    throw new Error(`Civitai / ${service.id} 不接受 LoRA；当前引擎没有已验证的视频 LoRA 合同`);
}

function buildCivitaiVideoMediaInput(
    service: CivitaiGenerationService,
    referenceKind: CivitaiVideoWorkflowOptions["referenceKind"],
    images: string[],
    videos: string[],
    audios: string[],
    referenceParts: CivitaiVideoReferenceParts,
) {
    const contractServiceId = service.id === "legacy"
        ? service.parameters.engine.toLowerCase() === "kling-v3"
          ? "video/kling-v3"
          : service.parameters.engine.toLowerCase() === "vidu-q3"
            ? "video/vidu-q3"
            : modelServiceIdUnavailable(service)
        : service.id;
    const contract = resolveCivitaiVideoMediaContract(contractServiceId);
    if (!contract) {
        throw new Error(`Civitai / ${service.id} 没有经过当前 live OpenAPI 验证的视频媒体合同，已停止提交`);
    }
    if (!contract.referenceKinds.includes(referenceKind)) {
        throw new Error(`Civitai / ${service.id} 不接受 ${referenceKind} 媒体意图；不会把素材改解释为其他角色`);
    }
    if (referenceKind === "none" && images.length) {
        throw new Error(`Civitai / ${service.id} 收到图片但 referenceKind=none，已停止提交以避免误传`);
    }
    if (contract.imageMaximum !== null && images.length > contract.imageMaximum) {
        throw new Error(`Civitai / ${service.id} 的 live schema 最多接受 ${contract.imageMaximum} 张图片，当前为 ${images.length} 张；不会自动截断`);
    }
    if (videos.length && !contract.acceptsReferenceVideos) {
        throw new Error(`Civitai / ${service.id} 的当前媒体合同不接受参考视频`);
    }
    if (audios.length && !contract.acceptsReferenceAudios) {
        throw new Error(`Civitai / ${service.id} 的当前媒体合同不接受参考音频`);
    }
    const engine = service.parameters.engine.toLowerCase();
    const operation = service.parameters.operation || "";
    const version = service.parameters.version || "";
    const provider = service.parameters.provider || "";
    if (engine === "seedance") {
        if (referenceKind === "first_frame" || referenceKind === "first_last_frame" || referenceKind === "reference_set_with_first" || referenceKind === "reference_set_with_frames") {
            throw new Error(`Civitai Seedance / ${service.id} 的 live images[] schema 没有声明首帧或尾帧角色，不能把时序帧降级成普通参考图`);
        }
        if (referenceKind === "none" && images.length) throw new Error(`Civitai Seedance / ${service.id} 收到图片但 referenceKind=none，已停止提交以避免误传`);
        if (referenceKind === "reference_set" && !images.length) throw new Error(`Civitai Seedance / ${service.id} 的 reference_set 至少需要 1 张参考图片`);
        return {
            ...(images.length ? { images } : {}),
            ...(videos.length ? { referenceVideos: videos } : {}),
            ...(audios.length ? { referenceAudios: audios } : {}),
        };
    }
    if (engine === "happyhorse") {
        if (version !== "v1.1") throw new Error(`Civitai HappyHorse / ${service.id} 的版本 ${version || "未声明"} 尚未验证，不能套用 v1.1 媒体字段`);
        if (videos.length || audios.length) throw new Error(`Civitai HappyHorse / ${service.id} 不接受参考视频或参考音频`);
        if (operation === "imageToVideo") {
            if (referenceKind !== "first_frame") throw new Error(`Civitai HappyHorse imageToVideo / ${service.id} 仅接受单张首帧，不能把其他参考意图改解释为首帧`);
            if (images.length !== 1) throw new Error(`Civitai HappyHorse imageToVideo / ${service.id} 需要且仅接受 1 张首帧，当前为 ${images.length} 张`);
            return { image: images[0] };
        }
        if (operation === "referenceToVideo") {
            if (referenceKind !== "reference_set") throw new Error(`Civitai HappyHorse referenceToVideo / ${service.id} 只接受 reference_set，不接受首帧或尾帧意图`);
            if (images.length < 1) throw new Error(`Civitai HappyHorse referenceToVideo / ${service.id} 至少需要 1 张参考图片`);
            return { images };
        }
        if (operation === "textToVideo") {
            if (referenceKind !== "none" || images.length) throw new Error(`Civitai HappyHorse textToVideo / ${service.id} 不接受参考图片`);
            return {};
        }
        throw new Error(`Civitai HappyHorse / ${service.id} 的 operation ${operation || "未声明"} 尚未验证，已停止提交`);
    }
    if (engine === "wan" && version === "v2.6") {
        if (provider !== "fal" || operation !== "reference-to-video") {
            throw new Error(`Civitai Wan 2.6 / ${service.id} 只接入 fal reference-to-video 精确合同`);
        }
        if (referenceKind !== "none" || images.length) {
            throw new Error(`Civitai Wan 2.6 R2V / ${service.id} 不接受图片；service 目录的 image modality 不作为请求 schema`);
        }
        if (audios.length) throw new Error(`Civitai Wan 2.6 R2V / ${service.id} 不接受参考音频`);
        if (videos.length < 1 || videos.length > 3) {
            throw new Error(`Civitai Wan 2.6 R2V / ${service.id} 需要 1..3 个参考视频，当前为 ${videos.length} 个；不会自动截断`);
        }
        return { referenceVideoUrls: videos };
    }
    if (engine === "wan" && version === "v2.7") {
        if (provider !== "fal") throw new Error(`Civitai Wan 2.7 / ${service.id} 的 provider ${provider || "未声明"} 尚未验证，不能套用 fal 字段`);
        if (audios.length) throw new Error(`Civitai Wan 2.7 / ${service.id} 当前工作流没有接入 audioUrl 的续接语义，不接受普通参考音频`);
        if (operation === "image-to-video") {
            if (videos.length) throw new Error(`Civitai Wan 2.7 I2V / ${service.id} 的 videoUrl 是视频续接字段，不能接收普通参考视频`);
            if (referenceKind !== "first_frame" && referenceKind !== "first_last_frame") {
                throw new Error(`Civitai Wan 2.7 I2V / ${service.id} 仅接受显式首帧或首尾帧，不接受普通 reference_set`);
            }
            const expected = referenceKind === "first_last_frame" ? 2 : 1;
            if (images.length !== expected) throw new Error(`Civitai Wan 2.7 I2V / ${service.id} 的${expected === 2 ? "首尾帧" : "首帧"}模式需要 ${expected} 张图片，当前为 ${images.length} 张`);
            return { startImage: images[0], ...(images[1] ? { endImage: images[1] } : {}) };
        }
        if (operation === "reference-to-video") {
            if (referenceKind === "first_frame" || referenceKind === "first_last_frame" || referenceKind === "reference_set_with_first" || referenceKind === "reference_set_with_frames") {
                throw new Error(`Civitai Wan 2.7 R2V / ${service.id} 没有首帧或尾帧字段；请改用 reference_set，不能把首帧混进普通参考图`);
            }
            if (referenceKind === "none" && images.length) throw new Error(`Civitai Wan 2.7 R2V / ${service.id} 收到图片但 referenceKind=none，已停止提交以避免误传`);
            if (!images.length && !videos.length) throw new Error(`Civitai Wan 2.7 R2V / ${service.id} 至少需要 1 张参考图或 1 个参考视频`);
            return {
                ...(images.length ? { referenceImages: images } : {}),
                ...(videos.length ? { referenceVideoUrls: videos } : {}),
            };
        }
        if (operation === "text-to-video") {
            if (referenceKind !== "none" || images.length || videos.length) throw new Error(`Civitai Wan 2.7 T2V / ${service.id} 不接受参考素材`);
            return {};
        }
        throw new Error(`Civitai Wan 2.7 / ${service.id} 的 operation ${operation || "未声明"} 尚未接入，已停止提交`);
    }
    if (engine === "sora") {
        if (videos.length || audios.length) throw new Error(`Civitai Sora / ${service.id} 的 live schema 不接受参考视频或参考音频`);
        if (operation === "image-to-video") {
            if (referenceKind === "first_last_frame" || referenceKind === "reference_set_with_first" || referenceKind === "reference_set_with_frames") {
                throw new Error(`Civitai Sora / ${service.id} 的 images[] 没有声明尾帧或首帧+参考图角色，不能把这些意图合并`);
            }
            if (referenceKind !== "first_frame" && referenceKind !== "reference_set") {
                throw new Error(`Civitai Sora / ${service.id} image-to-video 需要 images[] 输入`);
            }
            if (!images.length) throw new Error(`Civitai Sora / ${service.id} image-to-video 至少需要 1 张图片`);
            return { images };
        }
        if (operation === "text-to-video") {
            if (referenceKind !== "none" || images.length) throw new Error(`Civitai Sora / ${service.id} text-to-video 不接受参考图片`);
            return {};
        }
        throw new Error(`Civitai Sora / ${service.id} 的 operation ${operation || "未声明"} 尚未验证，已停止提交`);
    }
    if (engine === "minimax-h3") {
        if (referenceKind === "reference_set_with_frames") {
            if (!referenceParts.referenceImages.length) throw new Error(`Civitai / ${service.id} 的 reference_set_with_frames 至少需要 1 张普通参考图`);
            if (referenceParts.lastFrameImage && !referenceParts.firstFrameImage) throw new Error(`Civitai / ${service.id} 的尾帧必须与首帧同时提交`);
            return {
                ...(referenceParts.firstFrameImage ? { firstFrameImage: referenceParts.firstFrameImage } : {}),
                ...(referenceParts.lastFrameImage ? { lastFrameImage: referenceParts.lastFrameImage } : {}),
                referenceImages: referenceParts.referenceImages,
                ...(videos.length ? { referenceVideos: videos } : {}),
                ...(audios.length ? { referenceAudios: audios } : {}),
            };
        }
        if (referenceKind === "first_frame" && !videos.length && !audios.length) return { firstFrameImage: requiredImage(service, images, 0) };
        if (referenceKind === "first_last_frame" && !videos.length && !audios.length) {
            return { firstFrameImage: requiredImage(service, images, 0), lastFrameImage: requiredImage(service, images, 1) };
        }
        if (audios.length && !images.length && !videos.length) throw new Error(`Civitai / ${service.id} 参考音频不能单独使用`);
        if (referenceKind === "reference_set_with_first") {
            if (images.length < 2) throw new Error(`Civitai / ${service.id} 的 reference_set_with_first 需要首帧和至少 1 张普通参考图`);
            return {
                firstFrameImage: images[0],
                referenceImages: images.slice(1),
                ...(videos.length ? { referenceVideos: videos } : {}),
                ...(audios.length ? { referenceAudios: audios } : {}),
            };
        }
        return {
            ...(images.length ? { referenceImages: images } : {}),
            ...(videos.length ? { referenceVideos: videos } : {}),
            ...(audios.length ? { referenceAudios: audios } : {}),
        };
    }
    if (audios.length) throw new Error(`Civitai / ${service.id} 不接受参考音频`);
    if (videos.length && engine !== "kling-v3") throw new Error(`Civitai / ${service.id} 不接受参考视频`);
    if (engine === "kling-v3") {
        if (videos.length > 1) throw new Error(`Civitai / ${service.id} 最多接受 1 个参考视频`);
        if (videos.length) return { operation: "video-to-video-reference", videoUrl: videos[0], ...(images.length ? { images } : {}) };
        if (referenceKind === "reference_set_with_frames") {
            if (!referenceParts.referenceImages.length) throw new Error(`Civitai / ${service.id} 的 reference_set_with_frames 至少需要 1 张普通参考图`);
            if (referenceParts.lastFrameImage && !referenceParts.firstFrameImage) throw new Error(`Civitai / ${service.id} 的尾帧必须与首帧同时提交`);
            if (referenceParts.firstFrameImage || referenceParts.lastFrameImage) {
                throw new Error(`Civitai Kling V3 / ${service.id} 的 live schema 未声明 image-to-video 帧字段与 reference images 的组合 operation，已停止提交以避免丢失素材`);
            }
            return {
                operation: "reference-to-video",
                images: referenceParts.referenceImages,
            };
        }
        if (referenceKind === "first_frame") return { operation: "image-to-video", sourceImage: requiredImage(service, images, 0) };
        if (referenceKind === "first_last_frame") return { operation: "image-to-video", sourceImage: requiredImage(service, images, 0), endImage: requiredImage(service, images, 1) };
        if (images.length) return { operation: "reference-to-video", images };
        return { operation: "text-to-video" };
    }
    if (engine === "kling") {
        if (images.length > 1) throw new Error(`Civitai / ${service.id} 最多接受 1 张首帧图片`);
        return images.length ? { sourceImage: images[0] } : {};
    }
    if (engine === "grok") return { images: [requiredSingleImage(service, images)] };
    if (engine === "ltx2.3" && operation === "firstLastFrameToVideo") {
        if (images.length > 2) throw new Error(`Civitai / ${service.id} 最多接受首尾 2 张图片`);
        return { firstFrame: requiredImage(service, images, 0), ...(images[1] ? { lastFrame: images[1] } : {}) };
    }
    if (engine === "ltx2.3" && images.length) return { images };
    if (engine === "vidu") {
        if (referenceKind === "first_frame") return { sourceImage: requiredImage(service, images, 0) };
        if (referenceKind === "first_last_frame") {
            return { sourceImage: requiredImage(service, images, 0), endSourceImage: requiredImage(service, images, 1) };
        }
        return images.length ? { images } : {};
    }
    if (engine === "vidu-q3") {
        return images.length ? { images } : {};
    }
    if (engine === "wan") {
        return images.length ? { images } : {};
    }
    if (images.length || videos.length) throw new Error(`Civitai / ${service.id} 是纯文生视频服务，不接受参考素材`);
    return {};
}

function modelServiceIdUnavailable(service: CivitaiGenerationService): never {
    throw new Error(`Civitai / ${service.id} 的旧模型别名没有精确 service id，已停止提交视频素材`);
}

function buildCivitaiVideoSettings(
    capability: ResolvedVideoModelCapability,
    generationParameters: VideoGenerationParameters,
) {
    const settings: Record<string, unknown> = {};
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        const value = generationParameters[name];
        if (!isProvidedCivitaiVideoValue(value)) continue;
        const field = capability.generationParameters[name];
        if (field.status !== "supported") {
            throw new Error(`Civitai / ${capability.model}：参数 ${name} 未通过当前 service 合同，已停止提交`);
        }
        if (name === "duration" && field.derivedFrom?.length) continue;
        if (name === "dimensions") {
            const dimensions = readCivitaiVideoDimensions(value);
            settings.width = dimensions.width;
            settings.height = dimensions.height;
            continue;
        }
        const transportName = field.transportName;
        if (!transportName || transportName.includes("/") || transportName.includes("[") || transportName.includes(".")) {
            throw new Error(`Civitai / ${capability.model}：参数 ${name} 的提交字段 ${transportName || "未声明"} 尚未接通`);
        }
        settings[transportName] = value;
    }
    return settings;
}

function resolveCivitaiVideoGenerationParameters(
    capability: ResolvedVideoModelCapability,
    options: CivitaiVideoWorkflowOptions,
) {
    const generationParameters = options.generationParameters
        ? { ...options.generationParameters }
        : legacyCivitaiVideoGenerationParameters(capability, options);
    return validateVideoGenerationParameters(capability, generationParameters, {
        hasReferenceVideo: Boolean(options.videos?.length),
    });
}

function legacyCivitaiVideoGenerationParameters(
    capability: ResolvedVideoModelCapability,
    options: CivitaiVideoWorkflowOptions,
): VideoGenerationParameters {
    const parameters: VideoGenerationParameters = {};
    if (options.duration !== undefined && capability.generationParameters.duration.status === "supported") {
        parameters.duration = capability.generationParameters.duration.valueType === "string"
            ? String(options.duration)
            : Number(options.duration);
    }
    if (options.resolution && capability.generationParameters.resolution.status === "supported") {
        parameters.resolution = exactVideoEnumString(capability, "resolution", options.resolution);
    }
    if (options.aspectRatio && capability.generationParameters.aspectRatio.status === "supported") {
        parameters.aspectRatio = exactVideoEnumString(capability, "aspectRatio", options.aspectRatio);
    }
    if (options.aspectRatio && capability.generationParameters.dimensions.status === "supported") {
        parameters.dimensions = exactCivitaiDimensionsForRatio(capability, options.aspectRatio);
    }
    return parameters;
}

function civitaiVideoCapability(model: string, service?: CivitaiGenerationService) {
    const legacyEngine = service?.id === "legacy" ? service.parameters.engine.toLowerCase() : "";
    const exactModel = service?.id && service.id !== "legacy"
        ? service.id
        : legacyEngine === "vidu-q3"
          ? "video/vidu-q3"
          : legacyEngine === "kling-v3"
            ? "video/kling-v3"
            : model;
    return resolveVideoModelCapability({
        model: exactModel,
        provider: { name: "Civitai", adapterType: "civitai-orchestration" },
    });
}

function exactVideoEnumString(
    capability: ResolvedVideoModelCapability,
    name: VideoGenerationParameterName,
    value: string,
) {
    const raw = String(value || "").trim();
    const field = capability.generationParameters[name];
    if (!field.enumValues?.length) return raw;
    const caseInsensitive = field.enumValues.find((entry) => typeof entry === "string" && entry.toLowerCase() === raw.toLowerCase());
    if (typeof caseInsensitive === "string") return caseInsensitive;
    if (name === "resolution") {
        const normalized = raw.toLowerCase().replace(/p$/, "");
        const resolutionAlias = field.enumValues.find((entry) => (
            typeof entry === "string" && entry.toLowerCase().replace(/p$/, "") === normalized
        ));
        if (typeof resolutionAlias === "string") return resolutionAlias;
    }
    return raw;
}

function exactCivitaiDimensionsForRatio(capability: ResolvedVideoModelCapability, ratio: string) {
    const dimensionsByRatio: Record<string, VideoGenerationDimensions> = {
        "16:9": { width: 1280, height: 720 },
        "9:16": { width: 720, height: 1280 },
        "1:1": { width: 1024, height: 1024 },
        "4:3": { width: 1152, height: 864 },
        "3:4": { width: 864, height: 1152 },
    };
    const dimensions = dimensionsByRatio[ratio];
    if (!dimensions) {
        throw new Error(`Civitai / ${capability.model}：参数 aspectRatio=${ratio} 不能精确换算为 width/height；不会替换为其他比例`);
    }
    return dimensions;
}

function readCivitaiVideoDimensions(value: unknown) {
    if (isRecord(value) && typeof value.width === "number" && typeof value.height === "number") {
        return { width: value.width, height: value.height };
    }
    if (typeof value === "string") {
        const match = /^(\d+)\s*[x*×]\s*(\d+)$/.exec(value.trim());
        if (match) return { width: Number(match[1]), height: Number(match[2]) };
    }
    throw new Error("Civitai 视频参数 dimensions 无法序列化为 width/height");
}

function isProvidedCivitaiVideoValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function buildCivitaiImageSettings(
    service: CivitaiGenerationService,
    options: CivitaiImageWorkflowOptions,
) {
    const parameters = service.parameters;
    const engine = parameters.engine.toLowerCase();
    const quantity = options.quantity;
    const dims = finiteImageDimensions(options, service);
    const explicitSize = nonEmptyString(options.size);
    const explicitAspectRatio = nonEmptyString(options.aspectRatio);
    const explicitImageSize = nonEmptyString(options.imageSize);
    const model = String(parameters.model || "").toLowerCase();
    const operation = parameters.operation || "";

    if (engine === "gemini") return { quantity };

    if (engine === "flux1-kontext" || engine === "grok") {
        const aspectRatio = explicitAspectRatio || (dims ? closestAspectRatio(dims.width, dims.height) : "");
        return { quantity, ...(aspectRatio ? { aspectRatio } : {}) };
    }

    if (engine === "google") {
        const aspectRatio = explicitAspectRatio || (dims ? closestAspectRatio(dims.width, dims.height) : "");
        const sendResolution = model === "nano-banana-2" || model === "nano-banana-pro";
        const mappedResolution = dims
            ? (Math.max(dims.width, dims.height) > 2048 ? "4K" : Math.max(dims.width, dims.height) > 1024 ? "2K" : "1K")
            : "";
        const explicitResolution = /^(1k|2k|4k)$/i.test(explicitSize) ? explicitSize.toUpperCase() : "";
        const resolution = explicitResolution || mappedResolution;
        return {
            numImages: quantity,
            ...(aspectRatio ? { aspectRatio } : {}),
            ...(sendResolution && resolution ? { resolution } : {}),
        };
    }

    if (engine === "fal") {
        if (model === "krea2") {
            const size = explicitSize || (dims ? (Math.max(dims.width, dims.height) < 1536 ? "medium" : "large") : "");
            const aspectRatio = explicitAspectRatio || (dims ? closestAspectRatio(dims.width, dims.height, KREA2_IMAGE_ASPECT_RATIOS) : "");
            return {
                quantity,
                ...(size ? { size } : {}),
                ...(aspectRatio ? { aspectRatio } : {}),
            };
        }
        if (model === "maiimage" || model === "mai-image" || model === "reve") {
            const aspectRatio = explicitAspectRatio || (dims ? closestAspectRatio(dims.width, dims.height) : "");
            return { quantity, ...(aspectRatio ? { aspectRatio } : {}) };
        }
        const imageSize = explicitImageSize || (dims ? falImageSize(dims.width, dims.height) : "");
        return { quantity, ...(imageSize ? { imageSize } : {}) };
    }

    if (engine === "wan") {
        const imageSize = explicitImageSize || (dims ? falImageSize(dims.width, dims.height) : "");
        return { quantity, ...(imageSize ? { imageSize } : {}) };
    }

    if (engine === "openai") {
        if (model === "gpt-image-2") {
            return { quantity, ...(dims ? { width: dims.width, height: dims.height } : {}) };
        }
        if (model === "dall-e-2" || model === "dall-e-3") {
            const size = explicitSize || (dims ? openAIImageSize(dims.width, dims.height, model) : "");
            if (!size) throw new Error(`Civitai / ${model} 的 size 是 OpenAPI 必填字段，不能省略`);
            return { size, ...(model === "dall-e-3" ? {} : { quantity }) };
        }
        const size = explicitSize || (dims ? openAIImageSize(dims.width, dims.height, model) : "");
        return { quantity, ...(size ? { size } : {}) };
    }

    if (engine === "qwen") {
        assertIntegerRange("quantity", quantity, 1, 6, service);
        if (dims) {
            assertIntegerRange("width", dims.width, 512, 2048, service);
            assertIntegerRange("height", dims.height, 512, 2048, service);
        }
        return { quantity, ...(dims ? { width: dims.width, height: dims.height } : {}) };
    }

    if (engine === "sdcpp" && String(parameters.ecosystem || "").toLowerCase() === "qwen" && model === "20b") {
        assertIntegerRange("quantity", quantity, 1, 12, service);
        if (dims) {
            assertIntegerRange("width", dims.width, 64, 2048, service);
            assertIntegerRange("height", dims.height, 64, 2048, service);
            if (dims.width % 8 !== 0 || dims.height % 8 !== 0) {
                throw new Error(`Civitai / ${service.id} 的 width 和 height 必须是 8 的倍数`);
            }
        }
        return { quantity, ...(dims ? { width: dims.width, height: dims.height } : {}) };
    }

    return {
        quantity,
        ...(dims ? { width: dims.width, height: dims.height } : {}),
        ...(engine === "sdcpp" && String(parameters.ecosystem || "").toLowerCase() === "zimage" && options.outputFormat
            ? { outputFormat: options.outputFormat }
            : {}),
    };
}

function finiteImageDimensions(
    options: Pick<CivitaiImageWorkflowOptions, "width" | "height">,
    service: CivitaiGenerationService,
) {
    const { width, height } = options;
    if (width === undefined && height === undefined) return undefined;
    if (typeof width !== "number" || !Number.isFinite(width) || typeof height !== "number" || !Number.isFinite(height)) {
        throw new Error(`Civitai / ${service.id} 的 width 和 height 必须同时提供有限数字`);
    }
    return { width, height };
}

const DEFAULT_IMAGE_ASPECT_RATIOS = [
    ["21:9", 21 / 9],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
    ["9:21", 9 / 21],
] as const;

const KREA2_IMAGE_ASPECT_RATIOS = [
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
    ["2.35:1", 2.35],
    ["4:5", 4 / 5],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
] as const;

function closestAspectRatio(
    width: number,
    height: number,
    candidates: readonly (readonly [string, number])[] = DEFAULT_IMAGE_ASPECT_RATIOS,
) {
    const ratio = Math.max(1, width) / Math.max(1, height);
    return candidates.reduce((best, candidate) => (
        Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio) ? candidate : best
    ))[0];
}

function falImageSize(width: number, height: number) {
    if (width === height) return width >= 1024 ? "square_hd" : "square";
    const landscape = width > height;
    const wide = Math.max(width, height) / Math.max(1, Math.min(width, height)) >= 1.5;
    return `${landscape ? "landscape" : "portrait"}_${wide ? "16_9" : "4_3"}`;
}

function openAIImageSize(width: number, height: number, model: string) {
    if (model === "dall-e-2") {
        const side = Math.max(width, height) >= 1024 ? 1024 : Math.max(width, height) >= 512 ? 512 : 256;
        return `${side}x${side}`;
    }
    if (width > height) return model === "dall-e-3" ? "1792x1024" : "1536x1024";
    if (height > width) return model === "dall-e-3" ? "1024x1792" : "1024x1536";
    return "1024x1024";
}

function requireCivitaiService(model: string, provided: CivitaiGenerationService | undefined, step: "imageGen" | "videoGen") {
    const service = provided || resolveCivitaiService(model) || legacyCivitaiService(model);
    if (!service) throw new Error(`Civitai 服务目录中找不到 ${model}，请先在 API 设置中刷新服务目录`);
    if (service.step !== step) throw new Error(`Civitai / ${model} 不是${step === "imageGen" ? "图片" : "视频"}生成服务`);
    return service;
}

function requiredSingleImage(service: CivitaiGenerationService, images: string[]) {
    if (images.length !== 1) throw new Error(`Civitai / ${service.id} 需要且仅接受 1 张参考图片`);
    return images[0];
}

function requiredImage(service: CivitaiGenerationService, images: string[], index: number) {
    const image = images[index];
    if (!image) throw new Error(`Civitai / ${service.id} 缺少${index === 0 ? "首帧" : "尾帧"}图片`);
    return image;
}

function civitaiEngine(model: string, service?: CivitaiGenerationService) {
    return (service?.parameters.engine || legacyCivitaiService(model)?.parameters.engine || model).trim().toLowerCase();
}

function videoDimensions(ratio?: string) {
    if (ratio === "9:16") return { width: 720, height: 1280 };
    if (ratio === "1:1") return { width: 1024, height: 1024 };
    if (ratio === "4:3") return { width: 1152, height: 864 };
    if (ratio === "3:4") return { width: 864, height: 1152 };
    return { width: 1280, height: 720 };
}

function legacyCivitaiService(model: string): CivitaiGenerationService | undefined {
    const normalized = model.trim().toLowerCase();
    if (normalized === "seedream-v4") return legacyService("imageGen", { engine: "seedream", version: "v4" }, ["text", "image"]);
    if (normalized === "seedream-v4.5") return legacyService("imageGen", { engine: "seedream", version: "v4.5" }, ["text", "image"]);
    if (normalized === "seedream-v5.0-lite") return legacyService("imageGen", { engine: "seedream", version: "v5.0-lite" }, ["text", "image"]);
    if (normalized === "kling-v3") return legacyService("videoGen", { engine: "kling-v3" }, ["text", "image", "video"]);
    return undefined;
}

function legacyService(step: "imageGen" | "videoGen", parameters: Readonly<Record<string, string>>, input: readonly string[]): CivitaiGenerationService {
    return {
        id: "legacy",
        step,
        parameters,
        modalities: { input, output: [step === "imageGen" ? "image" : "video"] },
        status: "available",
    };
}

export function readCivitaiWorkflowState(payload: unknown): CivitaiWorkflowState {
    if (!isRecord(payload)) return { status: "failed", workflowId: "", error: "Civitai 没有返回有效工作流" };
    const workflowId = readString(payload.workflowId) || readString(payload.id);
    const status = readString(payload.status).toLowerCase();
    if (!workflowId) return { status: "failed", workflowId: "", error: "Civitai 没有返回 workflowId" };
    if (status === "succeeded" || status === "completed" || status === "success") {
        const blobs = collectWorkflowBlobs(payload.steps);
        return blobs.length
            ? { status: "completed", workflowId, blobs }
            : { status: "failed", workflowId, error: readWorkflowFailure(payload) || "Civitai 工作流成功但没有返回图片或视频" };
    }
    if (status === "failed" || status === "expired" || status === "canceled" || status === "cancelled") {
        return { status: "failed", workflowId, error: readWorkflowFailure(payload) || `Civitai 工作流${status || "失败"}` };
    }
    return { status: "pending", workflowId };
}

function collectWorkflowBlobs(value: unknown): readonly CivitaiBlob[] {
    if (!Array.isArray(value)) return [];
    const blobs: CivitaiBlob[] = [];
    for (const step of value) {
        if (!isRecord(step) || !isRecord(step.output)) continue;
        appendBlob(blobs, step.output.video);
        appendBlobArray(blobs, step.output.additionalVideos);
        appendBlobArray(blobs, step.output.images);
        appendBlobArray(blobs, step.output.blobs);
    }
    return blobs;
}

function appendBlob(target: CivitaiBlob[], value: unknown) {
    if (!isRecord(value)) return;
    if (value.available === false) return;
    const id = readString(value.id);
    const url = readString(value.url);
    if (url) target.push({ id, url });
}

function appendBlobArray(target: CivitaiBlob[], value: unknown) {
    if (!Array.isArray(value)) return;
    value.forEach((item) => appendBlob(target, item));
}

function readWorkflowFailure(value: Record<string, unknown>): string {
    const direct = readError(value);
    if (direct) return direct;
    if (!Array.isArray(value.steps)) return "";
    for (const step of value.steps) {
        if (!isRecord(step)) continue;
        const stepError = readError(step);
        if (stepError) return stepError;
        if (Array.isArray(step.jobs)) {
            for (const job of step.jobs) {
                if (!isRecord(job)) continue;
                const jobError = readError(job);
                if (jobError) return jobError;
            }
        }
        if (isRecord(step.output) && Array.isArray(step.output.errors)) {
            const outputError = step.output.errors.map(readString).find(Boolean);
            if (outputError) return outputError;
        }
        if (isRecord(step.output)) {
            const blockedReason = collectBlockedReason(step.output);
            if (blockedReason) return blockedReason;
        }
    }
    return "";
}

function readError(value: Record<string, unknown>): string {
    const direct = readString(value.message);
    if (direct) return direct;
    const reason = readString(value.reason) || readString(value.blockedReason);
    if (reason) return reason;
    if (isRecord(value.error)) return readString(value.error.message) || readString(value.error.error);
    return readString(value.error);
}

function collectBlockedReason(output: Record<string, unknown>) {
    const values = [output.video, ...(Array.isArray(output.additionalVideos) ? output.additionalVideos : []), ...(Array.isArray(output.images) ? output.images : []), ...(Array.isArray(output.blobs) ? output.blobs : [])];
    for (const value of values) {
        if (isRecord(value)) {
            const reason = readString(value.blockedReason);
            if (reason) return reason;
        }
    }
    return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
