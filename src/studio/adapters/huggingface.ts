import type { StudioAdapter } from "./types";
import { firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";

function sizeOf(input: { size?: string; width?: number; height?: number }) {
  if (input.width && input.height) return { width: input.width, height: input.height };
  if (input.size && /^\d+x\d+$/i.test(input.size)) {
    const [w, h] = input.size.split("x").map(Number);
    return { width: w, height: h };
  }
  return { width: 1024, height: 1024 };
}

export const huggingfaceAdapter: StudioAdapter = {
  id: "huggingface",
  label: "Hugging Face",
  docs: "https://huggingface.co/docs/api-inference",
  async generateImage(ctx, input) {
    const dims = sizeOf(input);
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: "https://router.huggingface.co",
      path: "/v1/images/generations",
      body: {
        model: input.model,
        prompt: input.prompt,
        size: `${dims.width}x${dims.height}`,
        n: 1,
        response_format: "url",
      },
      timeoutMs: 180_000,
    });
    const url = firstImageUrl(data);
    if (url) return { url };

    const fallback = await studioProxyJson<Record<string, unknown> & { url?: string }>({
      provider: ctx.provider,
      baseUrl: "https://router.huggingface.co",
      path: `/hf-inference/models/${encodeURIComponent(input.model)}`,
      body: {
        inputs: input.prompt,
        parameters: {
          width: dims.width,
          height: dims.height,
          ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
        },
      },
      timeoutMs: 180_000,
    });
    const blobUrl = String(fallback.url || firstImageUrl(fallback) || "").trim();
    if (!blobUrl) throw new Error("Hugging Face 没有返回图片。确认模型已开通 Inference，或换 Z-Image-Turbo。");
    return { url: blobUrl };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Hugging Face Token" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        baseUrl: "https://router.huggingface.co",
        path: "/v1/models",
        method: "GET",
        timeoutMs: 20_000,
      });
      return { ok: true, message: "Hugging Face Token 可用" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/401|invalid|unauthorized/i.test(message)) return { ok: false, message };
      return { ok: true, message: `端点已打通：${message.slice(0, 160)}` };
    }
  },
};
