import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";
import {
  assertRefCount,
  buildOpenAiOfficialImageBody,
  isOfficialOpenAiHost,
  OFFICIAL_OPENAI_IMAGE_REF_CAP,
  openaiVideoWireKind,
  planOpenAiCompatCreateVideo,
  readOpenAiCompatPoll,
  SAFE_IMAGE_REF_CAP,
  studioEndpoint,
} from "./contracts";

function openaiImageRefCap(baseUrl: string, protocol?: string) {
  return openaiVideoWireKind(baseUrl, protocol) === "openai-official" ? OFFICIAL_OPENAI_IMAGE_REF_CAP : SAFE_IMAGE_REF_CAP;
}

export const openaiCompatAdapter: StudioAdapter = {
  id: "openai-compat",
  label: "OpenAI 兼容",
  docs: "https://platform.openai.com/docs/api-reference",
  async generateImage(ctx, input) {
    const official = isOfficialOpenAiHost(ctx.provider.baseUrl) || ctx.provider.protocol === "openai-official";
    const refs = collectImageRefs(input, openaiImageRefCap(ctx.provider.baseUrl, ctx.provider.protocol));
    const editing = input.operation === "edit" || refs.length > 0;
    if (editing && !refs.length) {
      throw new Error("改图至少需要 1 张参考图");
    }
    const body = official
      ? buildOpenAiOfficialImageBody({
          model: input.model,
          prompt: input.prompt,
          n: input.n,
          size: input.size,
          quality: input.quality,
          imageUrls: refs,
          maskUrl: input.maskUrl,
          operation: editing ? "edit" : "generate",
        })
      : {
          model: input.model,
          prompt: input.prompt,
          n: input.n || 1,
          ...(input.size ? { size: input.size } : {}),
          ...(input.quality ? { quality: input.quality } : {}),
          ...(typeof input.seed === "number" && Number.isFinite(input.seed) ? { seed: input.seed } : {}),
          ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
          ...(editing
            ? {
                images: refs.map((url) => ({ image_url: url })),
                ...(input.maskUrl ? { mask: { image_url: input.maskUrl } } : {}),
              }
            : {}),
        };
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: editing ? "/images/edits" : studioEndpoint(ctx.provider.endpoints, "images", "/images/generations"),
      body,
      timeoutMs: 180_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("OpenAI 兼容生图没有返回图片");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    const adapter = openaiVideoWireKind(ctx.provider.baseUrl, ctx.provider.protocol);
    if (adapter === "openai-official") {
      const extras = (input.imageUrls || []).filter(Boolean);
      if (extras.length || input.lastFrameUrl) {
        throw new Error("OpenAI 官方 Videos 只接受 1 个 input_reference，不发送 last_frame / image_urls。");
      }
    } else {
      assertRefCount((input.imageUrls || []).filter(Boolean).length);
    }
    const planned = planOpenAiCompatCreateVideo({
      model: input.model,
      prompt: input.prompt,
      duration: input.duration,
      ratio: input.aspectRatio,
      resolution: input.resolution,
      fps: input.fps,
      generateAudio: input.generateAudio,
      negative_prompt: input.negativePrompt,
      first_frame: input.imageUrl,
      last_frame: input.lastFrameUrl,
      image_urls: (input.imageUrls || []).filter(Boolean),
      baseUrl: ctx.provider.baseUrl,
      protocol: ctx.provider.protocol,
      endpoints: ctx.provider.endpoints,
    });
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: planned.path,
      body: planned.body,
      timeoutMs: 90_000,
    });
    const id = String(data.request_id || data.id || "").trim();
    if (!id) throw new Error("视频任务没有返回 id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    const official = openaiVideoWireKind(ctx.provider.baseUrl, ctx.provider.protocol) === "openai-official";
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: official ? `/videos/${encodeURIComponent(taskId)}` : studioEndpoint(ctx.provider.endpoints, "videosPoll", "/videos/{id}", taskId),
      method: "GET",
      timeoutMs: 30_000,
    });
    const state = readOpenAiCompatPoll(data, official);
    if (state.status !== "completed" || !state.needsContent) return state;
    const content = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: `/videos/${encodeURIComponent(taskId)}/content`,
      method: "GET",
      accept: "video/mp4, application/octet-stream;q=0.9, */*",
      timeoutMs: 90_000,
    });
    const url = String(content.url || "").trim();
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有地址" };
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      path: studioEndpoint(ctx.provider.endpoints, "chat", "/chat/completions"),
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
      body: {
        model: input.model,
        input: input.prompt,
        voice: input.voice || "alloy",
        ...(input.format ? { response_format: input.format } : {}),
        ...(typeof input.speed === "number" && Number.isFinite(input.speed) ? { speed: input.speed } : {}),
      },
      accept: "audio/*, application/octet-stream;q=0.9, */*",
      timeoutMs: 90_000,
    });
    const url = String(data.url || "").trim();
    if (url) return { url };
    throw new Error("音频接口没有返回地址。请确认该中转支持 /audio/speech。");
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Key" };
    const path = studioEndpoint(ctx.provider.endpoints, "images", "/images/generations");
    const official = isOfficialOpenAiHost(ctx.provider.baseUrl) || ctx.provider.protocol === "openai-official";
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path,
        body: official
          ? { model: "gpt-image-2", prompt: "probe", n: 1, size: "1024x1024" }
          : { model: "gpt-image-2", prompt: "probe", n: 1 },
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
