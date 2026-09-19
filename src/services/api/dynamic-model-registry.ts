import localforage from "localforage";

export type ModelCategory = "image" | "video" | "audio" | "text";
export type ModelParamType = "number" | "integer" | "string" | "boolean" | "select" | "image_slot" | "lora_slot";

export interface ModelParamSchema {
  key: string;
  label: string;
  type: ModelParamType;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
  group: "basic" | "advanced";
  condition?: { field: string; eq: unknown };
  description?: string;
}

export interface DynamicModelMeta {
  id: string;
  name: string;
  provider: string;
  category: ModelCategory;
  subType?: "t2i" | "i2i" | "t2v" | "i2v" | "r2v";
  supportsLora: boolean;
  /** Only provider-published schemas are persisted; heuristics are opt-in UI helpers. */
  paramSchemas: ModelParamSchema[];
}

export interface CachedModelRegistry {
  providerId: string;
  timestamp: number;
  models: DynamicModelMeta[];
}

export interface DynamicModelCache {
  getItem<T>(key: string): Promise<T | null> | T | null;
  setItem<T>(key: string, value: T): Promise<unknown> | unknown;
}

export interface DynamicModelFetchOptions {
  /** The caller owns the authenticated/proxied request. No endpoint is guessed here. */
  request?: () => Promise<unknown>;
  /** Alias kept for callers that already call their transport a fetcher. */
  fetcher?: () => Promise<unknown>;
  cache?: DynamicModelCache;
  forceRefresh?: boolean;
  staleWhileRevalidate?: boolean;
  ttlMs?: number;
  now?: () => number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const modelRegistryStore = localforage.createInstance({
  name: "boundless_studio",
  storeName: "dynamic_models",
}) as unknown as DynamicModelCache;
const refreshes = new Map<string, Promise<CachedModelRegistry>>();

export function isCacheExpired(timestamp: number, ttl: number = CACHE_TTL_MS): boolean {
  return !Number.isFinite(timestamp) || Date.now() - timestamp >= Math.max(0, ttl);
}

export function isDynamicParamVisible(param: ModelParamSchema, values: Record<string, unknown>): boolean {
  if (!param.condition) return true;
  return Object.is(values[param.condition.field], param.condition.eq);
}

export function normalizeDynamicParamValue(param: ModelParamSchema, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  if (param.key === "seed") {
    if (value === -1 || value === "-1") return -1;
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (param.type === "number" || param.type === "integer") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    const integral = param.type === "integer" ? Math.round(numeric) : numeric;
    return clamp(integral, param.min, param.max);
  }
  if (param.type === "boolean") return Boolean(value);
  if (param.type === "select") {
    const option = param.options?.find((candidate) => Object.is(candidate.value, value) || String(candidate.value) === String(value));
    return option?.value;
  }
  return typeof value === "string" ? value.trim() : value;
}

/**
 * 启发式模型分类器：根据模型 ID 与 Pipeline Tag 判定媒体类型
 */
export function classifyModelCategory(modelId: string, pipelineTag?: string): ModelCategory {
  const lower = modelId.toLowerCase();
  const tag = (pipelineTag || "").toLowerCase();

  if (tag.includes("video") || lower.includes("wan2") || lower.includes("kling") || lower.includes("i2v") || lower.includes("t2v") || lower.includes("r2v") || lower.includes("video") || lower.includes("minimax-video")) {
    return "video";
  }
  if (tag.includes("image") || lower.includes("flux") || lower.includes("sdxl") || lower.includes("sd1.5") || lower.includes("krea") || lower.includes("wanx") || lower.includes("qwen-image") || lower.includes("checkpoint") || lower.includes("imagine-image") || lower.includes("lora")) {
    return "image";
  }
  if (tag.includes("audio") || tag.includes("speech") || lower.includes("cosyvoice") || lower.includes("tts") || lower.includes("audio") || lower.includes("music")) {
    return "audio";
  }
  return "text";
}

/**
 * 根据模型特征生成对应的动态参数 Schema (Form-as-Data)
 */
export function generateDefaultParamSchema(modelId: string, category: ModelCategory): ModelParamSchema[] {
  const lower = modelId.toLowerCase();
  const schemas: ModelParamSchema[] = [];

  // 通用种子控件（全平台支持 -1 随机种子，并回显真实 Seed）
  schemas.push({
    key: "seed",
    label: "随机种子 (Seed)",
    type: "integer",
    default: -1,
    description: "-1 代表每次随机生成；输入固定数值以复现效果",
    group: "basic",
  });

  if (category === "image") {
    // 针对 Krea2 / ComfyUI 模型的动态参数
    if (lower.includes("krea") || lower.includes("comfy")) {
      schemas.push(
        {
          key: "cfgScale",
          label: "CFG 引导系数",
          type: "number",
          default: 1,
          min: 1,
          max: 20,
          step: 0.5,
          group: "basic",
        },
        {
          key: "steps",
          label: "迭代步数 (Steps)",
          type: "integer",
          default: 8,
          min: 1,
          max: 100,
          step: 1,
          group: "basic",
        },
        {
          key: "sampler",
          label: "采样算法 (Sampler)",
          type: "select",
          default: "Euler",
          options: [
            { label: "Euler", value: "Euler" },
            { label: "Euler a", value: "Euler a" },
            { label: "DPM++ 2M", value: "DPM++ 2M" },
            { label: "DPM++ 2M SDE", value: "DPM++ 2M SDE" },
            { label: "DDIM", value: "DDIM" },
          ],
          group: "advanced",
        },
        {
          key: "scheduler",
          label: "调度器 (Scheduler)",
          type: "select",
          default: "sgm_uniform",
          options: [
            { label: "sgm_uniform", value: "sgm_uniform" },
            { label: "normal", value: "normal" },
            { label: "karras", value: "karras" },
            { label: "exponential", value: "exponential" },
          ],
          group: "advanced",
        },
        {
          key: "denoise",
          label: "去噪幅度 (Denoise)",
          type: "number",
          default: 1,
          min: 0,
          max: 1,
          step: 0.05,
          group: "advanced",
        },
        {
          key: "engine",
          label: "推理引擎",
          type: "string",
          default: "ComfyUI",
          group: "advanced",
        },
        {
          key: "width",
          label: "图片宽度",
          type: "integer",
          default: 960,
          min: 256,
          max: 2048,
          step: 64,
          group: "basic",
        },
        {
          key: "height",
          label: "图片高度",
          type: "integer",
          default: 1440,
          min: 256,
          max: 2048,
          step: 64,
          group: "basic",
        },
        {
          key: "comfy",
          label: "ComfyUI 节点链路",
          type: "string",
          default: "11 Nodes",
          group: "advanced",
        },
        {
          key: "num_reference_images",
          label: "参考图槽位数量 (N张参考图)",
          type: "integer",
          default: 4,
          min: 1,
          max: 10,
          step: 1,
          group: "basic",
        },
        {
          key: "reference_images",
          label: "参考素材图 (多图参考支持)",
          type: "image_slot",
          group: "basic",
        }
      );
    } else if (lower.includes("flux")) {
      // Flux 专属参数
      if (!lower.includes("schnell")) {
        schemas.push({
          key: "guidance_scale",
          label: "Guidance 引导度",
          type: "number",
          default: 3.5,
          min: 1.5,
          max: 5.0,
          step: 0.1,
          group: "basic",
        });
      }
      schemas.push({
        key: "steps",
        label: "迭代步数",
        type: "integer",
        default: lower.includes("schnell") ? 4 : 28,
        min: 1,
        max: 50,
        group: "basic",
      });
    } else if (lower.includes("grok")) {
      // Grok Imagine 专属参数
      schemas.push(
        {
          key: "quality",
          label: "画面质量 (Quality)",
          type: "select",
          default: "quality",
          options: [
            { label: "标准质量 (Standard)", value: "standard" },
            { label: "高质量 (High)", value: "high" },
            { label: "极清旗舰 (Quality)", value: "quality" },
          ],
          group: "basic",
        },
        {
          key: "aspect_ratio",
          label: "宽高比 (Aspect Ratio)",
          type: "select",
          default: "16:9",
          options: [
            { label: "16:9 横屏", value: "16:9" },
            { label: "9:16 竖屏", value: "9:16" },
            { label: "1:1 方形", value: "1:1" },
            { label: "4:3 传统", value: "4:3" },
            { label: "3:4 肖像", value: "3:4" },
          ],
          group: "basic",
        },
        {
          key: "reference_images",
          label: "Grok 多图参考素材 (支持多张)",
          type: "image_slot",
          group: "basic",
        }
      );
    } else if (lower.includes("seedream") || lower.includes("seedance") || lower.includes("ark-") || lower.includes("volcengine")) {
      // 火山方舟 / Seedream / Seedance 专属参数
      schemas.push(
        {
          key: "scale",
          label: "引导强度 (Guidance Scale)",
          type: "number",
          default: 7.5,
          min: 1.0,
          max: 20.0,
          step: 0.5,
          group: "basic",
        },
        {
          key: "steps",
          label: "迭代步数",
          type: "integer",
          default: 25,
          min: 10,
          max: 50,
          group: "basic",
        },
        {
          key: "width",
          label: "输出宽度",
          type: "integer",
          default: 1024,
          min: 512,
          max: 2048,
          step: 64,
          group: "basic",
        },
        {
          key: "height",
          label: "输出高度",
          type: "integer",
          default: 1024,
          min: 512,
          max: 2048,
          step: 64,
          group: "basic",
        },
        {
          key: "reference_images",
          label: "火山多图参考槽位 (支持多张)",
          type: "image_slot",
          group: "basic",
        }
      );
    } else {
      // SD / SDXL / Civitai / 通用图像模型
      schemas.push(
        {
          key: "steps",
          label: "迭代步数 (Steps)",
          type: "integer",
          default: 25,
          min: 10,
          max: 60,
          group: "basic",
        },
        {
          key: "cfgScale",
          label: "提示词相关度 (CFG Scale)",
          type: "number",
          default: 7.0,
          min: 1.0,
          max: 20.0,
          step: 0.5,
          group: "basic",
        },
        {
          key: "sampler",
          label: "采样算法 (Sampler)",
          type: "select",
          default: "DPM++ 2M Karras",
          options: [
            { label: "DPM++ 2M Karras", value: "DPM++ 2M Karras" },
            { label: "Euler a", value: "Euler a" },
            { label: "Euler", value: "Euler" },
            { label: "DDIM", value: "DDIM" },
          ],
          group: "advanced",
        },
        {
          key: "clip_skip",
          label: "CLIP Skip",
          type: "integer",
          default: 2,
          min: 1,
          max: 4,
          group: "advanced",
        },
        {
          key: "lora_slot",
          label: "LoRA 模型与权重",
          type: "lora_slot",
          group: "advanced",
        }
      );
    }
  } else if (category === "video") {
    // 视频参数（时长、比例等）
    schemas.push(
      {
        key: "duration",
        label: "视频时长 (秒)",
        type: "integer",
        default: 5,
        min: 1,
        max: 15,
        step: 1,
        group: "basic",
      },
      {
        key: "aspectRatio",
        label: "画面画幅",
        type: "select",
        default: "16:9",
        options: [
          { label: "16:9 (横屏)", value: "16:9" },
          { label: "9:16 (竖屏)", value: "9:16" },
          { label: "1:1 (方形)", value: "1:1" },
        ],
        group: "basic",
      }
    );
  }

  return schemas;
}

export function normalizeDynamicModels(providerId: string, value: unknown): DynamicModelMeta[] {
  const normalizedProvider = String(providerId || "").trim();
  if (!normalizedProvider) return [];
  const models = extractModelRecords(value);
  const seen = new Set<string>();
  const result: DynamicModelMeta[] = [];
  for (const raw of models) {
    const record = typeof raw === "string" ? { id: raw } : raw;
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const item = record as Record<string, unknown>;
    const id = firstString(item.id, item.model, item.modelId, item.name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const pipelineTag = Array.isArray(item.pipeline_tags)
      ? item.pipeline_tags.map((tag) => String(tag || "")).join(" ")
      : firstString(item.pipeline_tag, item.task, item.type);
    const explicitCategory = item.category;
    const category = isModelCategory(explicitCategory)
      ? explicitCategory
      : classifyModelCategory(id, pipelineTag);
    const tags = stringArray(item.tags);
    const supportsLora = typeof item.supportsLora === "boolean"
      ? item.supportsLora
      : tags.some((tag) => /lora/i.test(tag)) || /(?:^|[\\/_-])lora(?:$|[\\/_-])/i.test(id);
    const schemas = normalizeParamSchemas(item.paramSchemas || item.parameterSchema || item.parameters);
    result.push({
      id,
      name: firstString(item.name, item.displayName) || id,
      provider: firstString(item.provider, item.providerId) || normalizedProvider,
      category,
      ...(inferSubType(id, pipelineTag) ? { subType: inferSubType(id, pipelineTag) } : {}),
      supportsLora,
      paramSchemas: schemas,
    });
  }
  return result;
}

/** Alias for callers that prefer response-oriented naming. */
export const normalizeDynamicModelResponse = normalizeDynamicModels;

export async function getCachedProviderModels(
  providerId: string,
  options: { cache?: DynamicModelCache } = {},
): Promise<CachedModelRegistry | null> {
  const normalizedProvider = String(providerId || "").trim();
  if (!normalizedProvider) return null;
  try {
    const cached = await (options.cache || modelRegistryStore).getItem<CachedModelRegistry>(cacheKey(normalizedProvider));
    if (!cached || cached.providerId !== normalizedProvider || !Array.isArray(cached.models)) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function saveCachedProviderModels(
  providerId: string,
  models: DynamicModelMeta[],
  options: { cache?: DynamicModelCache; timestamp?: number } = {},
): Promise<CachedModelRegistry> {
  const normalizedProvider = String(providerId || "").trim();
  if (!normalizedProvider) throw new Error("动态模型缓存缺少 providerId");
  const registry: CachedModelRegistry = {
    providerId: normalizedProvider,
    timestamp: options.timestamp ?? Date.now(),
    models: [...models],
  };
  try {
    await (options.cache || modelRegistryStore).setItem(cacheKey(normalizedProvider), registry);
  } catch (err) {
    console.warn("Failed to persist models to IndexedDB cache:", err);
  }
  return registry;
}

/**
 * Fetch a provider-owned model envelope through a caller-supplied transport.
 * Authentication, proxying, and endpoint selection stay outside this module.
 * Fresh data is returned immediately; expired data uses SWR by default.
 */
export async function fetchDynamicModelsForProvider(
  providerId: string,
  options: DynamicModelFetchOptions = {},
): Promise<CachedModelRegistry> {
  const normalizedProvider = String(providerId || "").trim();
  if (!normalizedProvider) throw new Error("动态模型拉取缺少 providerId");
  const now = options.now || Date.now;
  const ttlMs = Math.max(0, options.ttlMs ?? CACHE_TTL_MS);
  const cache = options.cache || modelRegistryStore;
  const cached = await getCachedProviderModels(normalizedProvider, { cache });
  const request = options.request || options.fetcher;
  if (!options.forceRefresh && cached && !isExpiredAt(cached.timestamp, ttlMs, now())) return cached;
  if (!request) {
    if (cached) return cached;
    throw new Error(`Provider ${normalizedProvider} 没有可用的模型列表请求器`);
  }
  if (!options.forceRefresh && cached && options.staleWhileRevalidate !== false) {
    const key = cacheKey(normalizedProvider);
    if (!refreshes.has(key)) {
      const refresh = refreshDynamicModels(normalizedProvider, request, cache, now)
        .catch((error) => {
          console.warn(`Failed to refresh dynamic models for ${normalizedProvider}:`, error);
          return cached;
        })
        .finally(() => refreshes.delete(key));
      refreshes.set(key, refresh);
    }
    return cached;
  }
  return refreshDynamicModels(normalizedProvider, request, cache, now);
}

async function refreshDynamicModels(
  providerId: string,
  request: () => Promise<unknown>,
  cache: DynamicModelCache,
  now: () => number,
) {
  const raw = await request();
  return saveCachedProviderModels(providerId, normalizeDynamicModels(providerId, raw), { cache, timestamp: now() });
}

function extractModelRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["data", "models", "output", "items", "results"]) {
    if (record[key] !== undefined) return extractModelRecords(record[key]);
  }
  if (firstString(record.id, record.model, record.modelId, record.name)) return [record];
  return Object.entries(record).map(([id, item]) =>
    item && typeof item === "object" && !Array.isArray(item) ? { ...(item as Record<string, unknown>), id: firstString((item as Record<string, unknown>).id, id) } : id,
  );
}

function normalizeParamSchemas(value: unknown): ModelParamSchema[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const record = raw as Record<string, unknown>;
    const key = firstString(record.key, record.name);
    const type = record.type;
    const group = record.group === "advanced" ? "advanced" : record.group === "basic" ? "basic" : undefined;
    if (!key || !isModelParamType(type) || !group) return [];
    const options = Array.isArray(record.options)
      ? record.options.flatMap((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) return [];
        const item = option as Record<string, unknown>;
        const value = item.value;
        const label = firstString(item.label, value);
        return label && (typeof value === "string" || typeof value === "number") ? [{ label, value }] : [];
      })
      : undefined;
    return [{
      key,
      label: firstString(record.label, key) || key,
      type,
      group,
      ...(typeof record.default !== "undefined" ? { default: record.default } : {}),
      ...(finiteNumber(record.min) !== undefined ? { min: finiteNumber(record.min) } : {}),
      ...(finiteNumber(record.max) !== undefined ? { max: finiteNumber(record.max) } : {}),
      ...(finiteNumber(record.step) !== undefined ? { step: finiteNumber(record.step) } : {}),
      ...(options?.length ? { options } : {}),
      ...(record.condition && typeof record.condition === "object" && !Array.isArray(record.condition) ? { condition: record.condition as { field: string; eq: unknown } } : {}),
      ...(firstString(record.description) ? { description: firstString(record.description) } : {}),
    } satisfies ModelParamSchema];
  });
}

