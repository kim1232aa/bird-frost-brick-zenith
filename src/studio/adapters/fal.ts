import type { StudioAdapter } from "./types";
import { studioProxyJson } from "@/studio/generate/proxy";

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
    const data = await studioProxyJson<{ images?: Array<{ url?: string }>; image?: { url?: string } }>({
      provider: ctx.provider,
      path,
      authScheme: "Key",
      body: {
        prompt: input.prompt,
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        enable_safety_checker: false,
      },
      timeoutMs: 120_000,
    });
    const url = data.images?.[0]?.url || data.image?.url || "";
    if (!url) throw new Error("Fal 没有返回图片");
    return { url };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Fal Key" };
    return { ok: true, message: "已保存 Fal Key。生成时走 fal.run，Authorization: Key。" };
  },
};
