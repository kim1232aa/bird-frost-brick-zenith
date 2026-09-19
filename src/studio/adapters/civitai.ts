import type { ImageGenInput, StudioAdapter, VideoCreateInput, VideoPollResult } from "./types.ts";
import { collectImageRefs } from "../image-refs.ts";

type Extra = {
  imageUrl?: string;
  imageUrls?: string[];
  lastFrameUrl?: string;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  n?: number;
  loras?: Record<string, number> | Readonly<Record<string, number>>;
  checkpointAir?: string;
  aspectRatio?: string;
  duration?: number;
  fps?: number;
  strength?: number;
  generateAudio?: boolean;
  resolution?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  audioUrl?: string;
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
  cfgScale?: number;
  denoise?: number;
  engine?: string;
  comfy?: string;
};

export type CivitaiImagePlanInput = ImageGenInput & {
  checkpointAir?: string;
  whatif?: boolean;
  quantity?: number;
  allowMatureContent?: boolean;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  denoise?: number;
  comfy?: string;
  engine?: string;
};

export type CivitaiVideoPlanInput = VideoCreateInput & {
  loras?: Extra["loras"];
  whatif?: boolean;
  width?: number;
  height?: number;
  allowMatureContent?: boolean;
};

export type CivitaiEngine = {
  id: string;
  label: string;
  kind: "image" | "video";
  nsfw: boolean;
  tags: string[];
  body: (prompt: string, extra?: Extra) => Record<string, unknown>;
};

type CivitaiPlannedRequest = {
  path: string;
  body: ReturnType<typeof workflowBody>;
  timeoutMs: number;
  baseUrl: string;
};

function extraRefs(extra?: Extra, max?: number) {
  return collectImageRefs({ imageUrl: extra?.imageUrl, imageUrls: extra?.imageUrls }, max);
}

function qty(extra: Extra | undefined, max: number) {
  const raw = extra?.quantity ?? extra?.n ?? 1;
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 1;
  return Math.max(1, Math.min(max, n));
}

function hasLoras(extra?: Extra) {
  return Boolean(extra?.loras && Object.keys(extra.loras).length);
}

/**
 * Official LoRA wire fields from live OpenAPI (`ImageGenInputLora` / `VideoGenInputLora`
 * and map `additionalProperties: number`): AIR → strength only.
 * No `weight`, `clipStrength`, `type`, or nested objects.
 * https://orchestration.civitai.com/openapi/v2-consumers.json
 * https://developer.civitai.com/orchestration/recipes/flux2
 */
function officialLoraEntries(extra?: Extra): Array<[string, number]> {
  if (!extra?.loras) return [];
  const entries: Array<[string, number]> = [];
  for (const [rawAir, strength] of Object.entries(extra.loras)) {
    const air = String(rawAir || "").trim();
    if (!air) throw new Error("Civitai LoRA 需要 AIR URN（urn:air:…:lora:…），不会编造");
    if (typeof strength !== "number" || !Number.isFinite(strength)) {
      throw new Error("Civitai LoRA 只支持 strength 数字，不支持 weight/clipStrength");
    }
    entries.push([air, strength]);
  }
  return entries;
}

function loraMapPatch(extra?: Extra) {
  const entries = officialLoraEntries(extra);
  return entries.length ? { loras: Object.fromEntries(entries) } : {};
}

/** Flux 2 Dev: `loras[]` of `{ air, strength }` with ImageGenInputLora.strength 0–4. Hunyuan: same keys, no official max. */
function loraArrayPatch(extra?: Extra, kind: "image" | "video" = "image") {
  const entries = officialLoraEntries(extra);
  if (!entries.length) return {};
  return {
    loras: entries.map(([air, strength]) => {
      if (kind === "image" && (strength < 0 || strength > 4)) {
        throw new Error(`Civitai LoRA strength 仅支持 0–4（ImageGenInputLora），收到 ${strength}`);
      }
      return { air, strength };
    }),
  };
}

function rejectLoras(label: string, extra?: Extra) {
  if (hasLoras(extra)) throw new Error(`${label} 不支持 LoRA`);
}

function requireCheckpointAir(label: string, extra?: Extra) {
  const air = String(extra?.checkpointAir || "").trim();
  if (!air) throw new Error(`${label} 需要 checkpoint AIR（urn:air:…），不会编造 AIR`);
  return air;
}

