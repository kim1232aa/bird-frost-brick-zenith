import type { StudioAdapter } from "./types";
import { allImageUrls, firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";
import { collectImageRefs } from "@/studio/image-refs";
import {
  buildDashscopeImageRequest,
  buildDashscopeVideoBody,
  DASHSCOPE_TASK_POLL_INTERVAL_MS,
  DASHSCOPE_TASK_POLL_WINDOW_MS,
  dashscopeNativeApiHost,
  studioEndpoint,
} from "./contracts";
import { buildDashscopeAudioRequest, readDashscopeAudioResult } from "./dashscope-audio";

function isQwenImage(model: string) {
  return /qwen[-_]?image/i.test(model);
}

function isQwenImage20or30(model: string) {
  return /qwen[-_]?image[-_]?[23]/i.test(model);
}

function isWanxV1(model: string) {
  return /^wanx-v1$/i.test(model.trim());
}

function isWan26or27Image(model: string) {
  return /wan2\.[6-9]-image|wan2\.6-t2i|wan2\.7-image/i.test(model);
}

function isWan25I2I(model: string) {
  return /wan2\.5.*i2i|wan2\.5-i2i/i.test(model);
}

function wanMaxRefs(model: string) {
  if (/wan2\.7/i.test(model)) return 9;
  if (/wan2\.6/i.test(model)) return 4;
  if (/wan2\.5/i.test(model)) return 3;
  return 1;
}

function qwenImageCount(model: string, n?: number) {
  const max = isQwenImage20or30(model) ? 6 : 1;
  const count = Math.max(1, n || 1);
  if (count > max) throw new Error(`该模型最多 ${max} 张输出，当前 ${count} 张。请先降低数量再生成。`);
  return count;
}

/** Official Qwen-Image 2.0/3.0 2K presets: https://help.aliyun.com/zh/model-studio/qwen-image-api */
const QWEN20_2K: Record<string, string> = {
  "1:1": "2048*2048",
  "16:9": "2688*1536",
  "9:16": "1536*2688",
  "4:3": "2368*1728",
  "3:4": "1728*2368",
};
const QWEN20_1K: Record<string, string> = {
  "1:1": "1024*1024",
  "16:9": "1344*768",
  "9:16": "768*1344",
  "4:3": "1152*864",
  "3:4": "864*1152",
};
const QWEN_PLUS: Record<string, string> = {
  "1:1": "1328*1328",
  "16:9": "1664*928",
  "9:16": "928*1664",
  "4:3": "1472*1104",
  "3:4": "1104*1472",
};

function parsePixelSize(value: string) {
  const match = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(String(value || "").trim());
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

export function qwenImagePixelSize(model: string, size?: string, ratio?: string) {
  const raw = String(size || "2K").trim() || "2K";
  const aspect = String(ratio || "1:1").trim() || "1:1";
  const pixels = parsePixelSize(raw);
  if (pixels) {
    const area = pixels.width * pixels.height;
    if (area >= 512 * 512 && area <= 2048 * 2048) return `${pixels.width}*${pixels.height}`;
  }
  if (!isQwenImage20or30(model)) {
    return QWEN_PLUS[aspect] || "1328*1328";
  }
  const tier = raw.toUpperCase();
  if (tier === "1K") return QWEN20_1K[aspect] || "1024*1024";
  return QWEN20_2K[aspect] || "2048*2048";
}

function dashscopeImageSize(model: string, size?: string, ratio?: string) {
  if (isQwenImage(model)) return qwenImagePixelSize(model, size, ratio);
  if (/wan2\.7/i.test(model) && /^[1234]K$/i.test(String(size || "").trim())) return String(size).trim().toUpperCase();
  return size;
}

async function pollTask(
  ctx: Parameters<NonNullable<StudioAdapter["pollVideo"]>>[0],
  taskId: string,
  path = `/api/v1/tasks/${encodeURIComponent(taskId)}`,
) {
  const started = Date.now();
  while (Date.now() - started < DASHSCOPE_TASK_POLL_WINDOW_MS) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: dashscopeNativeApiHost(ctx.provider.baseUrl),
      path,
      method: "GET",
      timeoutMs: 30_000,
    });
    const output = (data.output || data) as Record<string, unknown>;
    const status = String(output.task_status || output.status || "").toLowerCase();
    const results = output.results as Array<{ url?: string }> | undefined;
    const choices = output.choices as Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }> | undefined;
    const choiceImage = choices?.[0]?.message?.content?.find((item) => item.image || item.url);
    const url = String(output.video_url || output.url || results?.[0]?.url || choiceImage?.image || choiceImage?.url || "").trim();
    if (["succeeded", "success", "completed"].includes(status)) {
      if (!url) throw new Error("DashScope 任务成功但没有返回地址");
      return url;
    }
    if (["failed", "canceled", "cancelled", "unknown"].includes(status)) {
      throw new Error(String(output.message || status));
    }
    const remaining = DASHSCOPE_TASK_POLL_WINDOW_MS - (Date.now() - started);
    if (remaining <= 0) break;
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(DASHSCOPE_TASK_POLL_INTERVAL_MS, remaining)));
  }
  throw new Error("DashScope 任务超时");
}

