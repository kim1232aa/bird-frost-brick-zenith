import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

function explainVideoError(message: string) {
  if (/UnsupportedModel|does not support the agent plan/i.test(message)) {
    return "当前 Agent Plan 档位未开通该 Seedance 模型。官方：Small 无视频；Medium 起 doubao-seedance-1.5-pro；Large/Max 才有 Seedance 2.0。生图 doubao-seedream-5.0-lite 已开通。";
  }
  return message;
}

export const arkPlanAdapter: StudioAdapter = {
  id: "ark-plan",
  label: "火山方舟 Agent Plan",
  docs: "https://www.volcengine.com/docs/82379/2375486",
  async generateImage(ctx, input) {
    const refs = imageRefs(input);
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: ctx.provider.endpoints?.images || "/images/generations",
      body: {
        model: input.model,
        prompt: input.prompt,
        size: input.size || "2K",
        watermark: false,
        output_format: "png",
        response_format: "url",
        ...(typeof input.n === "number" && input.n > 1 ? { sequential_image_generation: "auto", max_images: input.n } : {}),
        ...(refs.length ? { image: refs } : {}),
      },
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("火山 Agent Plan 生图没有返回图片地址");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
    if (input.imageUrl) content.push({ type: "image_url", image_url: { url: input.imageUrl } });
    if (input.lastFrameUrl) content.push({ type: "image_url", image_url: { url: input.lastFrameUrl }, role: "last_frame" });
    try {
      const data = await studioProxyJson<Record<string, unknown>>({
        provider: ctx.provider,
        path: ctx.provider.endpoints?.videosCreate || "/contents/generations/tasks",
        body: {
          model: input.model,
          content,
          ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
          ratio: input.aspectRatio || "adaptive",
          generate_audio: input.generateAudio !== false,
          watermark: false,
        },
        timeoutMs: 60_000,
      });
      const id = String(data.id || "").trim();
      if (!id) throw new Error(`火山视频没有返回任务 id：${JSON.stringify(data).slice(0, 200)}`);
      return { id };
    } catch (err) {
      throw new Error(explainVideoError(err instanceof Error ? err.message : "火山视频失败"));
    }
  },
  async pollVideo(ctx, taskId) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
    });
    const status = String(data.status || "").toLowerCase();
    const content = data.content && typeof data.content === "object" ? (data.content as Record<string, unknown>) : undefined;
    const url = String(content?.video_url || data.video_url || data.url || "").trim();
    if (["succeeded", "success", "completed", "done"].includes(status)) {
      return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有返回地址" };
    }
    if (["failed", "expired", "cancelled", "canceled"].includes(status)) {
      const err = data.error && typeof data.error === "object" ? (data.error as { message?: string }).message : "";
      return { status: "failed", error: String(err || data.message || status) };
    }
    if (url) return { status: "completed", url };
    return { status: "pending" };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Agent Plan API Key" };
    const host = String(ctx.provider.baseUrl || "");
    if (!host.includes("/api/plan/v3")) {
      return { ok: false, message: "Agent Plan 必须使用 https://ark.cn-beijing.volces.com/api/plan/v3 ，不是 /api/v3" };
    }
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path: ctx.provider.endpoints?.images || "/images/generations",
        body: { model: "doubao-seedream-5.0-lite", prompt: "probe", size: "2K", watermark: false },
        timeoutMs: 20_000,
      });
      return { ok: true, message: "生图端点 /images/generations 可用（Agent Plan）" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/404/i.test(message)) return { ok: false, message: `Agent Plan 生图 404。确认 Base URL 是 /api/plan/v3。${message}` };
      if (/401|invalid|unauthorized|model|quota|param/i.test(message)) {
        return { ok: true, message: `生图端点在，厂商返回：${message.slice(0, 160)}` };
      }
      return { ok: false, message };
    }
  },
};