function inferSubType(modelId: string, pipelineTag: string) {
  const value = `${modelId} ${pipelineTag}`.toLowerCase();
  if (value.includes("r2v")) return "r2v" as const;
  if (value.includes("i2v") || value.includes("image-to-video")) return "i2v" as const;
  if (value.includes("t2v") || value.includes("text-to-video")) return "t2v" as const;
  if (value.includes("i2i") || value.includes("image-to-image")) return "i2i" as const;
  if (value.includes("t2i") || value.includes("text-to-image")) return "t2i" as const;
  return undefined;
}

function cacheKey(providerId: string) {
  return `provider_${providerId}`;
}

function isExpiredAt(timestamp: number, ttl: number, now: number) {
  return !Number.isFinite(timestamp) || now - timestamp >= ttl;
}

function isModelCategory(value: unknown): value is ModelCategory {
  return value === "image" || value === "video" || value === "audio" || value === "text";
}

function isModelParamType(value: unknown): value is ModelParamType {
  return value === "number" || value === "integer" || value === "string" || value === "boolean" || value === "select" || value === "image_slot" || value === "lora_slot";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function firstString(...values: unknown[]) {
  return values.map((value) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "").find(Boolean) || "";
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min?: number, max?: number) {
  return Math.min(max ?? value, Math.max(min ?? value, value));
}
