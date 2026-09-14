import type { ImageGenInput, StudioAdapter } from "./types.ts";
import { collectImageRefs } from "../image-refs.ts";
import { huggingfaceImageSize } from "./huggingface.ts";

/** Official fal.run endpoint ids for wiring short names. */
const FAL_T2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  "flux-pro": "fal-ai/flux-pro",
  "flux-2-pro": "fal-ai/flux-2-pro",
  "flux-2-flex": "fal-ai/flux-2-flex",
  "flux-2-flash": "fal-ai/flux-2/flash",
  "nano-banana": "fal-ai/nano-banana",
  "nano-banana-pro": "fal-ai/nano-banana-pro",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/text-to-image",
};

const FAL_I2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev/image-to-image",
  "flux/dev": "fal-ai/flux/dev/image-to-image",
  "fal-ai/flux/dev": "fal-ai/flux/dev/image-to-image",
  "fal-ai/flux-2-pro": "fal-ai/flux-2-pro/edit",
  "flux-2-pro": "fal-ai/flux-2-pro/edit",
  "fal-ai/flux-2-flex": "fal-ai/flux-2-flex/edit",
  "flux-2-flex": "fal-ai/flux-2-flex/edit",
  "fal-ai/flux-2/flash": "fal-ai/flux-2/flash/edit",
  "flux-2-flash": "fal-ai/flux-2/flash/edit",
  "nano-banana": "fal-ai/nano-banana/edit",
  "nano-banana-pro": "fal-ai/nano-banana-pro/edit",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/edit",
  "fal-ai/bytedance/seedream/v4.5/text-to-image": "fal-ai/bytedance/seedream/v4.5/edit",
};

