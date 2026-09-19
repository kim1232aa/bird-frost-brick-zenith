/** Page-only image-studio parameter-chain helpers. Do not send unverified fields. */

import {
  resolveImageModelCapability,
  type ImageCapabilityProvider,
  type ImageOperation,
} from "../services/api/image-model-capabilities.ts";
import {
  civitaiImageLoraShape,
  civitaiRequiresCheckpointAir,
  isCivitaiAdapterType,
  snapStudioImageQuantity,
  studioImageQuantityMax,
  studioImageQuantityOptions,
  type CivitaiLoraShape,
} from "../studio/civitai-ui-options.ts";

export type ImageStudioFamily = "ark" | "civitai" | "gpt" | "grok" | "agnes" | "sensenova" | "generic";
export type ImageStudioMode = "t2i" | "i2i" | "edit";
export type ImageStudioParamState = {
  showLora: boolean;
  loraShape: CivitaiLoraShape | undefined;
  needsCheckpoint: boolean;
  quantityMax: number | null;
  quantityOptions: number[];
  showSeed: boolean;
  showNegative: boolean;
  showAspect: boolean;
  showQuality: boolean;
  qualityOptions: Array<"eco" | "std" | "hq">;
  referencesSupported: boolean;
  referenceMin: number;
  referenceMax: number | null;
  referenceNote?: string;
  showSteps: boolean;
  defaultSteps?: number;
  showCfgScale: boolean;
  defaultCfgScale?: number;
  showOutputFormat: boolean;
  defaultOutputFormat?: "jpeg" | "png" | "webp";
  outputFormatOptions?: Array<"jpeg" | "png" | "webp">;
  showSampler: boolean;
  samplerOptions?: string[];
  defaultSampler?: string;
  showScheduler: boolean;
  schedulerOptions?: string[];
  defaultScheduler?: string;
  showDenoise: boolean;
  defaultDenoise?: number;
};

function studioOperation(mode: ImageStudioMode): ImageOperation {
  return mode === "t2i" ? "generate" : "edit";
}

function familyAdapterType(family: ImageStudioFamily, adapterType?: string) {
  const explicit = String(adapterType || "").trim();
  if (explicit) return explicit;
  if (family === "ark") return "ark";
  if (family === "gpt") return "openai-compat";
  if (family === "grok") return "xai-imagine";
  if (family === "agnes") return "agnes";
  if (family === "sensenova") return "sensenova";
  if (family === "civitai") return "civitai";
  return undefined;
}

function studioCapabilityProvider(
  family: ImageStudioFamily,
  adapterType?: string,
  provider?: ImageCapabilityProvider,
): ImageCapabilityProvider | undefined {
  const adapter = familyAdapterType(family, provider?.adapterType || adapterType);
  if (provider) {
    return adapter && adapter !== provider.adapterType ? { ...provider, adapterType: adapter } : provider;
  }
  return adapter ? { adapterType: adapter } : undefined;
}

function studioImageCapability(input: {
  family: ImageStudioFamily;
  model: string;
  mode: ImageStudioMode;
  adapterType?: string;
  provider?: ImageCapabilityProvider;
}) {
  return resolveImageModelCapability({
    model: input.model,
    operation: studioOperation(input.mode),
    provider: studioCapabilityProvider(input.family, input.adapterType, input.provider),
  });
}

function capabilityQuantityMax(family: ImageStudioFamily, model: string, mode: ImageStudioMode, adapterType?: string, provider?: ImageCapabilityProvider) {
  if (family === "civitai") {
    const createQuantityMax = studioImageQuantityMax("civitai", model);
    return mode !== "t2i" ? CIVITAI_EDIT_QUANTITY_MAX[model] || createQuantityMax : createQuantityMax;
  }
  const output = studioImageCapability({ family, model, mode, adapterType, provider }).outputCount;
  if (output.state === "supported") return output.max;
  if (output.state === "unsupported") return 1;
  return studioImageQuantityMax(adapterType, model, mode === "t2i" ? "generate" : "edit");
}