function comfyCheckpointBody(
  ecosystem: "flux1" | "sdxl",
  label: string,
  prompt: string,
  extra: Extra | undefined,
  withNegativePrompt: boolean,
) {
  const refs = extraRefs(extra);
  if (refs.length > 1) {
    throw new Error(`${label} 的 createVariant 只用 1 张参考图`);
  }
  const image = refs[0];
  return {
    engine: "comfy",
    ecosystem,
    model: requireCheckpointAir(label, extra),
    operation: image ? "createVariant" : "createImage",
    prompt,
    width: extra?.width || 1024,
    height: extra?.height || 1024,
    quantity: qty(extra, 12),
    ...(withNegativePrompt && extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
    ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
    ...(image ? { image } : {}),
    ...(image && typeof extra?.strength === "number" ? { denoiseStrength: extra.strength } : {}),
    ...loraMapPatch(extra),
  };
}

function flux2Body(model: "klein" | "pro" | "dev", prompt: string, extra?: Extra) {
  if (model === "pro") rejectLoras("Flux 2 Pro", extra);
  const refs = extraRefs(extra, model === "klein" ? 2 : undefined);
  const loras = model === "dev" ? loraArrayPatch(extra) : model === "klein" ? loraMapPatch(extra) : {};
  return {
    engine: "flux2",
    model,
    operation: refs.length ? "editImage" : "createImage",
    prompt,
    width: extra?.width || 1024,
    height: extra?.height || 1024,
    quantity: qty(extra, 4),
    ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
    ...(model === "klein" && extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
    ...(refs.length ? { images: refs } : {}),
    ...loras,
  };
}

/**
 * Civitai's live OpenAPI exposes a separate Krea 2 Comfy edit model:
 * model `edit`, operation `editImage`, and 1–2 `images`.
 * https://orchestration.civitai.com/openapi/v2-consumers.json
 */
function krea2Body(model: "turbo" | "raw", prompt: string, extra?: Extra) {
  const refs = extraRefs(extra);
  const commonParams = {
    ...(typeof extra?.steps === "number" ? { steps: extra.steps } : {}),
    ...(typeof extra?.cfgScale === "number" ? { cfgScale: extra.cfgScale } : {}),
    ...(typeof extra?.guidance === "number" ? { cfgScale: extra.guidance } : {}),
    ...(extra?.sampler ? { sampler: extra.sampler } : {}),
    ...(extra?.scheduler ? { scheduler: extra.scheduler } : {}),
    ...(typeof extra?.denoise === "number" ? { denoise: extra.denoise } : {}),
    ...(extra?.comfy ? { comfy: extra.comfy } : {}),
  };
  if (refs.length) {
    if (refs.length > 2) throw new Error(`krea2-${model} 最多支持 2 张参考图`);
    const editRefs = refs.slice(0, 2);
    return {
      engine: "comfy",
      ecosystem: "krea2",
      model: "edit",
      operation: "editImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra, 4),
      ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
      ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
      images: editRefs,
      ...commonParams,
      ...loraMapPatch(extra),
    };
  }
  return {
    engine: "comfy",
    ecosystem: "krea2",
    model,
    operation: "createImage",
    prompt,
    width: extra?.width || 1024,
    height: extra?.height || 1024,
    quantity: qty(extra, 12),
    ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
    ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
    imageMetadata: JSON.stringify({ app: "boundless-studio", engine: `krea2-${model}` }),
    ...commonParams,
    ...loraMapPatch(extra),
  };
}

export const CIVITAI_ENGINES: CivitaiEngine[] = [
  {
    id: "krea2-turbo",
    label: "Krea 2 Turbo",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Comfy"],
    body: (prompt, extra) => krea2Body("turbo", prompt, extra),
  },
  {
    id: "krea2-raw",
    label: "Krea 2 Raw",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Comfy"],
    body: (prompt, extra) => krea2Body("raw", prompt, extra),
  },
  {
    id: "flux1",
    label: "Flux 1",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux"],
    body: (prompt, extra) => comfyCheckpointBody("flux1", "Flux 1", prompt, extra, false),
  },
  {
    id: "flux2-klein",
    label: "Flux 2 Klein",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux2", "便宜", "编辑"],
    body: (prompt, extra) => flux2Body("klein", prompt, extra),
  },
  {
    id: "flux2-pro",
    label: "Flux 2 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux2", "编辑"],
    body: (prompt, extra) => flux2Body("pro", prompt, extra),
  },
  {
    id: "z-image-turbo",
    label: "Z-Image Turbo",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Z-Image"],
    body: (prompt, extra) => {
      if (extraRefs(extra).length) {
        throw new Error("Z-Image 仅支持 createImage，不接受参考图，不能使用 createVariant。");
      }
      return {
        engine: "sdcpp",
        ecosystem: "zImage",
        model: "turbo",
        operation: "createImage",
        prompt,
        width: extra?.width || 1024,
        height: extra?.height || 1024,
        quantity: qty(extra, 12),
        ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
        ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
        ...loraMapPatch(extra),
      };
    },
  },
  {
    id: "civitai-grok",
    label: "Grok Image (Civitai)",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Grok", "编辑"],
    body: (prompt, extra) => {
      rejectLoras("Grok Image", extra);
      const refs = extraRefs(extra, 3);
      const create = refs.length === 0;
      return {
        engine: "grok",
        version: "v1.0",
        operation: create ? "createImage" : "editImage",
        prompt,
        quantity: qty(extra, 4),
        ...(create && extra?.aspectRatio ? { aspectRatio: extra.aspectRatio } : {}),
        ...(refs.length ? { images: refs } : {}),
      };
    },
  },
  {
    id: "flux2-dev",
    label: "Flux 2 Dev",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux2", "编辑"],
    body: (prompt, extra) => flux2Body("dev", prompt, extra),
  },
  {
    id: "sdxl",
    label: "SDXL",
    kind: "image",
    nsfw: true,
    tags: ["mature", "SDXL", "LoRA"],
    body: (prompt, extra) => comfyCheckpointBody("sdxl", "SDXL", prompt, extra, true),
  },
  {
    id: "anima",
    label: "Anima",
    kind: "image",
    nsfw: true,
    tags: ["mature", "动漫", "LoRA"],
    body: (prompt, extra) => {
      const refs = extraRefs(extra);
      if (refs.length) {
        throw new Error("Anima 仅支持 createImage，不接受参考图。请改用 Flux 2 Klein 或 Qwen 做编辑。");
      }
      return {
        engine: "sdcpp",
        ecosystem: "anima",
        operation: "createImage",
        prompt,
        width: extra?.width || 1024,
        height: extra?.height || 1024,
        quantity: qty(extra, 12),
        ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
        ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
        ...loraMapPatch(extra),
      };
    },
  },
  {
    id: "qwen-3.0-pro",
    label: "Qwen Image 3.0 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Qwen", "编辑"],
    body: (prompt, extra) => {
      rejectLoras("Qwen 3.0 Pro", extra);
      const refs = extraRefs(extra, 3);
      return {
        engine: "qwen",
        model: "3.0-pro",
        operation: refs.length ? "editImage" : "createImage",
        prompt,
        width: extra?.width || 1024,
        height: extra?.height || 1024,
        quantity: qty(extra, 6),
        // Official default is true and dominates latency (11s off vs 98s on for 3.0-pro).
        // https://developer.civitai.com/orchestration/recipes/qwen
        promptExtend: false,
        ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
        ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
        ...(refs.length ? { images: refs } : {}),
      };
    },
  },
  {
    id: "seedream-4.5",
    label: "Seedream 4.5",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Seedream"],
    body: (prompt, extra) => {
      rejectLoras("Seedream", extra);
      const refs = extraRefs(extra, 10);
      return {
        engine: "seedream",
        version: "v4.5",
        prompt,
        enableSafetyChecker: false,
        quantity: qty(extra, 12),
        ...(extra?.width ? { width: extra.width } : {}),
        ...(extra?.height ? { height: extra.height } : {}),
        ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
        ...(refs.length ? { images: refs } : {}),
      };
    },
  },
  {
    id: "seedream-5.0-pro",
    label: "Seedream 5.0 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Seedream"],
    body: (prompt, extra) => {
      rejectLoras("Seedream", extra);
      const refs = extraRefs(extra, 10);
      return {
        engine: "seedream",
        version: "v5.0-pro",
        prompt,
        enableSafetyChecker: false,
        quantity: qty(extra, 12),
        ...(extra?.width ? { width: extra.width } : {}),
        ...(extra?.height ? { height: extra.height } : {}),
        ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
        ...(refs.length ? { images: refs } : {}),
      };
    },
  },
  {
    id: "ltx2.3",
    label: "LTX 2.3",
    kind: "video",
    nsfw: true,
    tags: ["mature", "视频"],
    body: (prompt, extra) => buildLtxBody(prompt, extra),
  },
  {
    id: "hunyuan",
    label: "Hunyuan Video",
    kind: "video",
    nsfw: true,
    tags: ["mature", "视频"],
    body: (prompt, extra) => buildHunyuanBody(prompt, extra),
  },
];

