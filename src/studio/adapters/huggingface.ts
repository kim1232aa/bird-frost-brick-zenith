import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

const HF_ROUTER = "https://router.huggingface.co";
const HF_IMAGE_BASE = `${HF_ROUTER}/nscale/v1`;
const HF_IMAGE_PROVIDERS = ["nscale", "together", "fal-ai", "wavespeed"];

function huggingfaceImageBase(raw?: string) {
  const value = String(raw || "").trim() || HF_IMAGE_BASE;
  try {
    const url = new URL(value);
    if (!/(^|\.)huggingface\.co$/i.test(url.hostname)) return value.replace(/\/+$/, "");
    const path = url.pathname.replace(/\/+$/, "") || "";
    if (path === "" || path === "/v1") return HF_IMAGE_BASE;
    return `${url.origin}${path}`;
  } catch {
    return HF_IMAGE_BASE;
  }
}

function imageBases(raw?: string) {
  const preferred = huggingfaceImageBase(raw);
  const rest = HF_IMAGE_PROVIDERS.map((name) => `${HF_ROUTER}/${name}/v1`).filter((item) => item !== preferred);
  return [preferred, ...rest];
}

function retryable(message: string) {
  return /404|not found|not supported|no provider|does not exist|unknown model|unavailable|not available/i.test(message);
}

export const huggingfaceAdapter: StudioAdapter = {
  id: "huggingface",
  label: "Hugging Face",
  docs: "https://huggingface.co/docs/inference-providers/index",
  async generateImage(ctx, input) {
    const refs = imageRefs(input);
    if (input.operation === "edit" && !refs.length) throw new Error("FLUX.2 编辑需要至少一张参考图");
    let lastError: Error | null = null;
    for (const baseUrl of imageBases(ctx.provider.baseUrl)) {
      try {
        const data = await studioProxyJson<Record<string, unknown>>({
          provider: ctx.provider,
          baseUrl,
          path: "/images/generations",
          body: {
            model: input.model,
            prompt: input.prompt,
            n: input.n || 1,
            response_format: "b64_json",
            ...(input.size ? { size: input.size } : {}),
            ...(refs.length === 1 ? { image: refs[0] } : {}),
            ...(refs.length > 1 ? { image: refs[0], images: refs } : {}),
          },
          timeoutMs: 120_000,
        });
        const urls = allImageUrls(data);
        if (urls[0]) return { url: urls[0], urls };
        lastError = new Error("Hugging Face 没有返回图片");
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!retryable(lastError.message)) throw lastError;
      }
    }
    throw lastError || new Error("Hugging Face 没有返回图片。确认模型在 Inference Router 可用，例如 black-forest-labs/FLUX.1-schnell 或 FLUX.2-dev。");
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Hugging Face Token" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        baseUrl: huggingfaceImageBase(ctx.provider.baseUrl),
        path: "/models",
        method: "GET",
        timeoutMs: 15_000,
      });
      return { ok: true, message: "Hugging Face Router 可用" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/401|invalid|unauthorized/i.test(message)) return { ok: false, message: `Token 被拒绝：${message.slice(0, 160)}` };
      return { ok: true, message: `端点在，厂商返回：${message.slice(0, 160)}` };
    }
  },
};
