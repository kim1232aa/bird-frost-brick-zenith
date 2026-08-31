/** Studio UI + generate-path contract for Civitai official engines. */

import { resolveImageModelCapability } from "../services/api/image-model-capabilities.ts";

export type CivitaiLoraShape = "map" | "array";

/**
 * Official LoRA wire is AIR → strength only.
 * Map engines: OpenAPI `loras` additionalProperties number (no clipStrength/weight).
 * Array engines: `{ air, strength }` — ImageGenInputLora.strength 0–4; VideoGenInputLora has no max.
 * https://orchestration.civitai.com/openapi/v2-consumers.json
 * https://developer.civitai.com/orchestration/recipes/flux2
 */

const IMAGE_LORA_SHAPE: Record<string, CivitaiLoraShape> = {
  "krea2-turbo": "map",
  "krea2-raw": "map",
  flux1: "map",
  "z-image-turbo": "map",
  sdxl: "map",
  anima: "map",
  "flux2-klein": "map",
  "flux2-dev": "array",
};

const VIDEO_LORA_SHAPE: Record<string, CivitaiLoraShape> = {
  "ltx2.3": "map",
  hunyuan: "array",
};

const IMAGE_QUANTITY_MAX: Record<string, number> = {
  "krea2-turbo": 12,
  "krea2-raw": 12,
  flux1: 12,
  "z-image-turbo": 12,
  sdxl: 12,
  anima: 12,
  "seedream-4.5": 12,
  "seedream-5.0-pro": 12,
  "qwen-3.0-pro": 6,
  "civitai-grok": 4,
  "flux2-klein": 4,
  "flux2-pro": 4,
  "flux2-dev": 4,
};

const CHECKPOINT_MODELS = new Set(["flux1", "sdxl"]);

const VIDEO_FPS: Record<string, { defaultFps: number; min?: number; max?: number; wire: "fps" | "frameRate" }> = {
  /** ComfyLtx23VideoGenInput.fps: 1–60, default 24. */
  "ltx2.3": { defaultFps: 24, min: 1, max: 60, wire: "fps" },
  /** HunyuanVdeoGenInput.frameRate: integer default 25, no official min/max — do not invent 1–60. */
  hunyuan: { defaultFps: 25, wire: "frameRate" },
};

/** LTX 2.3 typical sizes. Official recipe: 1280×720 / 720×1280 / 1024×1024. OpenAPI defaults 1280×720. https://developer.civitai.com/orchestration/recipes/ltx2 */
const LTX_ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
};

/** Hunyuan recommended resolutions. Official recipe table. https://developer.civitai.com/orchestration/recipes/hunyuan */
const HUNYUAN_ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 480, height: 854 },
  "1:1": { width: 480, height: 480 },
};

const QUANTITY_CHOICES = [1, 2, 4, 6, 8, 12] as const;
export const DEFAULT_STUDIO_IMAGE_QUANTITY_MAX = 4;
const UNPUBLISHED_QUANTITY_CHIP_MAX = 10;

function capabilityAdapterType(adapter?: string) {
  const id = String(adapter || "").trim().toLowerCase();
  if (id === "ark-plan") return "ark";
  if (id === "civitai") return "civitai-orchestration";
  return id;
}

function capabilityImageQuantityMax(adapter: string | undefined, model: string, operation: "generate" | "edit") {
  const capability = resolveImageModelCapability({
    model,
    operation,
    provider: adapter ? { adapterType: capabilityAdapterType(adapter) } : undefined,
  });
  if (capability.outputCount.state === "supported") return capability.outputCount.max;
  if (capability.outputCount.state === "unsupported") return 1;
  return null;
}

export function isCivitaiAdapterType(adapter?: string) {
  const id = String(adapter || "").trim().toLowerCase();
  return id === "civitai" || id === "civitai-orchestration";
}

/**
 * Match a short Civitai engine id ("flux2-klein") or a full service id
 * ("image/flux2/klein/editImage/9b") to the engine family used by the
 * LoRA-shape and quantity tables. Unknown ids return undefined instead of a
 * fabricated shape/cap.
 */