function uniqueUrls(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

/** LTX 2.3 official sizes: 1280×720, 720×1280, 1024×1024. https://developer.civitai.com/orchestration/recipes/ltx2 */
const LTX_ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
};

/** Hunyuan recommended sizes. https://developer.civitai.com/orchestration/recipes/hunyuan */
const HUNYUAN_ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 480, height: 854 },
  "1:1": { width: 480, height: 480 },
};

function normalizeAspectRatio(value?: string) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function videoDimensions(
  label: string,
  map: Record<string, { width: number; height: number }>,
  extra: Extra | undefined,
  fallback: { width: number; height: number },
) {
  const hasW = typeof extra?.width === "number" && Number.isFinite(extra.width) && extra.width > 0;
  const hasH = typeof extra?.height === "number" && Number.isFinite(extra.height) && extra.height > 0;
  if (hasW || hasH) {
    return {
      width: hasW ? extra!.width! : fallback.width,
      height: hasH ? extra!.height! : fallback.height,
    };
  }
  const ratio = normalizeAspectRatio(extra?.aspectRatio);
  if (!ratio) return fallback;
  const size = map[ratio];
  if (!size) {
    throw new Error(`${label} 的 aspectRatio 仅支持 ${Object.keys(map).join(" / ")}，收到 ${ratio}`);
  }
  return size;
}

