import type { StudioAdapter } from "./types";
import { allImageUrls, firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";

function dashscopeHost(baseUrl: string) {
  if (baseUrl.includes("token-plan")) return "https://dashscope.aliyuncs.com";
  if (baseUrl.includes("compatible-mode")) return "https://dashscope.aliyuncs.com";
  if (baseUrl.includes("dashscope.aliyuncs.com") && !baseUrl.includes("/api/")) return "https://dashscope.aliyuncs.com";
  if (baseUrl.includes("maas.aliyuncs.com")) return baseUrl.replace(/\/+$/, "");
  return "https://dashscope.aliyuncs.com";
}

function isQwenImage(model: string) {
  return /qwen[-_]?image/i.test(model);
}

function isQwenImage20or30(model: string) {
  return /qwen[-_]?image[-_]?[23]/i.test(model);
}

function isWanxV1(model: string) {
  return /^wanx-v1$/i.test(model.trim());
}

function isWanI2I(model: string) {
  return /wan.*i2i|wan2\.[5-9]-image|wan2\.[6-9]-image|wan2\.6-image|wan2\.7-image/i.test(model);
}

function wanMaxRefs(model: string) {
  if (/wan2\.7/i.test(model)) return 9;
  if (/wan2\.6/i.test(model)) return 4;
  if (/wan2\.5/i.test(model)) return 2;
  return 1;
}

/** Official Qwen-Image 2.0/3.0 2K presets: https://help.aliyun.com/zh/model-studio/qwen-image-api */
const QWEN20_2K: Record<string, string> = {
  "1:1": "2048*2048",
  "16:9": "2688*1536",
  "9:16": "1536*2688",
  "4:3": "2368*1728",
  "3:4": "1728*2368",
};
const QWEN20_1K: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1344*768",
  "9:16": "768*1344",
  "4:3": "1152*864",
  "3:4": "864*1152",
};
const QWEN_PLUS: Record<string, string> = {
  "1:1": "1328*1328",
  "16:9": "1664*928",
  "9:16": "928*1664",
  "4:3": "1472*1104",
  "3:4": "1104*1472",
};

