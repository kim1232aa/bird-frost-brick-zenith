import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

export const openaiCompatAdapter: StudioAdapter = {
  id: "openai-compat",
  label: "OpenAI 兼容",
  docs: "https://platform.openai.com/docs/api-reference",
  async generateImage(ctx, input) {
    const refs = imageRefs(input);
    const editing = input.operation === "edit" || refs.length > 0;
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: editing && ctx.provider.endpoints?.images !== "/images/edits" ? (ctx.provider.endpoints?.images || "/images/generations") : ctx.provider.endpoints?.images || "/images/generations",
      body: {
        model: input.model,
        prompt: input.prompt,
        n: input.n || 1,
        ...(input.size ? { size: input.size } : {}),
        ...(refs.length === 1 ? { image: refs[0] } : {}),
        ...(refs.length > 1 ? { image: refs[0], images: refs } : {}),
      },
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("OpenAI 兼容生图没有返回图片");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: "/videos/generations",
      body: {
        model: input.model,
        prompt: input.prompt,
        ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.imageUrl ? { image: { url: input.imageUrl } } : {}),
        ...(input.lastFrameUrl ? { last_frame: { url: input.lastFrameUrl } } : {}),
      },
      timeoutMs: 90_000,
    });
    const id = String(data.request_id || data.id || "").trim();
    if (!id) throw new Error("视频任务没有返回 id");
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
    const video = data.video && typeof data.video === "object" ? (data.video as Record<string, unknown>) : undefined;
    const url = String(video?.url || data.video_url || data.url || "").trim();
    if (["done", "completed", "succeeded", "success"].includes(status) || url) {
      return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有地址" };
    }
    if (["failed", "expired", "cancelled", "canceled"].includes(status)) {
      return { status: "failed", error: String(data.error || data.message || status) };
    }
    return { status: "pending" };
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      path: "/chat/completions",
      body: {
        model: input.model,
        temperature: 0.7,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          input.imageUrl
            ? {
                role: "user",
                content: [
                  { type: "text", text: input.prompt },
                  { type: "image_url", image_url: { url: input.imageUrl } },
                ],
              }
            : { role: "user", content: input.prompt },
        ],
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      },
      timeoutMs: 90_000,
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("文本模型没有返回内容");
    return { text };
  },
  async generateAudio(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: "/audio/speech",
      body: { model: input.model, input: input.prompt, voice: input.voice || "alloy" },
      timeoutMs: 90_000,
    });
    const url = String(data.url || "").trim();
    if (url) return { url };
    throw new Error("音频接口没有返回地址。请确认该中转支持 /audio/speech。");
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Key" };
    const path = ctx.provider.endpoints?.images || "/images/generations";
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path,
        body: { model: "gpt-image-2", prompt: "probe", n: 1, size: "256x256" },
        timeoutMs: 20_000,
      });
      return { ok: true, message: `生图端点可用 ${path}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/404|not found/i.test(message)) return { ok: false, message: `生图端点 404：${path}。换协议或改 images 路径。` };
      if (/401|invalid|unauthorized|model|billing|quota|parameter/i.test(message)) {
        return { ok: true, message: `生图端点在（${path}），厂商返回：${message.slice(0, 160)}` };
      }
      return { ok: false, message };
    }
  },
};