function capabilityReferenceState(family: ImageStudioFamily, model: string, mode: ImageStudioMode, adapterType?: string, provider?: ImageCapabilityProvider) {
  if (mode === "t2i") {
    return { referencesSupported: false, referenceMin: 0, referenceMax: 0 as number | null };
  }
  if (family === "civitai") {
    if (CIVITAI_NO_REF_MODELS.has(model)) {
      return { referencesSupported: false, referenceMin: 0, referenceMax: 0 as number | null };
    }
    const max = CIVITAI_REF_MAX[model];
    return {
      referencesSupported: true,
      referenceMin: 1,
      referenceMax: typeof max === "number" ? max : null,
    };
  }
  const refs = studioImageCapability({ family, model, mode, adapterType, provider }).referenceCount;
  if (refs.state === "supported") {
    return { referencesSupported: true, referenceMin: refs.min, referenceMax: refs.max, referenceNote: refs.note };
  }
  if (refs.state === "unsupported") {
    return { referencesSupported: false, referenceMin: 0, referenceMax: 0 as number | null, referenceNote: refs.reason };
  }
  return { referencesSupported: true, referenceMin: 1, referenceMax: null, referenceNote: refs.reason };
}

const CIVITAI_ENGINE_IDS = new Set([
  "krea2-turbo",
  "krea2-raw",
  "flux1",
  "flux2-klein",
  "flux2-pro",
  "z-image-turbo",
  "civitai-grok",
  "flux2-dev",
  "sdxl",
  "anima",
  "qwen-3.0-pro",
  "seedream-4.5",
  "seedream-5.0-pro",
]);

/** Civitai engines whose official createImage path rejects reference images. */
const CIVITAI_NO_REF_MODELS = new Set(["z-image-turbo", "anima"]);

/**
 * Engines whose current adapter body actually forwards negativePrompt.
 * Official recipes / live OpenAPI: SDXL, Anima, Z-Image, Flux 2 Klein, Comfy Krea, Qwen 3.0 Pro.
 * Flux1 Comfy and Flux2 Dev/Pro/Grok/Seedream do not.
 * Sources: https://developer.civitai.com/orchestration/recipes/flux2
 *          https://developer.civitai.com/orchestration/recipes/qwen
 *          https://orchestration.civitai.com/openapi/v2-consumers.json
 */
const CIVITAI_NEGATIVE_MODELS = new Set(["krea2-turbo", "krea2-raw", "z-image-turbo", "sdxl", "anima", "flux2-klein", "qwen-3.0-pro"]);

/**
 * Live OpenAPI width/height ranges (v2-consumers.json, 2026-08-27).
 * All Civitai image engines are then snapped to multiples of 16:
 * Flux2 Klein requires ÷16; troubleshooting also mentions ÷8 elsewhere.
 * ÷16 is a valid subset of ÷8 and matches the task contract.
 * Flux2*: 512–2048 (Flux2ImageGenInput). Comfy Krea/Flux1/Z-Image/Anima/SDXL: 64–2048.
 * Seedream: 256–4096. Qwen 3.0-pro recipe 512–2048 (schema min is 0; recipe wins for a required send).
 */
const CIVITAI_DIM_RANGE: Record<string, { min: number; max: number }> = {
  "flux2-klein": { min: 512, max: 2048 },
  "flux2-pro": { min: 512, max: 2048 },
  "flux2-dev": { min: 512, max: 2048 },
  "krea2-turbo": { min: 64, max: 2048 },
  "krea2-raw": { min: 64, max: 2048 },
  flux1: { min: 64, max: 2048 },
  "z-image-turbo": { min: 64, max: 2048 },
  sdxl: { min: 64, max: 2048 },
  anima: { min: 64, max: 2048 },
  "qwen-3.0-pro": { min: 512, max: 2048 },
  "seedream-4.5": { min: 256, max: 4096 },
  "seedream-5.0-pro": { min: 256, max: 4096 },
};

const CIVITAI_DIM_MULTIPLE = 16;
const CIVITAI_DIM_FALLBACK = { min: 64, max: 2048 };

/**
 * OpenAI's GPT Image 2 accepts arbitrary 16-aligned dimensions inside the
 * published pixel/edge/aspect limits. GPT Image 1.5/1 use the legacy size
 * enum instead.
 * https://developers.openai.com/api/docs/guides/image-generation
 */