function trimFalModel(model: string) {
  return model.replace(/^\//, "").trim();
}

function isQualifiedFalEndpoint(id: string) {
  return id.startsWith("fal-ai/");
}

function isFalEditEndpoint(id: string) {
  return /(?:^|\/)edit(?:\/|$)/i.test(id) || /image-to-image/i.test(id);
}

function qualifyFalEndpoint(model: string) {
  const trimmed = trimFalModel(model);
  if (!trimmed) throw new Error("Fal 缺少模型 / endpoint id");
  if (isQualifiedFalEndpoint(trimmed)) return trimmed;
  if (FAL_T2I[trimmed]) return FAL_T2I[trimmed];
  throw new Error(`Fal 模型 ${model} 未映射到官方 endpoint id（fal-ai/...），拒绝发送裸路径。`);
}

export function falEndpointPath(model: string, hasRefs: boolean) {
  const trimmed = trimFalModel(model);
  if (hasRefs) {
    if (FAL_I2I[trimmed] || FAL_I2I[model]) return `/${FAL_I2I[trimmed] || FAL_I2I[model]}`;
    const qualified = isQualifiedFalEndpoint(trimmed) ? trimmed : FAL_T2I[trimmed];
    if (qualified && isFalEditEndpoint(qualified)) return `/${qualified}`;
    if (isQualifiedFalEndpoint(trimmed) && isFalEditEndpoint(trimmed)) return `/${trimmed}`;
    throw new Error(`Fal 模型 ${model} 是文生图，不能发 image_url。请换 flux/dev/image-to-image 或 flux-2/edit。`);
  }
  return `/${qualifyFalEndpoint(model)}`;
}

/**
 * fal 各模型支持的采样参数不一样，乱发会被 422 拒：
 * - flux-1 dev/schnell/pro：image_size（枚举或 {width,height}）、seed、num_inference_steps、guidance_scale（schnell 无）
 * - flux-2 pro/flex/flash：image_size、seed（无 steps/guidance）
 * - nano-banana(-pro)：aspect_ratio（字符串），pro 另有 resolution 档位
 * - seedream v4.5：image_size、seed
 */
type FalParamProfile = {
  kind: "flux1" | "flux2" | "banana" | "seedream" | "generic";
  guidance?: boolean;
  steps?: boolean;
};

function falParamProfile(endpoint: string): FalParamProfile {
  if (/nano-banana/i.test(endpoint)) return { kind: "banana" };
  if (/flux-2/i.test(endpoint)) return { kind: "flux2" };
  if (/flux\/schnell/i.test(endpoint)) return { kind: "flux1", steps: true };
  if (/flux/i.test(endpoint)) return { kind: "flux1", steps: true, guidance: true };
  if (/seedream/i.test(endpoint)) return { kind: "seedream" };
  return { kind: "generic" };
}

function falImageSizePixels(size?: string, aspectRatio?: string): { width: number; height: number } | undefined {
  const mapped = huggingfaceImageSize(size, aspectRatio);
  if (!mapped) return undefined;
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(mapped);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

const FAL_BANANA_RESOLUTION_TIERS = new Set(["1k", "2k", "4k"]);

export function planFalImageRequest(
  input: Pick<
    ImageGenInput,
    "model" | "prompt" | "n" | "imageUrl" | "imageUrls" | "strength" | "size" | "aspectRatio" | "seed" | "steps" | "guidance"
  >,
) {
  const refs = collectImageRefs(input);
  const path = falEndpointPath(input.model, refs.length > 0);
  const endpoint = path.replace(/^\//, "");
  const profile = falParamProfile(endpoint);
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    num_images: input.n || 1,
    enable_safety_checker: false,
  };
  // 尺寸：banana 系吃 aspect_ratio / resolution 档位，其余吃 image_size {width,height}
  if (profile.kind === "banana") {
    const aspect = String(input.aspectRatio || "").trim();
    if (aspect) body.aspect_ratio = aspect;
    const tier = String(input.size || "").trim().toLowerCase();
    if (/nano-banana-pro/i.test(endpoint) && FAL_BANANA_RESOLUTION_TIERS.has(tier)) {
      body.resolution = tier.toUpperCase();
    }
  } else {
    const pixels = falImageSizePixels(input.size, input.aspectRatio);
    if (pixels) body.image_size = pixels;
  }
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) body.seed = input.seed;
  if (profile.steps && typeof input.steps === "number" && Number.isFinite(input.steps)) {
    body.num_inference_steps = input.steps;
  }
  if (profile.guidance && typeof input.guidance === "number" && Number.isFinite(input.guidance)) {
    body.guidance_scale = input.guidance;
  }
  if (refs.length) {
    if (/(?:^|\/)edit(?:\/|$)/i.test(endpoint)) {
      body.image_urls = refs;
    } else {
      if (refs.length > 1) {
        throw new Error(`Fal 端点 ${endpoint} 只接受 1 张 image_url，当前 ${refs.length} 张参考图。`);
      }
      body.image_url = refs[0];
      if (typeof input.strength === "number") body.strength = input.strength;
    }
  } else if (typeof input.strength === "number") {
    body.strength = input.strength;
  }
  return { path, authScheme: "Key" as const, body };
}

export const falAdapter: StudioAdapter = {
  id: "fal",
  label: "Fal.ai",
  docs: "https://fal.ai/models/fal-ai/flux/dev/image-to-image",
  async generateImage(ctx, input) {
    const { allImageUrls, studioProxyJson } = await import("@/studio/generate/proxy");
    const planned = planFalImageRequest(input);
    const data = await studioProxyJson<{ images?: Array<{ url?: string }>; image?: { url?: string } }>({
      provider: ctx.provider,
      path: planned.path,
      authScheme: planned.authScheme,
      body: planned.body,
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    const url = urls[0] || data.images?.[0]?.url || data.image?.url || "";
    if (!url) throw new Error("Fal 没有返回图片");
    return { url, urls: urls.length ? urls : [url] };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Fal Key" };
    return { ok: true, message: "已保存 Fal Key。生成时走 fal.run，Authorization: Key。" };
  },
};
