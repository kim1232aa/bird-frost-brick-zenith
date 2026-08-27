import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";

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
  "ideogram-4": "fal-ai/ideogram/v4",
};

const FAL_I2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev/image-to-image",
  "flux/dev": "fal-ai/flux/dev/image-to-image",
  "fal-ai/flux/dev": "fal-ai/flux/dev/image-to-image",
  "flux-2-pro": "fal-ai/flux-2-pro/edit",
  "nano-banana": "fal-ai/nano-banana/edit",
  "nano-banana-pro": "fal-ai/nano-banana-pro/edit",
};

const FAL_T2V: Record<string, string> = {
  "kling-3-pro": "fal-ai/kling-video/v3/pro/text-to-video",
  "kling-3-turbo": "fal-ai/kling-video/v3/turbo/pro/text-to-video",
  "hailuo-2.3": "fal-ai/minimax/hailuo-2.3/pro/text-to-video",
  "veo-3.1": "fal-ai/veo3.1",
  "wan-pro": "fal-ai/wan-pro/text-to-video",
  "minimax-h3": "fal-ai/minimax/h3-max/text-to-video",
};

const FAL_I2V: Record<string, string> = {
  "kling-3-pro": "fal-ai/kling-video/v3/pro/image-to-video",
  "kling-3-turbo": "fal-ai/kling-video/v3/turbo/pro/image-to-video",
  "hailuo-2.3": "fal-ai/minimax/hailuo-2.3/pro/image-to-video",
  "veo-3.1": "fal-ai/veo3.1/image-to-video",
  "wan-pro": "fal-ai/wan-pro/image-to-video",
  "minimax-h3": "fal-ai/minimax/h3-max/image-to-video",
};

function falPath(model: string, hasRefs: boolean) {
  const trimmed = model.replace(/^\//, "");
  if (hasRefs) {
    if (FAL_I2I[trimmed] || FAL_I2I[model]) return `/${FAL_I2I[trimmed] || FAL_I2I[model]}`;
    if (/image-to-image|\/edit(?:\/|$)/i.test(trimmed)) return `/${trimmed}`;
    throw new Error(`Fal 模型 ${model} 是文生图，不能发参考图。请换 flux-2-pro 或 nano-banana。`);
  }
  return `/${FAL_T2I[model] || FAL_T2I[trimmed] || trimmed}`;
}

function falVideoPath(model: string, hasImage: boolean) {
  const trimmed = model.replace(/^\//, "");
  const table = hasImage ? FAL_I2V : FAL_T2V;
  const mapped = table[trimmed] || table[model];
  if (mapped) return mapped;
  if (trimmed.includes("/")) return trimmed;
  throw new Error(`Fal 还没有这个视频模型的路径：${model}`);
}

function falVideoUrl(data: Record<string, unknown>) {
  const video = data.video && typeof data.video === "object" ? (data.video as Record<string, unknown>) : undefined;
  return String(video?.url || data.video_url || data.url || "").trim();
}

export const falAdapter: StudioAdapter = {
  id: "fal",
  label: "Fal.ai",
  docs: "https://fal.ai/models",
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
  async createVideo(ctx, input) {
    const hasImage = Boolean(input.imageUrl || input.imageUrls?.[0]);
    const path = falVideoPath(input.model, hasImage);
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: { ...ctx.provider, baseUrl: "https://queue.fal.run" },
      path: `/${path}`,
      authScheme: "Key",
      body: {
        prompt: input.prompt,
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        ...(input.lastFrameUrl ? { tail_image_url: input.lastFrameUrl, last_frame_url: input.lastFrameUrl } : {}),
        ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.generateAudio === false ? { generate_audio: false } : {}),
      },
      timeoutMs: 60_000,
    });
    const url = falVideoUrl(data);
    const requestId = String(data.request_id || data.id || "").trim();
    if (url) return { id: `done:${url}` };
    if (!requestId) throw new Error(`Fal 视频没有返回任务 id：${JSON.stringify(data).slice(0, 180)}`);
    return { id: `${path}|${requestId}` };
  },
  async pollVideo(ctx, taskId) {
    if (taskId.startsWith("done:")) return { status: "completed", url: taskId.slice(5) };
    const [path, requestId] = taskId.split("|");
    if (!path || !requestId) return { status: "failed", error: "Fal 视频任务编号无效" };
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: { ...ctx.provider, baseUrl: "https://queue.fal.run" },
      path: `/${path}/requests/${encodeURIComponent(requestId)}`,
      method: "GET",
      authScheme: "Key",
      timeoutMs: 30_000,
    });
    const url = falVideoUrl(data);
    const status = String(data.status || "").toUpperCase();
    if (url || status === "COMPLETED") {
      if (url) return { status: "completed", url };
      const result = await studioProxyJson<Record<string, unknown>>({
        provider: { ...ctx.provider, baseUrl: "https://queue.fal.run" },
        path: `/${path}/requests/${encodeURIComponent(requestId)}`,
        method: "GET",
        authScheme: "Key",
        timeoutMs: 30_000,
      });
      const resultUrl = falVideoUrl(result);
      return resultUrl ? { status: "completed", url: resultUrl } : { status: "pending" };
    }
    if (["FAILED", "CANCELLED", "ERROR"].includes(status)) {
      return { status: "failed", error: String(data.error || data.message || status) };
    }
    return { status: "pending" };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Fal Key" };
    return { ok: true, message: "已保存 Fal Key。生成时走 fal.run，Authorization: Key。" };
  },
};
