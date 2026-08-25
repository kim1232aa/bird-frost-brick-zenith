import type { StudioAdapter } from "./types";
import { firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";

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
                content: [{ text: input.prompt }, ...(input.imageUrl ? [{ image: input.imageUrl }] : [])],
              },
            ],
          },
          parameters: {
            watermark: false,
            prompt_extend: true,
            size: input.size === "3K" ? "2048*2048" : input.size === "1K" ? "1024*1024" : "1328*1328",
          },
        },
        timeoutMs: 120_000,
      });
      const output = data.output as { choices?: Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }> } | undefined;
      const hit = output?.choices?.[0]?.message?.content?.find((item) => item.image || item.url);
      const url = String(hit?.image || hit?.url || firstImageUrl(data) || "").trim();
      if (!url) throw new Error("Qwen-Image 没有返回图片。官方路径是 /api/v1/services/aigc/multimodal-generation/generation，不是 compatible-mode /images/generations。");
      return { url };
    }
    const created = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: host,
      path: "/api/v1/services/aigc/text2image/image-synthesis",
      extraHeaders: { "X-DashScope-Async": "enable" },
      body: {
        model: input.model,
        input: { prompt: input.prompt, ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}), ...(input.imageUrl ? { ref_image: input.imageUrl } : {}) },
        parameters: { n: 1, size: input.size === "3K" ? "1440*1440" : "1280*1280" },
      },
      timeoutMs: 30_000,
    });
    const taskId = String((created.output as { task_id?: string } | undefined)?.task_id || created.task_id || "").trim();
    if (!taskId) throw new Error("万相文生图没有返回 task_id。官方路径是 /api/v1/services/aigc/text2image/image-synthesis。");
    const url = await pollTask(ctx, taskId);
    if (!url) throw new Error("万相文生图完成但没有图片地址");
    return { url };
  },
  async createVideo(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: dashscopeHost(ctx.provider.baseUrl),
      path: "/api/v1/services/aigc/video-generation/video-synthesis",
      extraHeaders: { "X-DashScope-Async": "enable" },
      body: {
        model: input.model,
        input: { prompt: input.prompt, ...(input.imageUrl ? { img_url: input.imageUrl } : {}) },
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
  async generateAudio(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: "/audio/speech",
      body: { model: input.model, input: input.prompt, voice: input.voice || "Cherry" },
    });
    const url = String(data.url || "").trim();
    if (!url) throw new Error("DashScope 音频没有返回地址");
    return { url };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 DashScope Key" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        baseUrl: dashscopeHost(ctx.provider.baseUrl),
        path: "/api/v1/services/aigc/text2image/image-synthesis",
        extraHeaders: { "X-DashScope-Async": "enable" },
        body: { model: "wan2.2-t2i-flash", input: { prompt: "probe" }, parameters: { n: 1, size: "512*512" } },
        timeoutMs: 20_000,
      });
      return { ok: true, message: "生图端点可用（text2image/image-synthesis，不是 /images/generations）" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/404|not found/i.test(message)) {
        return { ok: false, message: "生图端点 404。百炼不要走 compatible-mode /images/generations，应走 /api/v1/services/aigc/text2image/image-synthesis 或 Qwen-Image 的 multimodal-generation。" };
      }
      if (/401|invalid|api.?key|unauthorized|model/i.test(message)) {
        return { ok: true, message: `生图端点在（官方路径已打通），厂商返回：${message.slice(0, 160)}` };
      }
      return { ok: false, message };
    }
  },
};