const GPT_IMAGE_2_LONG_SIDE: Record<"eco" | "std" | "hq", number> = {
  eco: 1152,
  std: 1280,
  hq: 1536,
};
const GPT_IMAGE_LEGACY_LANDSCAPE_SIZE = "1536x1024";
const GPT_IMAGE_LEGACY_PORTRAIT_SIZE = "1024x1536";
const GPT_IMAGE_DEFAULT_SIZE = "1024x1024";
const AGNES_IMAGE_SIZES = new Set(["1K", "2K", "3K", "4K"]);
const SENSENOVA_IMAGE_SIZE_BY_ASPECT: Record<string, string> = {
  "1:1": "2048x2048",
  "16:9": "2752x1536",
  "9:16": "1536x2752",
  "3:4": "1760x2368",
  "4:3": "2368x1760",
};

function isGptImage2Model(model: string) {
  const key = String(model || "").trim().toLowerCase();
  return key === "gpt-image-2"
    || /^gpt-image-2-\d{4}-\d{2}-\d{2}$/.test(key)
    || key === "chatgpt-image-latest"
    || key === "gpt-image-2-c"
    || key === "gpt-image-2-high"
    || key === "gpt-image-2-vip";
}

function gptImageQuality(quality: "eco" | "std" | "hq") {
  return quality === "eco" ? "low" : quality === "hq" ? "high" : "medium";
}

function gptImageAspect(aspect: string) {
  const [rawWidth, rawHeight] = String(aspect || "").split(":").map(Number);
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return { width: 1, height: 1 };
  }
  return { width: rawWidth, height: rawHeight };
}

function gptImage2Size(quality: "eco" | "std" | "hq", aspect: string) {
  const ratio = gptImageAspect(aspect);
  const landscape = ratio.width >= ratio.height;
  const longRatio = Math.max(ratio.width, ratio.height) / Math.max(1, Math.min(ratio.width, ratio.height));
  const longSide = GPT_IMAGE_2_LONG_SIDE[quality];
  const shortSide = Math.round((longSide / longRatio) / 16) * 16;
  const width = landscape ? longSide : shortSide;
  const height = landscape ? shortSide : longSide;
  return `${width}x${height}`;
}

function gptLegacySize(_quality: "eco" | "std" | "hq", aspect: string) {
  const ratio = gptImageAspect(aspect);
  if (ratio.width > ratio.height) return GPT_IMAGE_LEGACY_LANDSCAPE_SIZE;
  if (ratio.width < ratio.height) return GPT_IMAGE_LEGACY_PORTRAIT_SIZE;
  return GPT_IMAGE_DEFAULT_SIZE;
}

function gptImageSize(model: string, quality: "eco" | "std" | "hq", aspect: string) {
  return isGptImage2Model(model) ? gptImage2Size(quality, aspect) : gptLegacySize(quality, aspect);
}

export function snapCivitaiImageDim(value: number, min: number, max: number) {
  const lo = Number.isFinite(min) ? min : CIVITAI_DIM_FALLBACK.min;
  const hi = Number.isFinite(max) ? max : CIVITAI_DIM_FALLBACK.max;
  const raw = Number.isFinite(value) ? value : lo;
  let snapped = Math.round(raw / CIVITAI_DIM_MULTIPLE) * CIVITAI_DIM_MULTIPLE;
  if (snapped < lo) snapped = Math.ceil(lo / CIVITAI_DIM_MULTIPLE) * CIVITAI_DIM_MULTIPLE;
  if (snapped > hi) snapped = Math.floor(hi / CIVITAI_DIM_MULTIPLE) * CIVITAI_DIM_MULTIPLE;
  return Math.min(hi, Math.max(lo, snapped));
}

export function normalizeCivitaiImageDims(model: string, dims: { width: number; height: number }) {
  const range = CIVITAI_DIM_RANGE[String(model || "").trim()] || CIVITAI_DIM_FALLBACK;
  return {
    width: snapCivitaiImageDim(dims.width, range.min, range.max),
    height: snapCivitaiImageDim(dims.height, range.min, range.max),
  };
}

/** Adapter-enforced reference caps that the page can surface before generate. */
const CIVITAI_REF_MAX: Record<string, number> = {
  "krea2-turbo": 2,
  "krea2-raw": 2,
  flux1: 1,
  sdxl: 1,
  "flux2-klein": 2,
  "civitai-grok": 3,
  "qwen-3.0-pro": 3,
  "seedream-4.5": 10,
  "seedream-5.0-pro": 10,
};

/** Krea 2 Comfy edit model max; turbo/raw createImage remains capped at 12. */
const CIVITAI_EDIT_QUANTITY_MAX: Record<string, number> = {
  "krea2-turbo": 4,
  "krea2-raw": 4,
};

