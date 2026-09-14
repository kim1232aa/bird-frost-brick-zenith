import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";
import { buildArkImageGenerationBody, buildArkVideoBody, readArkVideoPoll, studioEndpoint } from "./contracts";

function explainVideoError(message: string) {
  if (/UnsupportedModel|does not support the agent plan/i.test(message)) {
    // 保留上游原文（含 code/request 细节），套餐说明追加在后面。
    return `${message}（提示：当前 Agent Plan 档位未开通该 Seedance 模型——Small 无视频；Medium 起 doubao-seedance-1.5-pro；Large/Max 才有 Seedance 2.0）`;
  }
  return message;
}

function isAgentPlanHost(baseUrl: string) {
  return String(baseUrl || "").includes("/api/plan/v3");
}

export const arkPlanAdapter: StudioAdapter = {
  id: "ark-plan",
  label: "火山方舟 Agent Plan",
  docs: "https://www.volcengine.com/docs/82379/2375486",
  async generateImage(ctx, input) {
    const count = typeof input.n === "number" && input.n > 1 ? input.n : 1;
    const refs = collectImageRefs(input, Math.max(1, 15 - count));
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: ctx.provider.endpoints?.images || "/images/generations",
      body: buildArkImageGenerationBody({
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        n: input.n,
        image: refs,
      }),
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("火山 Agent Plan 生图没有返回图片地址");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    try {
      const data = await studioProxyJson<Record<string, unknown>>({
        provider: ctx.provider,
        path: studioEndpoint(ctx.provider.endpoints, "videosCreate", "/contents/generations/tasks"),
        body: buildArkVideoBody({
          model: input.model,
          prompt: input.prompt,
          duration: input.duration,
          ratio: input.aspectRatio || "adaptive",
          generateAudio: typeof input.generateAudio === "boolean" ? input.generateAudio : undefined,
          watermark: typeof input.watermark === "boolean" ? input.watermark : false,
          imageUrl: input.imageUrl,
          lastFrameUrl: input.lastFrameUrl,
          imageUrls: input.imageUrls,
          resolution: input.resolution,
          returnLastFrame: input.returnLastFrame,
          frames: input.frames,
          audioMode: input.audioMode,
          quantity: input.quantity,
          mode: input.mode,
          frameGuideStrength: input.frameGuideStrength,
          safetyChecker: input.safetyChecker,
          shift: input.shift,
          turbo: input.turbo,
          sampler: input.sampler,
          scheduler: input.scheduler,
          usePro: input.usePro,
        }),
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
      path: studioEndpoint(ctx.provider.endpoints, "videosPoll", "/contents/generations/tasks/{id}", taskId),
      method: "GET",
      timeoutMs: 30_000,
    });
    return readArkVideoPoll(data);
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 API Key" };
    const host = String(ctx.provider.baseUrl || "");
    const agentPlan = isAgentPlanHost(host);
    if (!agentPlan && !host.includes("/api/v3")) {
      return { ok: false, message: "火山方舟请使用 /api/plan/v3（Agent Plan）或 /api/v3（标准 Ark）" };
    }
    const probeModel = agentPlan ? "doubao-seedream-5.0-lite" : "doubao-seedream-5-0-lite-260128";
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path: ctx.provider.endpoints?.images || "/images/generations",
        body: { model: probeModel, prompt: "probe", size: "2K", watermark: false },
        timeoutMs: 20_000,
      });
      return { ok: true, message: agentPlan ? "生图端点 /images/generations 可用（Agent Plan）" : "生图端点 /images/generations 可用（标准 Ark）" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/404/i.test(message)) {
        return { ok: false, message: agentPlan ? `Agent Plan 生图 404。确认 Base URL 是 /api/plan/v3。${message}` : `标准 Ark 生图 404。确认 Base URL 是 /api/v3。${message}` };
      }
      if (/401|invalid|unauthorized|model|quota|param/i.test(message)) {
        return { ok: true, message: `生图端点在，厂商返回：${message.slice(0, 160)}` };
      }
      return { ok: false, message };
    }
  },
};
