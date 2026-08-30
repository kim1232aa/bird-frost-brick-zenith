/** Page-only Civitai param-chain helpers for ImageStudioPage. Do not send unverified fields. */

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
 * Official recipes / live OpenAPI: SDXL, Anima, Z-Image, Flux 2 Klein, Comfy Krea.
 * Flux1 Comfy and Flux2 Dev/Pro/Grok/Seedream do not.
 * QwenApiImageGenInput has negativePrompt, but the qwen-3.0-pro adapter body
 * still omits it — the page must not fake-show a field the adapter will drop.
 * Sources: https://developer.civitai.com/orchestration/recipes/flux2
 *          https://developer.civitai.com/orchestration/recipes/qwen
 *          https://orchestration.civitai.com/openapi/v2-consumers.json
 */
const CIVITAI_NEGATIVE_MODELS = new Set(["krea2-turbo", "krea2-raw", "z-image-turbo", "sdxl", "anima", "flux2-klein"]);

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
 * OpenAI's GPT Image 2 supports the verified custom-dimension contract used
 * by the page. GPT Image 1.5/1 use the published legacy size enum instead.
 * https://developers.openai.com/api/docs/guides/image-generation
 */
const GPT_IMAGE_2_HQ_SIZE = "1536x1536";
const GPT_IMAGE_LEGACY_HQ_SIZE = "1536x1024";
const GPT_IMAGE_DEFAULT_SIZE = "1024x1024";

function gptImageSize(model: string, quality: "eco" | "std" | "hq") {
  if (quality !== "hq") return GPT_IMAGE_DEFAULT_SIZE;
  return /^gpt-image-2(?:-(?:c|high|vip))?$/i.test(String(model || "").trim())
    ? GPT_IMAGE_2_HQ_SIZE
    : GPT_IMAGE_LEGACY_HQ_SIZE;
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
    return /gpt-image/i.test(selection) ? "gpt" : "generic";
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
  if (/gpt-image/i.test(selection)) return "gpt";
  if (/grok-imagine-image/i.test(selection)) return "grok";
  if (/agnes-image/i.test(selection)) return "agnes";
  if (/sensenova/i.test(selection)) return "sensenova";
  return "generic";
}

export function imageStudioParamState(family: ImageStudioFamily, model: string, mode: ImageStudioMode = "t2i") {
  const civitai = family === "civitai";
  const loraShape: CivitaiLoraShape | undefined = civitai ? civitaiImageLoraShape(model) : undefined;
  const createQuantityMax = studioImageQuantityMax(civitai ? "civitai" : undefined, model);
  const quantityMax =
    civitai && mode !== "t2i" ? CIVITAI_EDIT_QUANTITY_MAX[model] || createQuantityMax : createQuantityMax;
  return {
    showLora: Boolean(loraShape),
    loraShape,
    needsCheckpoint: civitai && civitaiRequiresCheckpointAir(model),
    quantityMax,
    quantityOptions: studioImageQuantityOptions(quantityMax),
    // Seedream's official imageGen input accepts an int32 seed; only the Grok
    // engine lacks a seed field in the adapter body.
    showSeed: civitai && model !== "civitai-grok",
    showNegative: civitai ? CIVITAI_NEGATIVE_MODELS.has(model) : true,
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

export function imageStudioRefError(family: ImageStudioFamily, model: string, mode: ImageStudioMode, refCount: number) {
  if (mode === "t2i") return "";
  if (family === "civitai" && CIVITAI_NO_REF_MODELS.has(model)) {
    if (model === "z-image-turbo") return "Z-Image 仅支持文生图，不接受参考图。请切回文生图或换模型。";
    if (model === "anima") return "Anima 仅支持文生图（createImage），不接受参考图。请切回文生图或换模型。";
  }
  if (!refCount) return mode === "edit" ? "编辑至少上传 1 张参考图" : "图生图至少上传 1 张参考图";
  if (family === "civitai") {
    const max = CIVITAI_REF_MAX[model];
    if (typeof max === "number" && refCount > max) {
      return `${model} 最多 ${max} 张参考图，当前 ${refCount} 张。请先去掉多余的参考再生成。`;
    }
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
}) {
  const params = imageStudioParamState(input.family, input.model, input.mode);
  const count = snapImageStudioCount(input.count, params.quantityOptions);
  const refError = imageStudioRefError(input.family, input.model, input.mode, input.references.length);
  const checkpointError = imageStudioCheckpointError(params.needsCheckpoint, input.model, input.checkpointAir);
  const error = refError || checkpointError;
  const refs = input.mode === "t2i" ? [] : [...input.references];
  const dims = input.family === "civitai" ? normalizeCivitaiImageDims(input.model, input.dims) : input.dims;
  return {
    error: error || undefined,
    params,
    count,
    size:
      input.family === "ark"
        ? input.size
        : input.family === "gpt"
          ? gptImageSize(input.model, input.quality)
          : input.family === "agnes" || input.family === "sensenova"
            ? input.aspect
            : input.size,
    aspectRatio: input.aspect,
    width: input.family === "civitai" || input.family === "grok" ? dims.width : undefined,
    height: input.family === "civitai" || input.family === "grok" ? dims.height : undefined,
    seed: params.showSeed && input.seed ? Number(input.seed) : undefined,
    n: count,
    imageUrl: refs[0],
    imageUrls: refs,
    loras: error ? undefined : buildImageStudioLoras(params.showLora, input.loras),
    checkpointAir: error || !params.needsCheckpoint ? undefined : input.checkpointAir.trim(),
    negativePrompt: params.showNegative ? input.negativePrompt || undefined : undefined,
  };
}
