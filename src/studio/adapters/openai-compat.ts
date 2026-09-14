import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";
import { huggingfaceImageSize } from "./huggingface";
import {
  buildOpenAiOfficialImageBody,
  isOfficialOpenAiHost,
  OFFICIAL_OPENAI_IMAGE_REF_CAP,
  openaiVideoWireKind,
  planOpenAiCompatCreateVideo,
  readOpenAiCompatPoll,
  SAFE_IMAGE_REF_CAP,
  studioEndpoint,
} from "./contracts";

/**
 * NanoGPT 的 /v1/images/generations 只接受模型支持的具体分辨率值
 * （如 "1024x1024"；见 docs.nano-gpt.com 的 image-models supported_parameters）。
 * 档位串（"2K"）原样发送会被上游 400 INVALID_RESOLUTION 拒绝 —— 已实测。
 * 这里把档位+比例换算成显式像素。只作用于 nano-gpt 域名，其他兼容站保持原样。
 */
function nanogptImageSize(baseUrl: string | undefined, size?: string, aspectRatio?: string): string | undefined {
  if (!/nano-gpt\.com/i.test(String(baseUrl || ""))) return size;
  const raw = String(size || "").trim();
  if (!raw) return undefined;
  if (/^\d{2,5}x\d{2,5}$/i.test(raw)) return raw;
  return huggingfaceImageSize(raw, aspectRatio) || undefined;
}

function openaiImageRefCap(baseUrl: string, protocol?: string, model?: string) {
  // GPT image models officially accept up to 16 refs; relay proxy should not cap at 5.
  if (/gpt-image|chatgpt-image/i.test(String(model || "").trim())) return OFFICIAL_OPENAI_IMAGE_REF_CAP;
  return openaiVideoWireKind(baseUrl, protocol) === "openai-official" ? OFFICIAL_OPENAI_IMAGE_REF_CAP : SAFE_IMAGE_REF_CAP;
}

export const openaiCompatAdapter: StudioAdapter = {
  id: "openai-compat",
  label: "OpenAI 兼容",
  docs: "https://platform.openai.com/docs/api-reference",
  async generateImage(ctx, input) {
    const official = isOfficialOpenAiHost(ctx.provider.baseUrl) || ctx.provider.protocol === "openai-official";
    const refs = collectImageRefs(input, openaiImageRefCap(ctx.provider.baseUrl, ctx.provider.protocol, input.model));
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
          ...(nanogptImageSize(ctx.provider.baseUrl, input.size, input.aspectRatio)
            ? { size: nanogptImageSize(ctx.provider.baseUrl, input.size, input.aspectRatio) }
            : {}),
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
      seed: input.seed,
      steps: input.steps,
      guidance: input.guidance,
      modelVariant: input.modelVariant,
      watermark: input.watermark,
      promptExpansion: input.promptExpansion,
      returnLastFrame: input.returnLastFrame,
      audioUrl: input.audioUrl,
      width: input.width,
      height: input.height,
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
      timeoutMs: input.timeoutMs || 90_000,
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
    // 先用免费的 GET /models 验 base URL + Key：直接打 /images/generations 会
    // 真扣费生成一张图（gpt-image-2 要 30s+），点一次测试烧一次钱。
    const modelsPath = studioEndpoint(ctx.provider.endpoints, "models", "/models");
    try {
      const data = await studioProxyJson<{ data?: unknown[] }>({
        provider: ctx.provider,
        path: modelsPath,
        method: "GET",
        timeoutMs: 15_000,
      });
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      return { ok: true, message: `模型列表可用 ${modelsPath}${count ? ` · ${count} 个模型` : ""}` };
    } catch {
      // /models 不存在或失败时回退到生图探测
    }
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