function namedNonCivitaiFamily(selection: string, adapter: string): ImageStudioFamily | undefined {
  if (adapter === "ark" || adapter === "ark-plan") return "ark";
  if (adapter === "agnes") return "agnes";
  if (adapter === "sensenova") return "sensenova";
  if (adapter === "xai-imagine" || adapter === "xai") return "grok";
  if (adapter === "openai-compat" || adapter === "openai") {
    return /gpt-image|chatgpt-image-latest/i.test(selection) ? "gpt" : "generic";
  }
  if (adapter) return "generic";
  return undefined;
}

function selectionLooksLikeCivitai(selection: string) {
  if (/(^|::)preset-civitai(::|$)/.test(selection) || selection.startsWith("preset-civitai::")) return true;
  if (/(^|::)civitai(::|$)/i.test(selection)) return true;
  const model = selection.includes("::") ? selection.split("::").slice(1).join("::") : selection;
  return CIVITAI_ENGINE_IDS.has(model.trim());
}

export function resolveImageStudioFamily(selection: string, adapterType?: string): ImageStudioFamily {
  if (isCivitaiAdapterType(adapterType)) return "civitai";
  const adapter = String(adapterType || "").trim().toLowerCase();
  const named = namedNonCivitaiFamily(selection, adapter);
  if (named) return named;
  if (selectionLooksLikeCivitai(selection)) return "civitai";
  if (/volcengine|seedance|seedream/i.test(selection)) return "ark";
  if (/gpt-image|chatgpt-image-latest/i.test(selection)) return "gpt";
  if (/grok-imagine-image/i.test(selection)) return "grok";
  if (/agnes-image/i.test(selection)) return "agnes";
  if (/sensenova/i.test(selection)) return "sensenova";
  return "generic";
}

function qualityOptionsForCapability(
  family: ImageStudioFamily,
  capability: ReturnType<typeof studioImageCapability>,
): Array<"eco" | "std" | "hq"> {
  if (family === "gpt" && capability.quality.state === "supported") {
    return ["eco", "std", "hq"];
  }
  if (
    family === "grok"
    && capability.quality.state === "supported"
    && capability.quality.values.includes("low")
    && capability.quality.values.includes("medium")
  ) {
    return ["eco", "std"];
  }
  return [];
}

export function imageStudioParamState(
  family: ImageStudioFamily,
  model: string,
  mode: ImageStudioMode = "t2i",
  adapterType?: string,
  provider?: ImageCapabilityProvider,
): ImageStudioParamState {
  const civitai = family === "civitai";
  const capability = studioImageCapability({ family, model, mode, adapterType, provider });
  const loraShape: CivitaiLoraShape | undefined = civitai ? civitaiImageLoraShape(model) : undefined;
  const quantityMax = capabilityQuantityMax(family, model, mode, adapterType, provider);
  const references = capabilityReferenceState(family, model, mode, adapterType, provider);
  const qualityOptions = qualityOptionsForCapability(family, capability);
  return {
    showLora: Boolean(loraShape),
    loraShape,
    needsCheckpoint: civitai && civitaiRequiresCheckpointAir(model),
    quantityMax,
    quantityOptions: studioImageQuantityOptions(quantityMax),
    // Seedream's official imageGen input accepts an int32 seed; only the Grok
    // engine lacks a seed field in the adapter body. 其他家族按能力合同开：
    // fal flux/seedream 等 profile 已把 seed 标记为 supported。
    showSeed: (civitai && model !== "civitai-grok") || capability.advancedFields.seed.state === "supported",
    showNegative: civitai
      ? CIVITAI_NEGATIVE_MODELS.has(model)
      : capability.advancedFields.negativePrompt.state === "supported",
    showAspect: capability.size.state === "supported",
    showQuality: qualityOptions.length > 0,
    qualityOptions,
    showSteps: civitai || capability.advancedFields.steps.state === "supported",
    defaultSteps: model.includes("krea") ? 9 : model.includes("turbo") ? 8 : 25,
    showCfgScale: civitai || capability.advancedFields.cfgScale.state === "supported",
    defaultCfgScale: model.includes("krea") ? 1.0 : 7.0,
    showOutputFormat: civitai || capability.outputFormat.state === "supported",
    defaultOutputFormat: "jpeg",
    outputFormatOptions: ["jpeg", "png", "webp"],
    showSampler: civitai && !model.includes("krea"),
    samplerOptions: ["Euler", "Euler a", "DPM++ 2M Karras", "DPM++ SDE Karras", "DDIM"],
    showScheduler: civitai && !model.includes("krea"),
    schedulerOptions: ["Karras", "sgm_uniform", "Normal", "Exponential"],
    showDenoise: mode !== "t2i",
    defaultDenoise: 0.75,
    ...references,
  };
}

