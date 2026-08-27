import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";

function pollState(data: unknown): { status: "pending" | "completed" | "failed"; url?: string; error?: string } {
  if (!data || typeof data !== "object") return { status: "failed", error: "视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  const video = record.video && typeof record.video === "object" ? (record.video as Record<string, unknown>) : undefined;
  const url = String(video?.url || record.video_url || record.url || "").trim();
  if (["done", "completed", "succeeded", "success"].includes(status)) {
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有返回地址" };
  }
  if (["failed", "expired", "cancelled", "canceled"].includes(status)) {
    return { status: "failed", error: String(record.error || record.message || status) };
  }
  if (url) return { status: "completed", url };
  return { status: "pending" };
}

function imagineImagePart(url: string) {
  return { type: "image_url", url };
}

export const xaiImagineAdapter: StudioAdapter = {
  id: "xai-imagine",
  label: "xAI Imagine",
  docs: "https://docs.x.ai/developers/model-capabilities/images/editing",
  async generateImage(ctx, input) {
    // Official: T2I → POST /v1/images/generations (prompt only).
    // I2I  → POST /v1/images/edits, up to 3 refs as { type: "image_url", url }.
    const refs = collectImageRefs(input, 3);
    const editing = refs.length > 0 || input.operation === "edit";
    if (editing && !refs.length) {
      throw new Error("Grok Imagine 图生图需要至少 1 张参考图。官方路径是 POST /v1/images/edits。");
    }
    const body: Record<string, unknown> = { model: input.model, prompt: input.prompt, n: input.n || 1 };
    if (editing) {
      if (refs.length === 1) body.image = imagineImagePart(refs[0]);
      else body.images = refs.map(imagineImagePart);
    }
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: editing ? "/images/edits" : "/images/generations",
      body,
      timeoutMs: 180_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error(editing ? "Grok Imagine 图生图没有返回图片" : "Grok Imagine 没有返回图片");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    const stills = Array.from(
      new Set([input.imageUrl, ...(input.imageUrls || []), input.lastFrameUrl].map((item) => String(item || "").trim()).filter(Boolean)),
    ).slice(0, 5);
    const first = input.imageUrl || stills[0];
    const last = input.lastFrameUrl && input.lastFrameUrl !== first ? input.lastFrameUrl : stills.length > 1 ? stills[stills.length - 1] : undefined;
    const body = {
      model: input.model,
      prompt: input.prompt,
      ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.resolution ? { resolution: input.resolution } : {}),
      ...(first ? { image: { url: first } } : {}),
      ...(last ? { last_frame_image: { url: last } } : {}),
      ...(stills.length ? { image_urls: stills } : {}),
    };
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: "/videos/generations",
      body,
      timeoutMs: 90_000,
    });
    const ready = String(data.url || "").trim();
    if (ready.startsWith("blob:") || /^https?:\/\//i.test(ready)) return { id: `done:${ready}` };
    const id = String(data.request_id || data.id || "").trim();
    if (!id) throw new Error(`Imagine 视频没有返回 request_id：${JSON.stringify(data).slice(0, 200)}`);
    return { id };
  },
  async pollVideo(ctx, taskId) {
    if (taskId.startsWith("done:")) return { status: "completed", url: taskId.slice(5) };
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: `/videos/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
    });
    const state = pollState(data);
    if (state.status !== "completed" || !state.url) return state;
    if (/^https?:\/\//i.test(state.url) && !state.url.includes("/videos/")) return state;
    const path = state.url.startsWith("/v1/") ? state.url.replace(/^\/v1/, "") : `/videos/${taskId}/content`;
    let builtin: Record<string, string> = {};
    try {
      if (new URL(ctx.provider.baseUrl).hostname.toLowerCase() === "api.x.ai") builtin = { "x-boundless-builtin": "xai" };
    } catch {
      /* ignore */
    }
    const response = await fetch(`/local-relay-proxy${path.startsWith("/") ? path : `/${path}`}`, {
      headers: {
        Authorization: ctx.provider.apiKey ? `Bearer ${ctx.provider.apiKey}` : "",
        "x-local-relay-base-url": ctx.provider.baseUrl,
        "Accept-Encoding": "identity",
        ...builtin,
      },
    });
    if (!response.ok) throw new Error(`视频文件下载失败 ${response.status}`);
    const blob = await response.blob();
    return { status: "completed", url: URL.createObjectURL(blob) };
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
          { role: "user", content: input.prompt },
        ],
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      },
      timeoutMs: 90_000,
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("Grok 没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Key" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path: ctx.provider.endpoints?.images || "/images/generations",
        body: { model: "grok-imagine-image", prompt: "probe", n: 1 },
        timeoutMs: 20_000,
      });
      return { ok: true, message: "Imagine 生图端点 /images/generations 可用" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/404/i.test(message)) return { ok: false, message: `Imagine 生图 404：${message}` };
      if (/401|invalid|unauthorized|model|quota|billing|parameter/i.test(message)) {
        return { ok: true, message: `生图端点在，厂商返回：${message.slice(0, 160)}` };
      }
      return { ok: false, message };
    }
  },
};