export const dashscopeAdapter: StudioAdapter = {
  id: "dashscope",
  label: "阿里云百炼 DashScope",
  docs: "https://help.aliyun.com/zh/model-studio/qwen-image-api",
  async generateImage(ctx, input) {
    const host = dashscopeNativeApiHost(ctx.provider.baseUrl);
    const maxRefs = isQwenImage(input.model) ? 3 : isWanxV1(input.model) ? 1 : isWan26or27Image(input.model) || isWan25I2I(input.model) ? wanMaxRefs(input.model) : undefined;
    const refs = collectImageRefs(input, maxRefs);

    if (refs.length && !isQwenImage(input.model) && !isWanxV1(input.model) && !isWan26or27Image(input.model) && !isWan25I2I(input.model)) {
      throw new Error(`模型 ${input.model} 是文生图，不能吃参考图。请换 Qwen-Image / wan2.5-i2i / wan2.6-image。`);
    }

    const request = buildDashscopeImageRequest({
      model: input.model,
      prompt: input.prompt,
      imageUrls: refs,
      negativePrompt: input.negativePrompt,
      seed: input.seed,
      n: isQwenImage(input.model) ? qwenImageCount(input.model, input.n) : input.n,
      size: dashscopeImageSize(input.model, input.size, input.aspectRatio),
      aspectRatio: input.aspectRatio,
    });

    const created = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: host,
      path: request.path,
      extraHeaders: request.async ? { "X-DashScope-Async": "enable" } : undefined,
      body: request.body,
      timeoutMs: request.async ? 30_000 : 120_000,
    });

    if (!request.async) {
      const output = created.output as { choices?: Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }> } | undefined;
      const hits = output?.choices?.[0]?.message?.content?.filter((item) => item.image || item.url) || [];
      const urls = hits.map((item) => String(item.image || item.url || "")).filter(Boolean);
      const fallback = allImageUrls(created);
      const merged = urls.length ? urls : fallback;
      const url = merged[0] || firstImageUrl(created);
      if (!url) throw new Error("DashScope 没有返回图片。官方路径是 /api/v1/services/aigc/multimodal-generation/generation，不是 compatible-mode /images/generations。");
      return { url, urls: merged.length ? merged : [url] };
    }

    const taskId = String((created.output as { task_id?: string } | undefined)?.task_id || created.task_id || "").trim();
    if (!taskId) throw new Error(`万相没有返回 task_id。官方路径是 ${request.path}。`);
    const url = await pollTask(ctx, taskId);
    if (!url) throw new Error("万相完成但没有图片地址");
    return { url, urls: [url] };
  },
  async createVideo(ctx, input) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl: dashscopeNativeApiHost(ctx.provider.baseUrl),
      path: studioEndpoint(ctx.provider.endpoints, "videosCreate", "/api/v1/services/aigc/video-generation/video-synthesis"),
      extraHeaders: { "X-DashScope-Async": "enable" },
      body: buildDashscopeVideoBody({
        model: input.model,
        prompt: input.prompt,
        duration: input.duration,
        ratio: input.aspectRatio,
        resolution: input.resolution,
        fps: input.fps,
        generateAudio: input.generateAudio,
        negativePrompt: input.negativePrompt,
        imageUrl: input.imageUrl,
        lastFrameUrl: input.lastFrameUrl,
        imageUrls: input.imageUrls,
        seed: input.seed,
        watermark: input.watermark,
        promptExpansion: input.promptExpansion,
        audioUrl: input.audioUrl,
        audioMode: input.audioMode,
        frames: input.frames,
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
    const id = String((data.output as { task_id?: string } | undefined)?.task_id || data.task_id || data.id || "").trim();
    if (!id) throw new Error("DashScope 视频没有返回 task_id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    try {
      const url = await pollTask(ctx, taskId, studioEndpoint(ctx.provider.endpoints, "videosPoll", "/api/v1/tasks/{id}", taskId));
      return url ? { status: "completed" as const, url } : { status: "pending" as const };
    } catch (err) {
      return { status: "failed" as const, error: err instanceof Error ? err.message : "失败" };
    }
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      path: studioEndpoint(ctx.provider.endpoints, "chat", "/chat/completions"),
      body: {
        model: input.model,
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
    if (!text) throw new Error("DashScope 没有返回文本");
    return { text };
  },
  async generateAudio(ctx, input) {
    const request = buildDashscopeAudioRequest(input);
    const data = await studioProxyJson<unknown>({
      provider: ctx.provider,
      baseUrl: dashscopeNativeApiHost(ctx.provider.baseUrl),
      path: studioEndpoint(ctx.provider.endpoints, "audio", request.path),
      authScheme: request.authScheme,
      body: request.body,
      accept: "audio/*, application/octet-stream;q=0.9, */*",
      timeoutMs: 120_000,
    });
    return readDashscopeAudioResult(data);
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 DashScope Key" };
    return { ok: true, message: "已保存 DashScope Key。生成时走官方异步端点。" };
  },
};