export function snapImageStudioCount(count: number, quantityOptions: readonly number[]) {
  return snapStudioImageQuantity(count, quantityOptions);
}

export function buildImageStudioLoras(
  showLora: boolean,
  loras: ReadonlyArray<{ resource: string; weight: number }>,
): Record<string, number> | undefined {
  if (!showLora) return undefined;
  const map = Object.fromEntries(
    loras.filter((item) => item.resource.trim()).map((item) => [item.resource.trim(), item.weight]),
  );
  return Object.keys(map).length ? map : undefined;
}

export function imageStudioRefError(
  family: ImageStudioFamily,
  model: string,
  mode: ImageStudioMode,
  refCount: number,
  adapterType?: string,
  provider?: ImageCapabilityProvider,
) {
  if (mode === "t2i") return "";
  if (family === "civitai" && CIVITAI_NO_REF_MODELS.has(model)) {
    if (model === "z-image-turbo") return "Z-Image 仅支持文生图，不接受参考图。请切回文生图或换模型。";
    if (model === "anima") return "Anima 仅支持文生图（createImage），不接受参考图。请切回文生图或换模型。";
  }
  const refs = capabilityReferenceState(family, model, mode, adapterType, provider);
  if (!refs.referencesSupported) {
    return refs.referenceNote || `${model} 不接受参考图。请切回文生图或换模型。`;
  }
  if (!refCount) {
    const min = Math.max(1, refs.referenceMin);
    return mode === "edit"
      ? min > 1
        ? `编辑至少上传 ${min} 张参考图`
        : "编辑至少上传 1 张参考图"
      : min > 1
        ? `图生图至少上传 ${min} 张参考图`
        : "图生图至少上传 1 张参考图";
  }
  if (typeof refs.referenceMax === "number" && refCount > refs.referenceMax) {
    return `${model} 最多 ${refs.referenceMax} 张参考图，当前 ${refCount} 张。请先去掉多余的参考再生成。`;
  }
  return "";
}

export function imageStudioCheckpointError(needsCheckpoint: boolean, model: string, checkpointAir: string) {
  if (needsCheckpoint && !checkpointAir.trim()) {
    return `${model} 需要 checkpoint AIR（urn:air:…），不会编造 AIR`;
  }
  return "";
}

