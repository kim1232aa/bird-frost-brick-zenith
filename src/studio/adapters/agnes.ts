import type { ImageGenInput, StudioAdapter, VideoCreateInput, VideoPollResult } from "./types.ts";
import { collectImageRefs } from "../image-refs.ts";
import { SAFE_IMAGE_REF_CAP, studioEndpoint } from "./contracts.ts";

const AGNES_IMAGE_RATIOS = new Set(["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"]);
const AGNES_VIDEO_V20_MODEL = "agnes-video-v2.0";
const AGNES_VIDEO_DEFAULT_FRAME_RATE = 24;
const AGNES_VIDEO_RECOMMENDED_FRAMES = new Map<number, number>([
  [3, 81],
  [5, 121],
  [10, 241],
  [18, 441],
]);
const AGNES_VIDEO_FRAME_COUNTS = Array.from({ length: 56 }, (_, index) => index * 8 + 1);

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (text) return text;
  }
  return "";
}

function assertAgnesVideoV20Model(value: unknown) {
  const model = String(value || "").trim() || AGNES_VIDEO_V20_MODEL;
  if (model.toLowerCase() !== AGNES_VIDEO_V20_MODEL) {
    throw new Error(`Agnes 视频模型 ${model} 尚未接线；当前仅支持 ${AGNES_VIDEO_V20_MODEL}。agnes-video-2.5 使用不同的 mode/seconds 合同。`);
  }
  return model;
}

function validateAgnesFrameRate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 60) {
    throw new Error("Agnes V2.0 的 fps/frame_rate 必须是 1 到 60 之间的有限数值。");
  }
  return value;
}

