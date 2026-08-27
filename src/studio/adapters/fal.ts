import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";

const FAL_T2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  "flux-pro": "fal-ai/flux-pro",
};

const FAL_I2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev/image-to-image",
  "flux/dev": "fal-ai/flux/dev/image-to-image",
  "fal-ai/flux/dev": "fal-ai/flux/dev/image-to-image",
};

function falPath(model: string, hasRefs: boolean) {
  const trimmed = model.replace(/^\//, "");
  if (hasRefs) {
    if (FAL_I2I[trimmed] || FAL_I2I[model]) return `/${FAL_I2I[trimmed] || FAL_I2I[model]}`;
    if (/image-to-image|\/edit(?:\/|$)/i.test(trimmed)) return `/${trimmed}`;
    throw new Error(`Fal 模型 ${model} 是文生图，不能发 image_url。请换 flux/dev/image-to-image 或 flux-2/edit。`);
  }
  return `/${FAL_T2I[model] || trimmed}`;
}

export const falAdapter: StudioAdapter = {
  id: "fal",
  label: "Fal.ai",
  docs: "https://fal.ai/models/fal-ai/flux/dev/image-to-image",
  async generateImage(ctx, input) {
    const refs = collectImageRefs(input);
    const path = falPath(input.model, refs.length > 0);
    const data = await studioProxyJson<{ images?: Array<{ url?: string }>; image?: { url?: string } }>({
      provider: ctx.provider,
      path,
      authScheme: "Key",
      body: {
        prompt: input.prompt,
        num_images: input.n || 1,
        ...(refs[0] ? { image_url: refs[0] } : {}),
        ...(typeof input.strength === "number" ? { strength: input.strength } : {}),
        enable_safety_checker: false,
      },
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    const url = urls[0] || data.images?.[0]?.url || data.image?.url || "";
    if (!url) throw new Error("Fal 没有返回图片");
    return { url, urls: urls.length ? urls : [url] };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Fal Key" };
    return { ok: true, message: "已保存 Fal Key。生成时走 fal.run，Authorization: Key。" };
  },
};
