import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

const FAL_IMAGE_MODELS: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  "flux-pro": "fal-ai/flux-pro",
};

export const falAdapter: StudioAdapter = {
  id: "fal",
  label: "Fal.ai",
  docs: "https://fal.ai/models",
  async generateImage(ctx, input) {
    const path = `/${FAL_IMAGE_MODELS[input.model] || input.model}`;
    const refs = imageRefs(input);
    const data = await studioProxyJson<{ images?: Array<{ url?: string }>; image?: { url?: string } }>({
      provider: ctx.provider,
      path,
      authScheme: "Key",
      body: {
        prompt: input.prompt,
        num_images: input.n || 1,
        ...(refs[0] ? { image_url: refs[0] } : {}),
        ...(refs.length > 1 ? { image_urls: refs } : {}),
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