function optionalFiniteNumber(
  value: number | undefined,
  label: string,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数字，收到 ${String(value)}`);
  }
  if (integer && !Number.isInteger(value)) throw new Error(`${label} 必须是整数，收到 ${value}`);
  if (value < minimum || value > maximum) {
    throw new Error(`${label} 只接受 ${minimum}–${maximum}，收到 ${value}；不会静默夹取`);
  }
  return value;
}

function ltxModelVariant(value?: string) {
  const model = String(value || "").trim() || "22b-distilled";
  if (model !== "22b-dev" && model !== "22b-distilled") {
    throw new Error(`LTX 2.3 model 只接受 22b-dev / 22b-distilled，收到 ${model}`);
  }
  return model;
}

function rejectUnsupportedCivitaiVideoFields(model: string, extra?: Extra, extraFields: ReadonlyArray<[string, unknown]> = []) {
  const fields: ReadonlyArray<[string, unknown]> = [
    ["resolution", extra?.resolution],
    ["watermark", extra?.watermark],
    ["promptExpansion", extra?.promptExpansion],
    ["returnLastFrame", extra?.returnLastFrame],
    ["audioUrl", extra?.audioUrl],
    ["frames", extra?.frames],
    ["audioMode", extra?.audioMode],
    ["sampler", extra?.sampler],
    ["scheduler", extra?.scheduler],
    ["usePro", extra?.usePro],
    ...extraFields,
  ];
  for (const [name, value] of fields) {
    if (value !== undefined && value !== null && (typeof value !== "string" || Boolean(value.trim()))) {
      throw new Error(`Civitai ${model} 官方视频不支持 ${name}；不会静默丢弃该字段。`);
    }
  }
}

function buildLtxBody(prompt: string, extra?: Extra) {
  rejectUnsupportedCivitaiVideoFields("LTX 2.3", extra, [
    ["mode", extra?.mode],
    ["safetyChecker", extra?.safetyChecker],
    ["shift", extra?.shift],
    ["turbo", extra?.turbo],
  ]);

  const first = String(extra?.imageUrl || "").trim();
  const last = String(extra?.lastFrameUrl || "").trim();
  const listed = uniqueUrls(extra?.imageUrls || []);
  const extras = listed.filter((url) => url !== first && url !== last);
  const size = videoDimensions("LTX 2.3", LTX_ASPECT_SIZE, extra, { width: 1280, height: 720 });
  const duration = optionalFiniteNumber(extra?.duration, "LTX 2.3 duration", 3, 20, true) ?? 5;
  const fps = optionalFiniteNumber(extra?.fps, "LTX 2.3 fps", 1, 60) ?? 24;
  const steps = optionalFiniteNumber(extra?.steps, "LTX 2.3 numInferenceSteps", 8, 50, true);
  const guidance = optionalFiniteNumber(extra?.guidance, "LTX 2.3 guidanceScale", 1, 10);
  const quantity = optionalFiniteNumber(extra?.quantity, "LTX 2.3 quantity", 1, 10, true);
  const frameGuideStrength = optionalFiniteNumber(extra?.frameGuideStrength, "LTX 2.3 frameGuideStrength", 0, 1);
  if (frameGuideStrength !== undefined && !last) {
    throw new Error("LTX 2.3 frameGuideStrength 只属于 firstLastFrameToVideo；createVideo 不会静默丢弃该字段。");
  }
  const shared = {
    engine: "ltx2.3",
    model: ltxModelVariant(extra?.modelVariant),
    prompt,
    duration,
    width: size.width,
    height: size.height,
    fps,
    ...(typeof extra?.generateAudio === "boolean" ? { generateAudio: extra.generateAudio } : {}),
    ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
    ...(typeof extra?.seed === "number" && Number.isFinite(extra.seed) ? { seed: extra.seed } : {}),
    ...(steps !== undefined ? { numInferenceSteps: steps } : {}),
    ...(guidance !== undefined ? { guidanceScale: guidance } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...loraMapPatch(extra),
  };
  if (last) {
    if (extras.length) {
      throw new Error("LTX firstLastFrameToVideo 只用 firstFrame/lastFrame，不能附加 images");
    }
    return {
      ...shared,
      operation: "firstLastFrameToVideo",
      ...(first ? { firstFrame: first } : {}),
      lastFrame: last,
      ...(frameGuideStrength !== undefined ? { frameGuideStrength } : {}),
    };
  }
  const images = uniqueUrls([first, ...listed]);
  if (images.length > 1) throw new Error("LTX createVideo 的 images 最多 1 张");
  return {
    ...shared,
    operation: "createVideo",
    ...(images.length ? { images } : {}),
  };
}

function buildHunyuanBody(prompt: string, extra?: Extra) {
  const refs = extraRefs(extra);
  rejectUnsupportedCivitaiVideoFields("Hunyuan", extra, [
    ["quantity", extra?.quantity],
    ["mode", extra?.mode],
    ["frameGuideStrength", extra?.frameGuideStrength],
    ["safetyChecker", extra?.safetyChecker],
    ["shift", extra?.shift],
    ["turbo", extra?.turbo],
  ]);
  if (refs.length || String(extra?.lastFrameUrl || "").trim()) {
    throw new Error("Hunyuan 是纯文本生视频（T2V），不接受参考图。");
  }
  if (String(extra?.negativePrompt || "").trim()) {
    throw new Error("Hunyuan 官方 schema 不支持 negativePrompt 负面提示词；不会静默丢弃该字段。");
  }
  if (typeof extra?.generateAudio === "boolean") {
    throw new Error("Hunyuan 官方 schema 不支持 generateAudio；不会静默丢弃该字段。");
  }
  if (String(extra?.modelVariant || "").trim()) {
    throw new Error("Hunyuan 当前 Studio 合同不支持 modelVariant；自定义 checkpoint 需要 AIR 专用字段，不能用通用模型变体冒充。");
  }
  const size = videoDimensions("Hunyuan", HUNYUAN_ASPECT_SIZE, extra, { width: 1280, height: 720 });
  const duration = optionalFiniteNumber(extra?.duration, "Hunyuan duration", 1, 30, true) ?? 5;
  const steps = optionalFiniteNumber(extra?.steps, "Hunyuan steps", 10, 50, true) ?? 40;
  const guidance = optionalFiniteNumber(extra?.guidance, "Hunyuan cfgScale", 0, 100);
  return {
    engine: "hunyuan",
    prompt,
    duration,
    width: size.width,
    height: size.height,
    frameRate: typeof extra?.fps === "number" ? extra.fps : 25,
    cfgScale: guidance ?? 4,
    steps,
    ...(typeof extra?.seed === "number" && Number.isFinite(extra.seed) ? { seed: extra.seed } : {}),
    ...loraArrayPatch(extra, "video"),
  };
}

export function civitaiEngine(model: string) {
  const engine = CIVITAI_ENGINES.find((item) => item.id === model);
  if (!engine) throw new Error(`未知 Civitai 模型：${model || "(empty)"}，不会 fallback 到 Krea`);
  return engine;
}

type MediaBlob = { url?: string; available?: boolean };

function blobUrl(item: MediaBlob | undefined) {
  const url = String(item?.url || "").trim();
  if (!url) return "";
  if (item?.available === false) return "";
  return url;
}

function proxyImageUrl(item: unknown) {
  if (typeof item === "string") {
    const text = item.trim();
    return /^https?:\/\//i.test(text) || text.startsWith("data:image/") || text.startsWith("blob:") ? text : "";
  }
  if (!item || typeof item !== "object") return "";
  const row = item as Record<string, unknown>;
  if (row.available === false) return "";
  const url = String(row.url || row.image_url || row.image || "").trim();
  if (url) return url;
  const b64 = String(row.b64_json || row.b64 || "").trim();
  return b64 ? `data:image/png;base64,${b64}` : "";
}

function readCivitaiProxyImageUrls(data: unknown): string[] {
  if (!data) return [];
  if (typeof data === "string") {
    const url = proxyImageUrl(data);
    return url ? [url] : [];
  }
  if (typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (record.available === false) return [];
  const out: string[] = [];
  const lists = [record.data, record.images, record.output_images, record.outputImages, record.urls, record.outputs];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const url = proxyImageUrl(item);
      if (url) out.push(url);
    }
  }
  const output = record.output && typeof record.output === "object" && !Array.isArray(record.output)
    ? record.output
    : undefined;
  if (output) out.push(...readCivitaiProxyImageUrls(output));
  const outputs = record.outputs && typeof record.outputs === "object" && !Array.isArray(record.outputs)
    ? record.outputs
    : undefined;
  if (outputs) out.push(...readCivitaiProxyImageUrls(outputs));
  const direct = proxyImageUrl(record.url || record.image_url);
  if (direct) out.push(direct);
  return Array.from(new Set(out));
}

export function readCivitaiMediaUrl(data: unknown) {
  return readCivitaiMediaUrls(data)[0] || "";
}

export function readCivitaiMediaUrls(data: unknown) {
  if (!data || typeof data !== "object") return [];
  const record = data as {
    images?: MediaBlob[];
    videos?: MediaBlob[];
    steps?: Array<{
      output?: {
        blobs?: MediaBlob[];
        video?: MediaBlob;
        additionalVideos?: MediaBlob[];
        videos?: MediaBlob[];
        images?: MediaBlob[];
      };
    }>;
  };
  const urls: string[] = [];
  for (const step of record.steps || []) {
    const output = step.output;
    for (const item of output?.blobs || []) {
      const blob = blobUrl(item);
      if (blob) urls.push(blob);
    }
    const video = blobUrl(output?.video);
    if (video) urls.push(video);
    for (const item of output?.additionalVideos || []) {
      const extra = blobUrl(item);
      if (extra) urls.push(extra);
    }
    for (const item of output?.videos || []) {
      const legacyVideo = blobUrl(item);
      if (legacyVideo) urls.push(legacyVideo);
    }
    for (const item of output?.images || []) {
      const image = blobUrl(item);
      if (image) urls.push(image);
    }
  }
  for (const item of record.images || []) {
    const image = blobUrl(item);
    if (image) urls.push(image);
  }
  for (const item of record.videos || []) {
    const video = blobUrl(item);
    if (video) urls.push(video);
  }
  urls.push(...readCivitaiProxyImageUrls(data));
  return Array.from(new Set(urls));
}

export function readCivitaiWorkflowId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as {
    jobs?: Array<{ id?: string }>;
    id?: string;
    jobId?: string;
    token?: string;
    workflowId?: string;
  };
  const id = String(record.id || "").trim();
  const workflowId = String(record.workflowId || "").trim();
  if (id.startsWith("wf_")) return id;
  if (workflowId) return workflowId;
  if (id) return id;
  return String(record.jobId || record.jobs?.[0]?.id || record.token || "").trim();
}

const TERMINAL_FAILED = new Set(["failed", "error", "expired", "canceled", "cancelled"]);
const TERMINAL_SUCCEEDED = new Set(["succeeded", "success", "completed", "done"]);
const CIVITAI_IMAGE_POLL_INTERVAL_MS = 4_000;

function workflowStatus(data: unknown) {
  const record = data as { status?: string; jobs?: Array<{ status?: string }>; steps?: Array<{ status?: string }> };
  return String(record?.status || record?.steps?.[0]?.status || record?.jobs?.[0]?.status || "").toLowerCase();
}

export function readCivitaiPollResult(data: unknown, kind: "image" | "video" = "video"): VideoPollResult {
  const url = readCivitaiMediaUrl(data);
  const status = workflowStatus(data);
  if (TERMINAL_FAILED.has(status)) {
    const detail = civitaiError(data);
    if (detail) return { status: "failed", error: detail };
    // 上游有时只给 status:"failed" 不给原因（实测：图片已产出但 available:false，多为审核拦截）。
    // 别只吐一个裸 "failed"——带上 workflow id 和排查方向。
    const id = (data as { id?: string } | null)?.id;
    const suffix = id ? `（workflow ${id}）` : "";
    return {
      status: "failed",
      error: `Civitai 任务失败${suffix}：上游未给出具体原因，通常是内容审核拦截或引擎暂时不可用；可换模型或调整提示词后重试`,
    };
  }
  if (url) return { status: "completed", url };
  if (TERMINAL_SUCCEEDED.has(status)) {
    return {
      status: "failed",
      error: civitaiError(data) || (kind === "image" ? "Civitai 没有返回图片地址" : "Civitai 没有返回视频地址"),
    };
  }
  return { status: "pending" };
}

async function delay(ms: number) {
  await new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, ms);
    if (typeof timer === "object" && timer && "unref" in timer && typeof timer.unref === "function") timer.unref();
  });
}

async function pollCivitaiWorkflow(
  ctx: Parameters<NonNullable<StudioAdapter["generateImage"]>>[0],
  workflowId: string,
  kind: "image" | "video",
  timeoutMs: number,
): Promise<VideoPollResult> {
  const { studioProxyJson } = await import("../generate/proxy.ts");
  const started = Date.now();
  const allowMatureContent = ctx.provider.allowMatureContent !== false;
  let last: VideoPollResult = { status: "pending" };
  while (Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) break;
    const waitSeconds = Math.max(0, Math.min(30, Math.floor(remaining / 1000)));
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: `/workflows/${encodeURIComponent(workflowId)}?${workflowPollQuery(waitSeconds, allowMatureContent)}`,
      method: "GET",
      timeoutMs: Math.min(timeoutMs, Math.max(30_000, waitSeconds * 1000 + 15_000)),
      baseUrl: CIVITAI_WORKFLOWS,
    });
    last = readCivitaiPollResult(data, kind);
    if (last.status !== "pending") return last;
    const pause = Math.min(CIVITAI_IMAGE_POLL_INTERVAL_MS, timeoutMs - (Date.now() - started));
    if (pause <= 0) break;
    await delay(pause);
  }
  return { status: "failed", error: last.error || `Civitai ${kind === "image" ? "图片" : "视频"}生成超时` };
}

const CIVITAI_WORKFLOWS = "https://orchestration.civitai.com/v2/consumer";

function workflowBody(type: "imageGen" | "videoGen", input: Record<string, unknown>, allowMatureContent = true) {
  const allowsMatureContent = allowMatureContent !== false;
  return {
    allowMatureContent: allowsMatureContent,
    ...(allowsMatureContent ? { currencies: ["yellow"] } : {}),
    steps: [{ $type: type, input }],
  };
}

function workflowQuery(wait: number, whatif = false, allowMatureContent = true) {
  const params = new URLSearchParams();
  params.set("wait", String(wait));
  if (whatif) params.set("whatif", "true");
  if (allowMatureContent === false) params.set("hideMatureContent", "true");
  return `/workflows?${params.toString()}`;
}

function workflowPollQuery(wait: number, allowMatureContent = true) {
  const params = new URLSearchParams();
  params.set("wait", String(wait));
  if (allowMatureContent === false) params.set("hideMatureContent", "true");
  return params.toString();
}

function imageExtra(input: CivitaiImagePlanInput): Extra {
  return {
    imageUrl: input.imageUrl,
    imageUrls: input.imageUrls,
    width: input.width,
    height: input.height,
    seed: input.seed,
    negativePrompt: input.negativePrompt,
    quantity: input.quantity ?? input.n,
    n: input.n,
    loras: input.loras,
    checkpointAir: input.checkpointAir,
    aspectRatio: input.aspectRatio,
    strength: input.strength,
    steps: input.steps,
    guidance: input.guidance,
    cfgScale: input.cfgScale ?? input.guidance,
    sampler: input.sampler,
    scheduler: input.scheduler,
    denoise: input.denoise,
    engine: input.engine,
    comfy: input.comfy,
  };
}

export function planCivitaiImageRequest(input: CivitaiImagePlanInput): CivitaiPlannedRequest {
  const engine = civitaiEngine(input.model);
  const refs = extraRefs({ imageUrl: input.imageUrl, imageUrls: input.imageUrls });
  if (input.operation === "edit" && !refs.length) throw new Error("编辑需要至少一张参考图");
  return {
    path: workflowQuery(input.whatif ? 0 : 60, Boolean(input.whatif), input.allowMatureContent),
    body: workflowBody("imageGen", engine.body(input.prompt, imageExtra(input)), input.allowMatureContent),
    timeoutMs: 180_000,
    baseUrl: CIVITAI_WORKFLOWS,
  };
}

export function planCivitaiVideoRequest(input: CivitaiVideoPlanInput): CivitaiPlannedRequest {
  const engine = civitaiEngine(input.model);
  const extra: Extra = {
    imageUrl: input.imageUrl,
    imageUrls: input.imageUrls,
    lastFrameUrl: input.lastFrameUrl,
    width: input.width,
    height: input.height,
    duration: input.duration,
    fps: input.fps,
    loras: input.loras,
    generateAudio: input.generateAudio,
    aspectRatio: input.aspectRatio,
    seed: input.seed,
    negativePrompt: input.negativePrompt,
    steps: input.steps,
    guidance: input.guidance,
    modelVariant: input.modelVariant,
    resolution: input.resolution,
    watermark: input.watermark,
    promptExpansion: input.promptExpansion,
    returnLastFrame: input.returnLastFrame,
    audioUrl: input.audioUrl,
    frames: input.frames,
    audioMode: input.audioMode,
    quantity: input.quantity,
    mode: input.mode,
    frameGuideStrength: input.frameGuideStrength,
    safetyChecker: input.safetyChecker,
    shift: input.shift,
    turbo: input.turbo,
    sampler: input.sampler,
    scheduler: input.scheduler,
    usePro: input.usePro,
  };
  return {
    path: workflowQuery(0, Boolean(input.whatif), input.allowMatureContent),
    body: workflowBody("videoGen", engine.body(input.prompt, extra), input.allowMatureContent),
    timeoutMs: 90_000,
    baseUrl: CIVITAI_WORKFLOWS,
  };
}

export const civitaiAdapter: StudioAdapter = {
  id: "civitai",
  label: "Civitai Orchestration",
  docs: "https://developer.civitai.com/orchestration/guide/submitting-work",
  async generateImage(ctx, input) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) throw new Error("Civitai 需要 API Token");
    const planned = planCivitaiImageRequest({
      ...input,
      allowMatureContent: ctx.provider.allowMatureContent,
    });
    const { studioProxyJson } = await import("../generate/proxy.ts");
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: planned.path,
      body: planned.body,
      timeoutMs: planned.timeoutMs,
      baseUrl: planned.baseUrl,
    });
    const urls = readCivitaiMediaUrls(data);
    if (urls[0]) return { url: urls[0], urls };
    const poll = readCivitaiPollResult(data, "image");
    if (poll.status === "completed" && poll.url) return { url: poll.url, urls: [poll.url] };
    if (poll.status === "failed") throw new Error(poll.error || "Civitai 没有返回图片地址");
    const workflowId = readCivitaiWorkflowId(data);
    if (!workflowId) throw new Error(civitaiError(data) || "Civitai 没有返回图片地址");
    const finished = await pollCivitaiWorkflow(ctx, workflowId, "image", planned.timeoutMs);
    if (finished.status === "completed" && finished.url) return { url: finished.url, urls: [finished.url] };
    throw new Error(finished.error || "Civitai 没有返回图片地址");
  },
  async createVideo(ctx, input) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) throw new Error("Civitai 需要 API Token");
    const planned = planCivitaiVideoRequest({
      ...input,
      allowMatureContent: ctx.provider.allowMatureContent,
    });
    const { studioProxyJson } = await import("../generate/proxy.ts");
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: planned.path,
      body: planned.body,
      timeoutMs: planned.timeoutMs,
      baseUrl: planned.baseUrl,
    });
    const id = readCivitaiWorkflowId(data);
    const url = readCivitaiMediaUrl(data);
    if (url) return { id: id || `done:${url}` };
    if (!id) throw new Error(civitaiError(data) || "Civitai 视频没有返回任务 id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    if (taskId.startsWith("done:")) return { status: "completed", url: taskId.slice(5) };
    const { studioProxyJson } = await import("../generate/proxy.ts");
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: `/workflows/${encodeURIComponent(taskId)}?${workflowPollQuery(30, ctx.provider.allowMatureContent !== false)}`,
      method: "GET",
      timeoutMs: 45_000,
      baseUrl: CIVITAI_WORKFLOWS,
    });
    return readCivitaiPollResult(data, "video");
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Civitai Token" };
    try {
      const planned = planCivitaiImageRequest({
        model: "krea2-turbo",
        prompt: "connectivity probe",
        whatif: true,
        allowMatureContent: ctx.provider.allowMatureContent,
      });
      const { studioProxyJson } = await import("../generate/proxy.ts");
      await studioProxyJson({
        provider: ctx.provider,
        path: planned.path,
        body: planned.body,
        timeoutMs: 20_000,
        baseUrl: planned.baseUrl,
      });
      return { ok: true, message: "Civitai workflows 可访问", models: CIVITAI_ENGINES.map((item) => item.id) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Civitai 不可达" };
    }
  },
};

export function civitaiError(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as {
    type?: string;
    title?: string;
    detail?: string;
    status?: number | string;
    errors?: unknown;
    error?: string | { message?: string; detail?: string; title?: string };
    message?: string;
    jobs?: Array<{
      error?: string;
      errorMessage?: string;
      reason?: string;
      blockedReason?: string;
    }>;
    steps?: Array<{
      error?: string;
      jobs?: Array<{ reason?: string; blockedReason?: string; error?: string }>;
      output?: { errors?: unknown };
    }>;
  };
  const detail = String(record.detail || "").trim();
  const title = String(record.title || "").trim();
  const nestedError =
    typeof record.error === "string"
      ? record.error
      : [record.error?.detail, record.error?.title, record.error?.message].map((item) => String(item || "").trim()).find(Boolean) || "";
  const validation = flattenProblemErrors(record.errors);
  const stepOutputErrors = flattenProblemErrors(record.steps?.[0]?.output?.errors);
  const jobReason = String(
    record.jobs?.[0]?.reason ||
      record.jobs?.[0]?.blockedReason ||
      record.jobs?.[0]?.error ||
      record.jobs?.[0]?.errorMessage ||
      record.steps?.[0]?.jobs?.[0]?.reason ||
      record.steps?.[0]?.jobs?.[0]?.blockedReason ||
      record.steps?.[0]?.jobs?.[0]?.error ||
      record.steps?.[0]?.error ||
      "",
  ).trim();
  return String(
    detail || stepOutputErrors || validation || title || nestedError || record.message || jobReason,
  ).trim();
}

function flattenProblemErrors(errors: unknown): string {
  if (!errors) return "";
  if (typeof errors === "string") return errors.trim();
  if (Array.isArray(errors)) {
    return errors
      .map((item) => (typeof item === "string" ? item : flattenProblemErrors(item)))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>)
      .map(([key, value]) => {
        const text = flattenProblemErrors(value);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}
