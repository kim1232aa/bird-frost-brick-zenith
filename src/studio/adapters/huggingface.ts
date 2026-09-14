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

/**
 * HF Inference Router 只接受 "宽x高" 像素尺寸（例如 1344x768），
 * 直接透传 "2K"/"16:9" 会被上游 400 拒绝。把档位/比例换算成像素。
 */
const HF_ASPECT_BASE: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 864],
  "3:4": [864, 1152],
  "3:2": [1216, 832],
  "2:3": [832, 1216],
  "21:9": [1536, 640],
};
const HF_TIER_LONG_SIDE: Record<string, number> = { "1k": 1024, "2k": 2048, "3k": 2560, "4k": 4096 };

function roundTo8(value: number) {
  return Math.max(8, Math.round(value / 8) * 8);
}

export function huggingfaceImageSize(size?: string, aspectRatio?: string): string | undefined {
  const raw = String(size || "").trim();
  if (/^\d{2,5}x\d{2,5}$/i.test(raw)) return raw;
  const tier = HF_TIER_LONG_SIDE[raw.toLowerCase()];
  const ratioText = String(aspectRatio || "").trim();
  const ratioMatch = /^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/.exec(ratioText);
  const base = HF_ASPECT_BASE[ratioText];
  if (tier) {
    if (base) {
      const longSide = Math.max(base[0], base[1]);
      const scale = tier / longSide;
      return `${roundTo8(base[0] * scale)}x${roundTo8(base[1] * scale)}`;
    }
    if (ratioMatch) {
      const w = Number(ratioMatch[1]);
      const h = Number(ratioMatch[2]);
      if (w > 0 && h > 0) {
        const scale = tier / Math.max(w, h);
        return `${roundTo8(w * scale)}x${roundTo8(h * scale)}`;
      }
    }
    return `${tier}x${tier}`;
  }
  if (base) return `${base[0]}x${base[1]}`;
  if (ratioMatch) {
    const w = Number(ratioMatch[1]);
    const h = Number(ratioMatch[2]);
    if (w > 0 && h > 0) {
      const scale = 1024 / Math.max(w, h);
      return `${roundTo8(w * scale)}x${roundTo8(h * scale)}`;
    }
  }
  return undefined;
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
          // baseUrlHint lets the relay honor the per-provider failover bases
          // (nscale → together → fal-ai → wavespeed); all stay on the
          // router.huggingface.co origin, which the server enforces.
          provider: { ...ctx.provider, baseUrlHint: true },
          baseUrl,
          path: "/images/generations",
          body: {
            model: input.model,
            prompt: input.prompt,
            n: input.n || 1,
            response_format: "b64_json",
            ...(huggingfaceImageSize(input.size, input.aspectRatio) ? { size: huggingfaceImageSize(input.size, input.aspectRatio) } : {}),
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
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Hugging Face Token" };
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
