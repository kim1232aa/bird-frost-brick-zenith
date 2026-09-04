import type { ImageGenInput, StudioAdapter } from "./types.ts";
import { allImageUrls, studioProxyJson } from "../generate/proxy.ts";
import { collectImageRefs } from "../image-refs.ts";
import {
  buildXaiImagineVideoBody,
  isOfficialXaiHost,
  readXaiImaginePoll,
  readXaiImagineRequestId,
  xaiImagineCreatePath,
  xaiImaginePollPath,
} from "./contracts.ts";
import { resolveXaiImagineVideoImageFields } from "./xai-imagine-video-refs.ts";

const XAI_IMAGINE_IMAGE_2_MODEL = "grok-imagine-image-2.0";
const XAI_IMAGINE_ASPECT_RATIOS = new Set([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "2:1",
  "1:2",
  "19.5:9",
  "9:19.5",
  "20:9",
  "9:20",
  "21:9",
  "5:2",
  "auto",
]);

function imagineImagePart(url: string) {
  return { type: "image_url", url };
}

function normalizeXaiImagineAspectRatio(value: unknown) {
  const ratio = String(value || "").trim().toLowerCase();
  return XAI_IMAGINE_ASPECT_RATIOS.has(ratio) ? ratio : "";
}

function normalizeXaiImagineResolution(value: unknown) {
  const resolution = String(value || "").trim().toLowerCase();
  return resolution === "1k" || resolution === "2k" ? resolution : "";
}

function normalizeXaiImagineQuality(value: unknown) {
  const quality = String(value || "").trim().toLowerCase();
  return quality === "low" || quality === "medium" ? quality : "";
}

export function buildXaiImagineImageBody(input: ImageGenInput): Record<string, unknown> {
  const refs = collectImageRefs(input, 3);
  const editing = refs.length > 0 || input.operation === "edit";
  if (editing && !refs.length) {
    throw new Error("Grok Imagine 图生图需要至少 1 张参考图。官方路径是 POST /v1/images/edits。");
  }

  const body: Record<string, unknown> = { model: input.model, prompt: input.prompt, n: input.n || 1 };
  const isImage2 = input.model.trim().toLowerCase() === XAI_IMAGINE_IMAGE_2_MODEL;
  if (!editing && isImage2) {
    const aspectRatio = normalizeXaiImagineAspectRatio(input.aspectRatio);
    const resolution = normalizeXaiImagineResolution(input.size);
    const quality = normalizeXaiImagineQuality(input.quality);
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (resolution) body.resolution = resolution;
    if (quality) body.quality = quality;
    return body;
  }

  if (refs.length === 1) body.image = imagineImagePart(refs[0]);
  else if (refs.length > 1) body.images = refs.map(imagineImagePart);
  if (refs.length > 1 && isImage2) {
    const aspectRatio = normalizeXaiImagineAspectRatio(input.aspectRatio);
    if (aspectRatio) body.aspect_ratio = aspectRatio;
  }
  return body;
}

function xaiVideoProfile(baseUrl: string) {
  return isOfficialXaiHost(baseUrl) ? "official" : "relay";
}

export const xaiImagineAdapter: StudioAdapter = {
  id: "xai-imagine",
  label: "xAI Imagine",
  docs: "https://docs.x.ai/developers/model-capabilities/images/editing",
  async generateImage(ctx, input) {
    const body = buildXaiImagineImageBody(input);
    const editing = Boolean(body.image) || (Array.isArray(body.images) && body.images.length > 0);
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
    const official = isOfficialXaiHost(ctx.provider.baseUrl);
    const frames = resolveXaiImagineVideoImageFields({
      imageUrl: input.imageUrl,
      lastFrameUrl: input.lastFrameUrl,
      imageUrls: input.imageUrls,
      official,
    });
    const body = buildXaiImagineVideoBody({
      model: input.model,
      prompt: input.prompt,
      duration: input.duration,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      generateAudio: input.generateAudio,
      fps: input.fps,
      negative_prompt: input.negativePrompt,
      watermark: input.watermark,
      promptExpansion: input.promptExpansion,
      returnLastFrame: input.returnLastFrame,
      audioUrl: input.audioUrl,
      width: input.width,
      height: input.height,
      steps: input.steps,
      guidance: input.guidance,
      modelVariant: input.modelVariant,
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
      image: frames.image,
      last_frame_image: frames.last_frame_image,
      image_urls: frames.image_urls,
      profile: xaiVideoProfile(ctx.provider.baseUrl),
    });
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: xaiImagineCreatePath(),
      body,
      timeoutMs: 90_000,
    });
    const ready = String(data.url || "").trim();
    if (ready.startsWith("blob:") || /^https?:\/\//i.test(ready)) return { id: `done:${ready}` };
    const id = readXaiImagineRequestId(data);
    if (!id) throw new Error(`Imagine 视频没有返回 request_id：${JSON.stringify(data).slice(0, 200)}`);
    return { id };
  },
  async pollVideo(ctx, taskId) {
    if (taskId.startsWith("done:")) return { status: "completed", url: taskId.slice(5) };
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: xaiImaginePollPath(taskId),
      method: "GET",
      timeoutMs: 30_000,
    });
    const state = readXaiImaginePoll(data);
    if (state.status !== "completed" || !state.url) return state;
    if (isOfficialXaiHost(ctx.provider.baseUrl)) return state;
    if (/^https?:\/\//i.test(state.url) && !state.url.includes("/videos/")) return state;
    const path = state.url.startsWith("/v1/") ? state.url.replace(/^\/v1/, "") : `/videos/${taskId}/content`;
    const response = await fetch(`/local-relay-proxy${path.startsWith("/") ? path : `/${path}`}`, {
      headers: {
        ...(ctx.provider.id ? { "x-boundless-relay-id": ctx.provider.id } : {}),
        "Accept-Encoding": "identity",
      },
    });
    if (!response.ok) throw new Error(`视频文件下载失败 ${response.status}`);
    const blob = await response.blob();
    return { status: "completed", url: URL.createObjectURL(blob) };
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson({
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
      timeoutMs: input.timeoutMs || 90_000,
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("Grok 没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Key" };
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
