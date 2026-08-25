import type { StudioAdapter } from "./types";
import { firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";

export const agnesAdapter: StudioAdapter = {
  id: "agnes",
  label: "Agnes AI",
  docs: "https://agnes-ai.com/en/docs/agnes-video-v20",
  async generateImage(ctx, input) {
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/images/generations",
      body: { model: input.model, prompt: input.prompt, n: 1 },
      timeoutMs: 120_000,
    });
    const url = firstImageUrl(data);
    if (!url) throw new Error("Agnes 生图没有返回图片");
    return { url };
  },
  async createVideo(ctx, input) {
    const body: Record<string, unknown> = { model: input.model || "agnes-video-v2.0", prompt: input.prompt };
    if (input.imageUrl) body.image = input.imageUrl;
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: "/videos",
      body,
      timeoutMs: 60_000,
    });
    const id = String(data.task_id || data.video_id || data.id || "").trim();
    if (!id) throw new Error("Agnes 视频没有返回 task_id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: `/videos/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
    });
    const status = String(data.status || "").toLowerCase();
    const url = String(data.video_url || data.url || "").trim();
    if (["succeeded", "success", "completed", "done"].includes(status) || url) {
      return url ? { status: "completed", url } : { status: "failed", error: "Agnes 视频完成但无地址" };
    }
    if (["failed", "error"].includes(status)) return { status: "failed", error: String(data.error || status) };
    return { status: "pending" };
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
    if (!text) throw new Error("Agnes 没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Agnes Key" };
    try {
      const data = await studioProxyJson<{ data?: Array<{ id?: string }> }>({
        provider: ctx.provider,
        path: "/models",
        method: "GET",
        timeoutMs: 20_000,
      });
      const models = (data.data || []).map((item) => String(item.id || "")).filter(Boolean);
      return { ok: true, message: `Agnes 已连通（${models.length} 模型）`, models: models.slice(0, 40) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "连接失败" };
    }
  },
};
