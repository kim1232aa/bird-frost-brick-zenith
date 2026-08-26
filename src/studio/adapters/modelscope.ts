import type { StudioAdapter } from "./types";
import { firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";

type TaskPayload = {
  task_id?: string;
  task_status?: string;
  output_images?: string[];
  output_videos?: string[];
  message?: string;
  error?: string;
};

function host(baseUrl: string) {
  const raw = (baseUrl || "https://api-inference.modelscope.cn").replace(/\/+$/, "");
  return raw.endsWith("/v1") ? raw.slice(0, -3) : raw;
}

function sizeOf(input: { size?: string; width?: number; height?: number }) {
  if (input.width && input.height) return `${input.width}x${input.height}`;
  if (input.size && /^\d+x\d+$/i.test(input.size)) return input.size;
  if (input.size === "3K" || input.size === "hq") return "1664x1664";
  if (input.size === "1K" || input.size === "eco") return "768x768";
  return "1024x1024";
}

async function pollTask(ctx: Parameters<NonNullable<StudioAdapter["generateImage"]>>[0], taskId: string, kind: "image_generation" | "video_generation") {
  for (let i = 0; i < 40; i += 1) {
    const data = await studioProxyJson<TaskPayload>({
      provider: ctx.provider,
      baseUrl: host(ctx.provider.baseUrl),
      path: `/v1/tasks/${encodeURIComponent(taskId)}`,
      method: "GET",
      extraHeaders: { "X-ModelScope-Task-Type": kind },
      timeoutMs: 30_000,
    });
    const status = String(data.task_status || "").toUpperCase();
    const image = data.output_images?.[0] || firstImageUrl(data);
    const video = data.output_videos?.[0];
    if (status === "SUCCEED" || image || video) {
      return { image, video };
    }
    if (status === "FAILED") {
      throw new Error(data.message || data.error || "ModelScope 任务失败");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
  }
  throw new Error("ModelScope 任务超时，请稍后再试");
}

export const modelscopeAdapter: StudioAdapter = {
  id: "modelscope",
  label: "ModelScope 魔搭",
  docs: "https://www.modelscope.cn/docs/model-service/API-Inference/intro",
  async generateImage(ctx, input) {
    const created = await studioProxyJson<TaskPayload & { data?: Array<{ url?: string }> }>({
      provider: ctx.provider,
      baseUrl: host(ctx.provider.baseUrl),
      path: "/v1/images/generations",
      extraHeaders: { "X-ModelScope-Async-Mode": "true" },
      body: {
        model: input.model,
        prompt: input.prompt,
        size: sizeOf(input),
        ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
        ...(typeof input.seed === "number" ? { seed: input.seed } : {}),
        ...(input.imageUrl ? { image: input.imageUrl, images: [input.imageUrl] } : {}),
      },
      timeoutMs: 60_000,
    });
    const immediate = created.output_images?.[0] || firstImageUrl(created);
    if (immediate) return { url: immediate };
    const taskId = String(created.task_id || "").trim();
    if (!taskId) throw new Error("ModelScope 没有返回 task_id 或图片");
    const done = await pollTask(ctx, taskId, "image_generation");
    if (!done.image) throw new Error("ModelScope 完成但没有图片地址");
    return { url: done.image };
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      baseUrl: `${host(ctx.provider.baseUrl)}/v1`,
      path: "/chat/completions",
      body: {
        model: input.model,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
      },
      timeoutMs: 90_000,
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("ModelScope 没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 ModelScope Access Token" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        baseUrl: host(ctx.provider.baseUrl),
        path: "/v1/images/generations",
        extraHeaders: { "X-ModelScope-Async-Mode": "true" },
        body: { model: "Tongyi-MAI/Z-Image-Turbo", prompt: "probe", size: "512x512" },
        timeoutMs: 20_000,
      });
      return { ok: true, message: "魔搭生图端点可用 /v1/images/generations" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/401|invalid|unauthorized|token/i.test(message)) {
        return { ok: false, message: `Token 无效：${message.slice(0, 160)}` };
      }
      if (/404|not found/i.test(message)) return { ok: false, message };
      return { ok: true, message: `端点已打通，厂商返回：${message.slice(0, 160)}` };
    }
  },
};