function civitaiServiceFamily(model: string): string | undefined {
  const id = String(model || "").trim().toLowerCase();
  if (IMAGE_LORA_SHAPE[id] !== undefined || IMAGE_QUANTITY_MAX[id] !== undefined) return id;
  if (/^image\/flux2\/klein\/(?:createimage|editimage)\/(?:4b|4b-base|9b|9b-base|9b-kv)$/.test(id) || /^image\/sdcpp\/flux2klein\/createvariant\/(?:4b|4b-base|9b|9b-base|9b-kv)$/.test(id)) return "flux2-klein";
  if (/^image\/flux2\/dev\/(?:createimage|editimage)$/.test(id) || /^image\/sdcpp\/flux2dev\/createvariant$/.test(id)) return "flux2-dev";
  if (/^image\/flux2\/pro\/(?:createimage|editimage)$/.test(id)) return "flux2-pro";
  if (/^image\/comfy\/krea2\/(?:turbo|raw)\/createimage$/.test(id) || id === "image/comfy/krea2/edit/editimage") return "krea2-turbo";
  if (/^image\/fal\/krea2\/createimage$/.test(id)) return "krea2-fal";
  if (/^image\/(?:comfy|sdcpp)\/flux1\/(?:createimage|createvariant)$/.test(id)) return "flux1";
  if (/^image\/sdcpp\/zimage\/(?:turbo|base)\/createimage$/.test(id)) return "z-image-turbo";
  if (/^image\/(?:sdcpp|comfy)\/sdxl\/createimage$/.test(id) || id === "image/sdcpp/sdxl/createvariant") return "sdxl";
  if (/^image\/sdcpp\/anima\/createimage$/.test(id) || /^image\/comfy\/anima\/createimage$/.test(id)) return "anima";
  if (/^image\/qwen\/(?:createimage|editimage)\/3\.0-pro$/.test(id)) return "qwen-3.0-pro";
  if (/^image\/sdcpp\/qwen\/20b\/(?:createimage|editimage|createvariant)$/.test(id)) return "sdcpp-qwen-20b";
  if (/^image\/seedream\/v(?:4|4\.5|5\.0-lite|5\.0-pro)$/.test(id)) return "seedream";
  if (/^image\/grok\/v1\.0\/(?:createimage|editimage)$/.test(id)) return "civitai-grok";
  if (/^image\/wan\/v2\.7\/fal\/(?:createimage|editimage)$/.test(id)) return "wan";
  if (/^image\/openai\/gpt-image-2\/(?:createimage|editimage)$/.test(id)) return "openai-gpt-image-2";
  if (/\/gemini\//.test(id)) return "gemini";
  if (/\/google\//.test(id)) return "google";
  if (/\/fal\/qwen2\//.test(id)) return "fal-qwen2";
  if (/\/fal\/mai\//.test(id) || /\/fal\/maiimage\//.test(id)) return "fal-mai";
  if (/\/fal\/reve\//.test(id)) return "fal-reve";
  if (/\/flux1-kontext\//.test(id)) return "flux1-kontext";
  if (/\/comfy\/hidream-o1(?:\/|$)/.test(id)) return "hidream-o1";
  if (/\/comfy\/hidream(?:\/|$)/.test(id)) return "hidream";
  if (/\/comfy\/ernie(?:\/|$)/.test(id)) return "ernie";
  if (/\/comfy\/boogu\//.test(id)) return "boogu";
  if (/\/comfy\/mageflow\//.test(id) || /\/mageflow\//.test(id)) return "mageflow";
  return undefined;
}

export function civitaiImageLoraShape(model: string): CivitaiLoraShape | undefined {
  const family = civitaiServiceFamily(model);
  if (!family) return undefined;
  if (family === "krea2-fal") return undefined;
  if (family === "wan") return "array";
  if (family === "sdcpp-qwen-20b") return "map";
  if (family === "flux2-dev") return "array";
  return IMAGE_LORA_SHAPE[family];
}

export function civitaiVideoLoraShape(model: string): CivitaiLoraShape | undefined {
  const id = String(model || "").trim().toLowerCase();
  if (VIDEO_LORA_SHAPE[id] !== undefined) return VIDEO_LORA_SHAPE[id];
  if (/\/ltx2\.3(?:\/|$)/.test(id)) return "map";
  if (/\/hunyuan(?:\/|$)/.test(id)) return "array";
  if (id === "video/wan/v2.2/comfy") return "array";
  return undefined;
}

/** ImageGenInputLora.strength range. Map LoRAs have no official min/max in OpenAPI — do not invent one. */
export function civitaiImageLoraStrengthRange(model: string): { min: number; max: number } | undefined {
  return civitaiImageLoraShape(model) === "array" ? { min: 0, max: 4 } : undefined;
}

export function civitaiRequiresCheckpointAir(model: string) {
  return CHECKPOINT_MODELS.has(String(model || "").trim());
}

export function assertCivitaiCheckpointAir(adapter: string | undefined, model: string, checkpointAir?: string) {
  const air = String(checkpointAir || "").trim();
  if (isCivitaiAdapterType(adapter) && civitaiRequiresCheckpointAir(model) && !air) {
    throw new Error(`${model} 需要 checkpoint AIR（urn:air:…），不会编造 AIR`);
  }
  return air;
}

function inferCivitaiQuantityOperation(model: string, operation?: "generate" | "edit") {
  if (operation) return operation;
  const id = String(model || "").trim().toLowerCase();
  if (/\/editimage(?:\/|$)/.test(id) || /\/edit(?:\/|$)/.test(id) || /createvariant/.test(id)) return "edit";
  return "generate";
}

export function civitaiImageQuantityMax(model: string, operation?: "generate" | "edit"): number | null {
  const family = civitaiServiceFamily(model);
  if (!family) return null;
  const op = inferCivitaiQuantityOperation(model, operation);
  if (family === "krea2-turbo") return op === "edit" ? 4 : 12;
  if (family === "sdcpp-qwen-20b") return 12;
  if (family === "qwen-3.0-pro") return 6;
  if (family === "krea2-fal") return 10;
  if (family === "flux1-kontext" || family === "openai-gpt-image-2" || family === "gemini" || family === "google" || family === "civitai-grok" || family === "flux2-klein" || family === "flux2-pro" || family === "flux2-dev") return 4;
  if (family === "wan" || family === "fal-qwen2") return 10;
  const published = IMAGE_QUANTITY_MAX[family];
  return typeof published === "number" ? published : null;
}

export function studioImageQuantityMax(
  adapter: string | undefined,
  model: string,
  operation: "generate" | "edit" = "generate",
): number | null {
  if (isCivitaiAdapterType(adapter)) return civitaiImageQuantityMax(model, operation);
  return capabilityImageQuantityMax(adapter, model, operation);
}

export function studioImageQuantityOptions(max: number | null | undefined): number[] {
  // Unpublished max (null/NaN) is not a fake quantityMax=10: Ark Seedream is
  // clientFanout(max=null) with no generic `n`. Chips still go to 10 for UI.
  // https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01
  // OpenAI published n is 1–10, so max=10 must include 10.
  // https://developers.openai.com/api/docs/guides/image-generation
  const unpublished = typeof max !== "number" || !Number.isFinite(max);
  const cap = unpublished ? UNPUBLISHED_QUANTITY_CHIP_MAX : Math.max(1, Math.floor(max));
  const chips: number[] = QUANTITY_CHOICES.filter((item) => item <= cap);
  if (cap >= 10 && cap < 12 && !chips.includes(10)) chips.push(10);
  if (cap > 1 && !chips.includes(cap) && cap <= 16) chips.push(cap);
  chips.sort((left, right) => left - right);
  return chips.length ? chips : [1];
}

export function clampStudioImageQuantity(n: number | undefined, max: number | null | undefined) {
  const raw = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 1;
  const lower = Math.max(1, raw);
  if (typeof max !== "number" || !Number.isFinite(max)) return lower;
  return Math.max(1, Math.min(Math.floor(max), lower));
}

export function resolveStudioImageQuantity(
  adapter: string | undefined,
  model: string,
  n?: number,
  quantity?: number,
  operation: "generate" | "edit" = "generate",
) {
  return clampStudioImageQuantity(quantity ?? n, studioImageQuantityMax(adapter, model, operation));
}

export function snapStudioImageQuantity(n: number, options: readonly number[]) {
  if (!options.length) return 1;
  if (options.includes(n)) return n;
  return options.reduce((best, item) => (Math.abs(item - n) < Math.abs(best - n) ? item : best), options[0]);
}

export function civitaiVideoFpsSpec(model: string) {
  return VIDEO_FPS[String(model || "").trim()];
}

export function clampCivitaiVideoFps(model: string, fps?: number) {
  const spec = civitaiVideoFpsSpec(model);
  if (!spec) return undefined;
  if (typeof fps !== "number" || !Number.isFinite(fps)) return spec.defaultFps;
  let value = Math.round(fps);
  if (typeof spec.min === "number") value = Math.max(spec.min, value);
  if (typeof spec.max === "number") value = Math.min(spec.max, value);
  return value;
}

export function studioVideoFps(adapter: string | undefined, model: string, fps?: number) {
  if (!isCivitaiAdapterType(adapter) || !civitaiVideoFpsSpec(model)) return fps;
  if (typeof fps !== "number" || !Number.isFinite(fps)) return undefined;
  return clampCivitaiVideoFps(model, fps);
}

export function studioVideoLoras(
  adapter: string | undefined,
  model: string,
  loras?: Record<string, number> | Readonly<Record<string, number>>,
) {
  if (!loras || !Object.keys(loras).length) return undefined;
  if (!isCivitaiAdapterType(adapter)) return loras;
  if (!civitaiVideoLoraShape(model)) return undefined;
  return loras;
}

/** LTX 2.3 OpenAPI `generateAudio` boolean, default true. Hunyuan schema has no such field (`additionalProperties: false`). */
export function studioVideoGenerateAudio(
  adapter: string | undefined,
  model: string,
  generateAudio?: boolean,
) {
  if (!isCivitaiAdapterType(adapter)) return generateAudio;
  if (String(model || "").trim() !== "ltx2.3") return undefined;
  return typeof generateAudio === "boolean" ? generateAudio : undefined;
}

export function studioVideoSize(
  adapter: string | undefined,
  model: string,
  aspectRatio?: string,
): { width?: number; height?: number } {
  if (!isCivitaiAdapterType(adapter)) return {};
  const ratio = String(aspectRatio || "").trim().replace(/\s+/g, "");
  const id = String(model || "").trim();
  const map = id === "ltx2.3" ? LTX_ASPECT_SIZE : id === "hunyuan" ? HUNYUAN_ASPECT_SIZE : undefined;
  if (!map || !ratio || !map[ratio]) return {};
  return map[ratio];
}

export type StudioVideoAdapterFields = {
  fps?: number;
  loras?: Record<string, number> | Readonly<Record<string, number>>;
  generateAudio?: boolean;
  aspectRatio?: string;
  width?: number;
  height?: number;
};

export function studioVideoAdapterFields(
  adapter: string | undefined,
  model: string,
  input: {
    fps?: number;
    loras?: Record<string, number> | Readonly<Record<string, number>>;
    generateAudio?: boolean;
    aspectRatio?: string;
    width?: number;
    height?: number;
  },
): StudioVideoAdapterFields {
  const civitai = isCivitaiAdapterType(adapter);
  const knownCivitaiVideo = Boolean(civitaiVideoFpsSpec(model));
  const size = studioVideoSize(adapter, model, input.aspectRatio);
  return {
    fps: studioVideoFps(adapter, model, input.fps),
    loras: studioVideoLoras(adapter, model, input.loras),
    generateAudio: studioVideoGenerateAudio(adapter, model, input.generateAudio),
    aspectRatio: civitai && !knownCivitaiVideo ? undefined : input.aspectRatio,
    ...(typeof size.width === "number"
      ? { width: size.width }
      : !civitai || knownCivitaiVideo
        ? typeof input.width === "number"
          ? { width: input.width }
          : {}
        : {}),
    ...(typeof size.height === "number"
      ? { height: size.height }
      : !civitai || knownCivitaiVideo
        ? typeof input.height === "number"
          ? { height: input.height }
          : {}
        : {}),
  };
}

function studioImageLoras(
  adapter: string | undefined,
  model: string,
  loras?: Record<string, number> | Readonly<Record<string, number>>,
) {
  if (!loras || !Object.keys(loras).length) return undefined;
  if (isCivitaiAdapterType(adapter) && !civitaiImageLoraShape(model)) return undefined;
  return loras;
}

export function studioImageAdapterFields(
  adapter: string | undefined,
  model: string,
  input: {
    n?: number;
    quantity?: number;
    checkpointAir?: string;
    loras?: Record<string, number> | Readonly<Record<string, number>>;
    operation?: "generate" | "edit";
  },
) {
  const checkpointAir = assertCivitaiCheckpointAir(adapter, model, input.checkpointAir);
  return {
    n: resolveStudioImageQuantity(adapter, model, input.n, input.quantity, input.operation),
    checkpointAir: checkpointAir || undefined,
    loras: studioImageLoras(adapter, model, input.loras),
  };
}

export function civitaiVideoFpsOptions(model: string) {
  const spec = civitaiVideoFpsSpec(model);
  if (!spec) return [];
  return spec.wire === "frameRate" ? [24, 25, 30] : [16, 24, 30];
}

export function civitaiCheckpointPlaceholder(model: string) {
  if (model === "flux1") return "urn:air:flux1:checkpoint:civitai:<id>@<ver>";
  if (model === "sdxl") return "urn:air:sdxl:checkpoint:civitai:<id>@<ver>";
  return "urn:air:…:checkpoint:civitai:<id>@<ver>";
}

export function civitaiLoraPlaceholder(_model: string) {
  return "urn:air:…:lora:civitai:<id>@<ver>";
}