function validateAgnesNumFrames(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Agnes V2.0 的 num_frames 必须是整数，收到 ${String(value)}。`);
  }
  if (value < 1 || value > 441) {
    throw new Error(`Agnes V2.0 的 num_frames 必须是 1–441，收到 ${value}。`);
  }
  if ((value - 1) % 8 !== 0) {
    throw new Error(`Agnes V2.0 的 num_frames 必须满足 8n+1，收到 ${value}。`);
  }
  return value;
}

function hasProvidedVideoValue(value: unknown) {
  return value !== undefined && value !== null && (typeof value !== "string" || Boolean(value.trim()));
}

function rejectUnsupportedAgnesVideoFields(input: VideoCreateInput) {
  const fields: ReadonlyArray<[string, unknown]> = [
    ["audioMode", input.audioMode],
    ["quantity", input.quantity],
    ["mode", input.mode],
    ["frameGuideStrength", input.frameGuideStrength],
    ["safetyChecker", input.safetyChecker],
    ["shift", input.shift],
    ["turbo", input.turbo],
    ["sampler", input.sampler],
    ["scheduler", input.scheduler],
    ["usePro", input.usePro],
  ];
  for (const [name, value] of fields) {
    if (hasProvidedVideoValue(value)) {
      throw new Error(`Agnes V2.0 官方视频不支持 ${name}；不会静默丢弃该字段。`);
    }
  }
}

export function agnesVideoFrameParams(duration: number, frameRate = AGNES_VIDEO_DEFAULT_FRAME_RATE) {
  const rate = validateAgnesFrameRate(frameRate);
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Agnes V2.0 的 duration 必须是正数。");
  }
  const targetFrames = duration * rate;
  if (targetFrames < 1 || targetFrames > 441) {
    throw new Error(`Agnes V2.0 的 duration=${duration} 在 frame_rate=${rate} 下超过官方 441 帧限制。`);
  }

  const recommended = rate === AGNES_VIDEO_DEFAULT_FRAME_RATE ? AGNES_VIDEO_RECOMMENDED_FRAMES.get(duration) : undefined;
  if (recommended !== undefined) return { num_frames: recommended, frame_rate: rate };

  let best = AGNES_VIDEO_FRAME_COUNTS[0]!;
  let bestDistance = Math.abs(best - targetFrames);
  for (const candidate of AGNES_VIDEO_FRAME_COUNTS.slice(1)) {
    const distance = Math.abs(candidate - targetFrames);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { num_frames: best, frame_rate: rate };
}

export function buildAgnesImageBody(input: ImageGenInput): Record<string, unknown> {
  const refs = collectImageRefs(input, SAFE_IMAGE_REF_CAP);
  const size = String(input.size || "").trim() || "1K";
  const ratio = String(input.aspectRatio || "").trim();
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    size,
  };
  if (AGNES_IMAGE_RATIOS.has(ratio)) body.ratio = ratio;
  if (refs.length) body.extra_body = { image: refs };
  return body;
}

export function buildAgnesVideoBody(input: VideoCreateInput): Record<string, unknown> {
  const model = assertAgnesVideoV20Model(input.model);
  rejectUnsupportedAgnesVideoFields(input);
  const explicitFrameRate = input.fps === undefined ? undefined : validateAgnesFrameRate(input.fps);
  const extras = (input.imageUrls || []).map((item) => String(item || "").trim()).filter(Boolean);
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  if (last && !first) {
    throw new Error("Agnes 关键帧需要首帧，不能用单独尾帧冒充 extra_body.image keyframes。");
  }
  const keyframes = Array.from(new Set([first, last, ...extras].filter(Boolean)));
  const useKeyframes = Boolean(last || extras.length);
  const body: Record<string, unknown> = { model, prompt: input.prompt };
  if (useKeyframes) {
    body.extra_body = { image: keyframes, mode: "keyframes" };
  } else if (first) {
    body.image = first;
  }
  const explicitFrames = input.frames === undefined ? undefined : validateAgnesNumFrames(input.frames);
  if (explicitFrames !== undefined) {
    body.num_frames = explicitFrames;
    if (explicitFrameRate !== undefined) body.frame_rate = explicitFrameRate;
    else if (input.duration !== undefined) body.frame_rate = AGNES_VIDEO_DEFAULT_FRAME_RATE;
  } else if (input.duration !== undefined) {
    const frameParams = agnesVideoFrameParams(input.duration, explicitFrameRate || AGNES_VIDEO_DEFAULT_FRAME_RATE);
    body.num_frames = frameParams.num_frames;
    body.frame_rate = frameParams.frame_rate;
  } else if (explicitFrameRate !== undefined) {
    body.frame_rate = explicitFrameRate;
  }
  if (typeof input.width === "number" && Number.isFinite(input.width) && input.width > 0) body.width = input.width;
  if (typeof input.height === "number" && Number.isFinite(input.height) && input.height > 0) body.height = input.height;
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) body.seed = input.seed;
  if (typeof input.steps === "number" && Number.isFinite(input.steps)) {
    if (!Number.isInteger(input.steps) || input.steps < 1) {
      throw new Error(`Agnes V2.0 的 num_inference_steps 必须是正整数，收到 ${input.steps}。`);
    }
    body.num_inference_steps = input.steps;
  }
  if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
  return body;
}

export function readAgnesVideoCreateId(data: Record<string, unknown>) {
  return firstNonEmptyString(data.video_id, data.task_id, data.id);
}

export function agnesVideoPollPath(taskId: string) {
  return `/agnesapi?video_id=${encodeURIComponent(taskId)}`;
}

export function planAgnesVideoPoll(taskId: string, _baseUrl?: string) {
  return { path: agnesVideoPollPath(taskId), method: "GET" as const };
}

function readAgnesError(record: Record<string, unknown>, fallback: string) {
  const err = record.error;
  if (err && typeof err === "object") return String((err as { message?: string }).message || "").trim() || fallback;
  return String(err || record.message || fallback).trim();
}

export function readAgnesVideoPoll(data: unknown): VideoPollResult {
  if (!data || typeof data !== "object") return { status: "failed", error: "Agnes 视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  const metadata = record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : undefined;
  const url = String(metadata?.url || "").trim();
  if (status === "completed") {
    return url ? { status: "completed", url } : { status: "failed", error: "Agnes 视频完成但无地址" };
  }
  if (status === "failed") return { status: "failed", error: readAgnesError(record, status) };
  return { status: "pending" };
}

export const agnesAdapter: StudioAdapter = {
  id: "agnes",
  label: "Agnes AI",
  docs: "https://agnes-ai.com/en/docs/agnes-video-v20",
  async generateImage(ctx, input) {
    const { allImageUrls, studioProxyJson } = await import("@/studio/generate/proxy");
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: studioEndpoint(ctx.provider.endpoints, "images", "/images/generations"),
      body: buildAgnesImageBody(input),
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("Agnes 生图没有返回图片");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    const { studioProxyJson } = await import("@/studio/generate/proxy");
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: studioEndpoint(ctx.provider.endpoints, "videosCreate", "/videos"),
      body: buildAgnesVideoBody(input),
      timeoutMs: 60_000,
    });
    const id = readAgnesVideoCreateId(data);
    if (!id) throw new Error("Agnes 视频没有返回 video_id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    const { studioProxyJson } = await import("@/studio/generate/proxy");
    const planned = planAgnesVideoPoll(taskId, ctx.provider.baseUrl);
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      path: planned.path,
      method: planned.method,
      timeoutMs: 30_000,
    });
    return readAgnesVideoPoll(data);
  },
  async generateText(ctx, input) {
    const { studioProxyJson } = await import("@/studio/generate/proxy");
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
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("Agnes 没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Agnes Key" };
    try {
      const { studioProxyJson } = await import("@/studio/generate/proxy");
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
