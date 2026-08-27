import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";

function agnesImageContract(model: string, size?: string) {
  const raw = String(size || "").trim();
  const is21 = /agnes-image-2\.1/i.test(model);
  if (is21) {
    if (/^[1234]K$/i.test(raw)) return { size: raw.toUpperCase() };
    if (raw.includes(":")) return { size: "2K", ratio: raw };
    return { size: "2K", ratio: raw.includes("x") ? undefined : "1:1" };
  }
  if (raw.includes("x") || /^[1234]K$/i.test(raw)) return { size: raw };
  if (raw.includes(":")) return { size: raw === "9:16" ? "768x1024" : raw === "16:9" ? "1024x768" : "1024x1024" };
  return { size: "1024x1024" };
}

function agnesVideoBody(input: {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  imageUrls?: string[];
}) {
  const flash = /agnes-video-2\.5-flash/i.test(input.model);
  const seconds = String(Math.max(4, Math.min(12, Math.round(input.duration || 5))));
  const rawSize = String(input.resolution || "720P").trim().toUpperCase().replace(/P$/, "P");
  const size = flash ? "720P" : /^(720P|960P|2K)$/.test(rawSize) ? rawSize : "720P";
  const aspect_ratio = input.aspectRatio || "16:9";
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  const refs = (input.imageUrls || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
  const base = {
    model: input.model || "agnes-video-2.5-flash",
    prompt: input.prompt,
    seconds,
    size,
    aspect_ratio,
  };
  if (first || last) {
    return { ...base, mode: "keyframe", ...(first ? { first_frame: first } : {}), ...(last ? { last_frame: last } : {}) };
  }
  if (refs.length) {
    return { ...base, mode: "reference", images: refs };
  }
  return { ...base, mode: "text" };
}

function agnesVideoUrl(data: Record<string, unknown>) {
  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : undefined;
  return String(metadata?.url || data.video_url || data.url || "").trim();
}

export const agnesAdapter: StudioAdapter = {
  id: "agnes",
  label: "Agnes AI",
  docs: "https://www.agnes-ai.com/zh-Hans/docs/agnes-image-21-flash.md",
  async generateImage(ctx, input) {
    const refs = collectImageRefs(input);
    const contract = agnesImageContract(input.model, input.size);
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/images/generations",
      body: {
        model: input.model || "agnes-image-2.1-flash",
        prompt: input.prompt,
        ...contract,
        ...(refs.length ? { image: refs } : {}),
      },
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("Agnes 生图没有返回图片");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: "/videos",
      body: agnesVideoBody({
        model: input.model || "agnes-video-2.5-flash",
        prompt: input.prompt,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        imageUrl: input.imageUrl,
        lastFrameUrl: input.lastFrameUrl,
        imageUrls: input.imageUrls,
      }),
      timeoutMs: 60_000,
    });
    const id = String(data.video_id || data.task_id || data.id || "").trim();
    if (!id) throw new Error("Agnes 视频没有返回 video_id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    const paths = [
      `/videos/${encodeURIComponent(taskId)}`,
      `/agnesapi?video_id=${encodeURIComponent(taskId)}&model_name=agnes-video-2.5-flash`,
    ];
    let lastError = "";
    for (const path of paths) {
      try {
        const data = await studioProxyJson<Record<string, unknown>>({
          provider: ctx.provider,
          path,
          method: "GET",
          timeoutMs: 30_000,
        });
        const status = String(data.status || "").toLowerCase();
        const url = agnesVideoUrl(data);
        if (["completed", "succeeded", "success", "done"].includes(status) || url) {
          return url ? { status: "completed", url } : { status: "failed", error: "Agnes 视频完成但没有地址" };
        }
        if (["failed", "error"].includes(status)) {
          const err = data.error && typeof data.error === "object" ? (data.error as { message?: string }).message : "";
          return { status: "failed", error: String(err || data.message || status) };
        }
        return { status: "pending" };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (!/404|not found/i.test(lastError)) {
          return { status: "failed", error: lastError };
        }
      }
    }
    return { status: "failed", error: lastError || "Agnes 视频查询失败" };
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
      return { ok: true, message: `Agnes 已连通（${models.length} 模型）`, models };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "连接失败" };
    }
  },
};
