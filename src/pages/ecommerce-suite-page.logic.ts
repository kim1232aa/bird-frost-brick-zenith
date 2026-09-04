/** Page-only helpers for EcommerceSuitePage. Do not send unverified adapter fields. */

export type EcommerceSuiteImageParams = {
  size?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
};

export function ecommerceSuiteHd(batch: boolean) {
  return !batch;
}

function selectionParts(selection: string) {
  const key = String(selection || "");
  const provider = key.split("::")[0] || "";
  const model = key.includes("::") ? key.slice(key.indexOf("::") + 2) : key;
  return { key, provider, model };
}

const MANAGED_ADAPTERS: Record<string, string> = {
  "preset-civitai": "civitai",
  "preset-volcengine-plan": "ark-plan",
  "preset-volcengine-ark": "ark-plan",
  "preset-openai": "openai-compat",
  "preset-superxihe-image": "openai-compat",
  "preset-grok-relay": "xai-imagine",
  "preset-xai-official": "xai-imagine",
  "preset-superxihe-grok": "xai-imagine",
  "preset-agnes": "agnes",
  "preset-agnes-ai": "agnes",
  "preset-sensenova": "sensenova",
  "preset-aliyun-dashscope": "dashscope",
  "preset-modelscope": "modelscope",
  "preset-huggingface": "huggingface",
  "preset-fal": "fal",
};

function canonicalAdapter(provider: string, adapterType?: string) {
  const explicit = String(adapterType || "").trim().toLowerCase();
  const value = explicit || MANAGED_ADAPTERS[provider] || "";
  if (value === "civitai-orchestration") return "civitai";
  if (value === "ark") return "ark-plan";
  if (value === "openai" || value === "openai-official") return "openai-compat";
  if (value === "xai") return "xai-imagine";
  return value;
}

const CIVITAI_IMAGE_DIMENSION_MODELS = new Set([
  "krea2-turbo",
  "krea2-raw",
  "flux1",
  "flux2-klein",
  "flux2-pro",
  "flux2-dev",
  "z-image-turbo",
  "sdxl",
  "anima",
  "qwen-3.0-pro",
  "seedream-4.5",
  "seedream-5.0-pro",
]);

const DASHSCOPE_IMAGE_MODELS = new Set(["qwen-image-2.0-pro", "qwen-image-plus", "wan2.6-t2i", "wan2.7-image"]);

/**
 * Fields actually forwarded to generateStudioImage.
 *
 * Keep this allowlist tied to adapter bodies: Civitai image engines use
 * width/height (except Civitai Grok), while the other adapters below consume
 * size/aspectRatio. Unknown adapters get no guessed dimensions.
 */
export function ecommerceSuiteImageParams(selection: string, independentHd: boolean, adapterType?: string): EcommerceSuiteImageParams {
  const { provider, model } = selectionParts(selection);
  const adapter = canonicalAdapter(provider, adapterType);
  const normalizedModel = model.trim().toLowerCase();

  if (adapter === "civitai") {
    if (normalizedModel === "civitai-grok") return { aspectRatio: "1:1" };
    if (!CIVITAI_IMAGE_DIMENSION_MODELS.has(normalizedModel)) return {};
    const px = independentHd ? 1536 : 1024;
    return { size: `${px}x${px}`, width: px, height: px };
  }

  if (adapter === "ark-plan" && /seedream/i.test(normalizedModel)) {
    return { size: independentHd ? "3K" : "2K" };
  }

  if (adapter === "openai-compat" && /gpt-image/i.test(normalizedModel)) {
    return { size: independentHd ? "1536x1536" : "1024x1024" };
  }

  if (adapter === "xai-imagine" && normalizedModel === "grok-imagine-image-2.0") {
    return { size: independentHd ? "2k" : "1k", aspectRatio: "1:1" };
  }

  if (adapter === "agnes" && /agnes-image/i.test(normalizedModel)) {
    return { size: independentHd ? "2K" : "1K", aspectRatio: "1:1" };
  }

  if (adapter === "dashscope" && DASHSCOPE_IMAGE_MODELS.has(normalizedModel)) {
    return { size: independentHd ? "2K" : "1K", aspectRatio: "1:1" };
  }

  // ModelScope's adapter explicitly consumes size; keep this limited to the
  // two models wired in its catalog rather than applying it to arbitrary names.
  const isModelScopeImage = normalizedModel === "qwen/qwen-image" || normalizedModel === "tongyi-mai/z-image-turbo";
  if (adapter === "modelscope" && isModelScopeImage) {
    return { size: independentHd ? "2K" : "1K" };
  }

  // Fal, SenseNova, Hugging Face, and unknown/custom adapters have no
  // verified ecommerce size mapping here. Do not silently attach width/height.
  return {};
}

export function ecommerceSuiteSize(selection: string, independentHd: boolean, adapterType?: string) {
  const params = ecommerceSuiteImageParams(selection, independentHd, adapterType);
  if (params.size) return params.size;
  if (typeof params.width === "number" && typeof params.height === "number") return `${params.width}x${params.height}`;
  return "模型默认";
}

export function ecommerceMediaExt(url: string) {
  const value = String(url || "");
  if (value.startsWith("data:image/jpeg") || value.startsWith("data:image/jpg")) return "jpg";
  if (value.startsWith("data:image/webp")) return "webp";
  if (value.startsWith("data:image/png")) return "png";
  if (/\.jpe?g(\?|#|$)/i.test(value) || value.includes(".jpeg") || value.includes(".jpg")) return "jpg";
  if (/\.webp(\?|#|$)/i.test(value) || value.includes(".webp")) return "webp";
  return "png";
}

export function ecommerceDownloadName(label: string, url: string) {
  return `${label}.${ecommerceMediaExt(url)}`;
}

export function ecommerceZipEntryName(shot: { id: string; label: string }, url: string) {
  return `${shot.id}-${shot.label}.${ecommerceMediaExt(url)}`;
}

export function ecommerceNeedsProxy(url: string) {
  return !/^(data:|blob:)/i.test(String(url || ""));
}

export function ecommercePackFinishMessage(ok: number, failed: number, total: number) {
  if (failed === 0) return `${ok}/${total} 已完成`;
  if (ok === 0) return `${total}/${total} 全部失败`;
  return `${ok}/${total} 完成 · ${failed} 张失败`;
}

export function ecommercePackErrorSummary(ok: number, failed: number) {
  if (failed === 0) return "";
  if (ok === 0) return `${failed} 张全部失败`;
  return `${failed} 张未出，已完成 ${ok} 张`;
}

export function ecommerceShouldAbortPack(message: string) {
  return /请先登录|访客继续/i.test(String(message || ""));
}

export function ecommerceDisabledReason(input: {
  generating: boolean;
  progress: string;
  blockedReason: string;
  product: string;
}) {
  if (input.generating) return input.progress;
  if (input.blockedReason) return input.blockedReason;
  if (!input.product.trim()) return "请先填写产品描述";
  return "";
}

export function ecommercePrimaryLabel(input: { generating: boolean; progress: string; batch: boolean; shotCount: number }) {
  if (input.generating) return input.progress;
  return input.batch ? `生成整套 ${input.shotCount}` : `高清生成整套 ${input.shotCount}`;
}