export function buildImageStudioGenerateFields(input: {
  family: ImageStudioFamily;
  model: string;
  mode: ImageStudioMode;
  quality: "eco" | "std" | "hq";
  aspect: string;
  size: string;
  seed: string;
  count: number;
  references: readonly string[];
  loras: ReadonlyArray<{ resource: string; weight: number }>;
  checkpointAir: string;
  negativePrompt?: string;
  dims: { width: number; height: number };
  adapterType?: string;
  provider?: ImageCapabilityProvider;
  dynamicParams?: Record<string, unknown>;
  steps?: number;
  cfgScale?: number;
  outputFormat?: "jpeg" | "png" | "webp";
  sampler?: string;
  scheduler?: string;
  denoise?: number;
}) {
  const params = imageStudioParamState(input.family, input.model, input.mode, input.adapterType, input.provider);
  const count = snapImageStudioCount(input.count, params.quantityOptions);
  const refError = input.mode === "t2i" && input.references.length
    ? "文生图不能携带参考图；请切到图生图或编辑模式。"
    : imageStudioRefError(input.family, input.model, input.mode, input.references.length, input.adapterType, input.provider);
  const checkpointError = imageStudioCheckpointError(params.needsCheckpoint, input.model, input.checkpointAir);
  const error = refError || checkpointError;
  const refs = input.mode === "t2i" ? [] : [...input.references];
  const dims = input.family === "civitai" ? normalizeCivitaiImageDims(input.model, input.dims) : input.dims;
  return {
    error: error || undefined,
    params,
    count,
    steps: typeof input.steps === "number" ? input.steps : (params.showSteps ? params.defaultSteps : undefined),
    cfgScale: typeof input.cfgScale === "number" ? input.cfgScale : (params.showCfgScale ? params.defaultCfgScale : undefined),
    outputFormat: input.outputFormat || (input.family === "civitai" && params.showOutputFormat ? params.defaultOutputFormat : undefined),
    sampler: input.sampler || (params.showSampler ? params.defaultSampler : undefined),
    scheduler: input.scheduler || (params.showScheduler ? params.defaultScheduler : undefined),
    denoise: typeof input.denoise === "number" ? input.denoise : (params.showDenoise && input.mode !== "t2i" && input.family === "civitai" ? params.defaultDenoise : undefined),
    size:
      input.family === "ark"
        ? input.size
        : input.family === "gpt"
          ? gptImageSize(input.model, input.quality, input.aspect)
          : input.family === "agnes"
            ? AGNES_IMAGE_SIZES.has(input.size) ? input.size : "2K"
            : input.family === "sensenova"
              ? SENSENOVA_IMAGE_SIZE_BY_ASPECT[input.aspect] || "2048x2048"
              : input.family === "grok"
                ? params.showAspect ? input.size : undefined
                : input.size,
    aspectRatio:
      input.family === "grok" && !params.showAspect || input.family === "sensenova"
        ? undefined
        : input.aspect,
    width: input.family === "civitai" ? dims.width : undefined,
    height: input.family === "civitai" ? dims.height : undefined,
    seed: params.showSeed && input.seed ? Number(input.seed) : undefined,
    n: count,
    quality:
      input.family === "gpt"
        ? gptImageQuality(input.quality)
        : input.family === "grok" && /^grok-imagine-image-2\.0(?:-|$)/i.test(input.model) && input.mode === "t2i"
          ? input.quality === "eco" ? "low" : "medium"
          : undefined,
    imageUrl: refs[0],
    imageUrls: refs,
    loras: error ? undefined : buildImageStudioLoras(params.showLora, input.loras),
    checkpointAir: error || !params.needsCheckpoint ? undefined : input.checkpointAir.trim(),
    negativePrompt: params.showNegative ? input.negativePrompt || undefined : undefined,
    dynamicParams: input.dynamicParams || {},
    ...(input.steps !== undefined ? { steps: input.steps } : {}),
    ...(input.cfgScale !== undefined ? { cfgScale: input.cfgScale } : {}),
    ...(input.outputFormat ? { outputFormat: input.outputFormat } : {}),
    ...(input.sampler ? { sampler: input.sampler } : {}),
    ...(input.scheduler ? { scheduler: input.scheduler } : {}),
    ...(input.denoise !== undefined ? { denoise: input.denoise } : {}),
  };
}

type ImageStudioGeneratePayload = ReturnType<typeof buildImageStudioGenerateFields>;

export function buildImageStudioRequest<TRelay>(input: {
  mode: ImageStudioMode;
  relays: TRelay[];
  prompt: string;
  providerId: string;
  model: string;
  payload: ImageStudioGeneratePayload;
  workTitle: string;
}) {
  return {
    relays: input.relays,
    prompt: input.prompt,
    providerId: input.providerId,
    model: input.model,
    size: input.payload.size,
    aspectRatio: input.payload.aspectRatio,
    width: input.payload.width,
    height: input.payload.height,
    seed: input.payload.seed,
    quality: input.payload.quality,
    imageUrl: input.payload.imageUrl,
    imageUrls: input.payload.imageUrls,
    negativePrompt: input.payload.negativePrompt,
    n: input.payload.n,
    operation: input.mode === "t2i" ? "generate" as const : "edit" as const,
    loras: input.payload.loras,
    checkpointAir: input.payload.checkpointAir,
    ...(input.payload.steps !== undefined ? { steps: input.payload.steps } : {}),
    ...(input.payload.cfgScale !== undefined ? { cfgScale: input.payload.cfgScale } : {}),
    ...(input.payload.outputFormat !== undefined ? { outputFormat: input.payload.outputFormat } : {}),
    ...(input.payload.sampler !== undefined ? { sampler: input.payload.sampler } : {}),
    ...(input.payload.scheduler !== undefined ? { scheduler: input.payload.scheduler } : {}),
    ...(input.payload.denoise !== undefined ? { denoise: input.payload.denoise } : {}),
    workTitle: input.workTitle,
    ...(input.payload.dynamicParams && Object.keys(input.payload.dynamicParams).length > 0 ? { advanced: input.payload.dynamicParams } : {}),
  };
}