function parsePixelSize(value: string) {
  const match = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(String(value || "").trim());
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

export function qwenImagePixelSize(model: string, size?: string, ratio?: string) {
  const raw = String(size || "2K").trim() || "2K";
  const aspect = String(ratio || "1:1").trim() || "1:1";
  const pixels = parsePixelSize(raw);
  if (pixels) {
    const area = pixels.width * pixels.height;
    if (area >= 512 * 512 && area <= 2048 * 2048) return `${pixels.width}*${pixels.height}`;
  }
  if (!isQwenImage20or30(model)) {
    return QWEN_PLUS[aspect] || "1328*1328";
  }
  const tier = raw.toUpperCase();
  if (tier === "1K") return QWEN20_1K[aspect] || "1024*1024";
  return QWEN20_2K[aspect] || "2048*2048";
}

async function pollTask(ctx: Parameters<NonNullable<StudioAdapter["pollVideo"]>>[0], taskId: string) {
  for (let i = 0; i < 30; i += 1) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: dashscopeHost(ctx.provider.baseUrl),
      path: `/api/v1/tasks/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
    });
    const output = (data.output || data) as Record<string, unknown>;
    const status = String(output.task_status || output.status || "").toLowerCase();
    const results = output.results as Array<{ url?: string }> | undefined;
    const url = String(output.video_url || output.url || results?.[0]?.url || "").trim();
    if (["succeeded", "success", "completed"].includes(status) || url) {
      return url;
    }
    if (["failed", "canceled"].includes(status)) {
      throw new Error(String(output.message || status));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("DashScope 任务超时");
}

export const dashscopeAdapter: StudioAdapter = {
  id: "dashscope",
  label: "阿里云百炼 DashScope",
  docs: "https://help.aliyun.com/zh/model-studio/qwen-image-api",
  async generateImage(ctx, input) {
    const host = dashscopeHost(ctx.provider.baseUrl);
    const refs = collectImageRefs(input);

    if (isQwenImage(input.model)) {
      const data = await studioProxyJson<Record<string, unknown>>({
        provider: ctx.provider,
        baseUrl: host,
        path: "/api/v1/services/aigc/multimodal-generation/generation",
        body: {
          model: input.model,
          input: {
            messages: [
              {
                role: "user",
                content: [
                  ...refs.map((url) => ({ image: url })),
                  { text: input.prompt },
                ],
              },
            ],
          },
          parameters: {
            watermark: false,
            prompt_extend: true,
            n: Math.max(1, Math.min(isQwenImage20or30(input.model) ? 6 : 1, input.n || 1)),
            size: qwenImagePixelSize(input.model, input.size, input.aspectRatio),
            ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
            ...(typeof input.seed === "number" && Number.isFinite(input.seed) ? { seed: input.seed } : {}),
          },
        },
        timeoutMs: 120_000,
      });
      const output = data.output as { choices?: Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }> } | undefined;
      const hits = output?.choices?.[0]?.message?.content?.filter((item) => item.image || item.url) || [];
      const urls = hits.map((item) => String(item.image || item.url || "")).filter(Boolean);
      const fallback = allImageUrls(data);
      const merged = urls.length ? urls : fallback;
      const url = merged[0] || firstImageUrl(data);
      if (!url) throw new Error("Qwen-Image 没有返回图片。官方路径是 /api/v1/services/aigc/multimodal-generation/generation，不是 compatible-mode /images/generations。");
      return { url, urls: merged.length ? merged : [url] };
    }

    if (refs.length && (isWanI2I(input.model) || /wan2\.[5-9]-image/i.test(input.model))) {
      const limited = collectImageRefs(input, wanMaxRefs(input.model));
      const created = await studioProxyJson<Record<string, unknown>>({
        provider: ctx.provider,
        baseUrl: host,
        path: "/api/v1/services/aigc/image2image/image-synthesis",
        extraHeaders: { "X-DashScope-Async": "enable" },
        body: {
          model: input.model,
          input: { prompt: input.prompt, images: limited },
          parameters: { prompt_extend: true, n: input.n || 1 },
        },
        timeoutMs: 30_000,
      });
      const taskId = String((created.output as { task_id?: string } | undefined)?.task_id || created.task_id || "").trim();
      if (!taskId) throw new Error("万相图生图没有返回 task_id。官方路径是 /api/v1/services/aigc/image2image/image-synthesis，字段是 input.images。");
      const url = await pollTask(ctx, taskId);
      if (!url) throw new Error("万相图生图完成但没有图片地址");
      return { url, urls: [url] };
    }

    if (refs.length && !isWanxV1(input.model)) {
      throw new Error(`模型 ${input.model} 是文生图，不能吃参考图。请换 Qwen-Image / wan2.5-i2i / wan2.6-image。`);
    }

    const created = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: host,
      path: "/api/v1/services/aigc/text2image/image-synthesis",
      extraHeaders: { "X-DashScope-Async": "enable" },
      body: {
        model: input.model,
        input: {
          prompt: input.prompt,
          ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
          ...(refs[0] && isWanxV1(input.model) ? { ref_image: refs[0] } : {}),
        },
        parameters: {
          n: input.n || 1,
          size: input.size === "3K" ? "1440*1440" : "1280*1280",
          ...(refs[0] && isWanxV1(input.model) ? { ref_strength: input.strength ?? 0.7, ref_mode: "repaint" } : {}),
        },
      },
      timeoutMs: 30_000,
    });
    const taskId = String((created.output as { task_id?: string } | undefined)?.task_id || created.task_id || "").trim();
    if (!taskId) throw new Error("万相文生图没有返回 task_id。官方路径是 /api/v1/services/aigc/text2image/image-synthesis。");
    const url = await pollTask(ctx, taskId);
    if (!url) throw new Error("万相文生图完成但没有图片地址");
    return { url, urls: [url] };
  },
  async createVideo(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: dashscopeHost(ctx.provider.baseUrl),
      path: "/api/v1/services/aigc/video-generation/video-synthesis",
      extraHeaders: { "X-DashScope-Async": "enable" },
      body: {
        model: input.model,
        input: {
          prompt: input.prompt,
          ...(input.imageUrl ? { img_url: input.imageUrl } : {}),
          ...(input.lastFrameUrl ? { last_frame_url: input.lastFrameUrl } : {}),
        },
        parameters: {
          ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
          ...(input.aspectRatio ? { size: input.aspectRatio } : {}),
        },
      },
      timeoutMs: 60_000,
    });
    const id = String((data.output as { task_id?: string } | undefined)?.task_id || data.task_id || data.id || "").trim();
    if (!id) throw new Error("DashScope 视频没有返回 task_id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    try {
      const url = await pollTask(ctx, taskId);
      return url ? { status: "completed" as const, url } : { status: "pending" as const };
    } catch (err) {
      return { status: "failed" as const, error: err instanceof Error ? err.message : "失败" };
    }
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      path: "/chat/completions",
      body: {
        model: input.model,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
      },
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("DashScope 没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 DashScope Key" };
    return { ok: true, message: "已保存 DashScope Key。生成时走官方异步端点。" };
  },
};
