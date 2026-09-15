import type { ImageGenInput, StudioAdapter, VideoCreateInput, VideoPollResult } from "./types.ts";
import { collectImageRefs } from "../image-refs.ts";
import { huggingfaceImageSize } from "./huggingface.ts";

/** Official fal.run endpoint ids for wiring short names. */
const FAL_T2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  "flux-pro": "fal-ai/flux-pro",
  "flux-2-pro": "fal-ai/flux-2-pro",
  "flux-2-flex": "fal-ai/flux-2-flex",
  "flux-2-flash": "fal-ai/flux-2/flash",
  "nano-banana": "fal-ai/nano-banana",
  "nano-banana-pro": "fal-ai/nano-banana-pro",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/text-to-image",
};

const FAL_I2I: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev/image-to-image",
  "flux/dev": "fal-ai/flux/dev/image-to-image",
  "fal-ai/flux/dev": "fal-ai/flux/dev/image-to-image",
  "fal-ai/flux-2-pro": "fal-ai/flux-2-pro/edit",
  "flux-2-pro": "fal-ai/flux-2-pro/edit",
  "fal-ai/flux-2-flex": "fal-ai/flux-2-flex/edit",
  "flux-2-flex": "fal-ai/flux-2-flex/edit",
  "fal-ai/flux-2/flash": "fal-ai/flux-2/flash/edit",
  "flux-2-flash": "fal-ai/flux-2/flash/edit",
  "nano-banana": "fal-ai/nano-banana/edit",
  "nano-banana-pro": "fal-ai/nano-banana-pro/edit",
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/edit",
  "fal-ai/bytedance/seedream/v4.5/text-to-image": "fal-ai/bytedance/seedream/v4.5/edit",
};

function trimFalModel(model: string) {
  return model.replace(/^\//, "").trim();
}

function isQualifiedFalEndpoint(id: string) {
  return id.startsWith("fal-ai/");
}

function isFalEditEndpoint(id: string) {
  return /(?:^|\/)edit(?:\/|$)/i.test(id) || /image-to-image/i.test(id);
}

function qualifyFalEndpoint(model: string) {
  const trimmed = trimFalModel(model);
  if (!trimmed) throw new Error("Fal 缺少模型 / endpoint id");
  if (isQualifiedFalEndpoint(trimmed)) return trimmed;
  if (FAL_T2I[trimmed]) return FAL_T2I[trimmed];
  throw new Error(`Fal 模型 ${model} 未映射到官方 endpoint id（fal-ai/...），拒绝发送裸路径。`);
}

export function falEndpointPath(model: string, hasRefs: boolean) {
  const trimmed = trimFalModel(model);
  if (hasRefs) {
    if (FAL_I2I[trimmed] || FAL_I2I[model]) return `/${FAL_I2I[trimmed] || FAL_I2I[model]}`;
    const qualified = isQualifiedFalEndpoint(trimmed) ? trimmed : FAL_T2I[trimmed];
    if (qualified && isFalEditEndpoint(qualified)) return `/${qualified}`;
    if (isQualifiedFalEndpoint(trimmed) && isFalEditEndpoint(trimmed)) return `/${trimmed}`;
    throw new Error(`Fal 模型 ${model} 是文生图，不能发 image_url。请换 flux/dev/image-to-image 或 flux-2/edit。`);
  }
  return `/${qualifyFalEndpoint(model)}`;
}

/**
 * fal 各模型支持的采样参数不一样，乱发会被 422 拒：
 * - flux-1 dev/schnell/pro：image_size（枚举或 {width,height}）、seed、num_inference_steps、guidance_scale（schnell 无）
 * - flux-2 pro/flex/flash：image_size、seed（无 steps/guidance）
 * - nano-banana(-pro)：aspect_ratio（字符串），pro 另有 resolution 档位
 * - seedream v4.5：image_size、seed
 */
type FalParamProfile = {
  kind: "flux1" | "flux2" | "banana" | "seedream" | "generic";
  guidance?: boolean;
  steps?: boolean;
};

function falParamProfile(endpoint: string): FalParamProfile {
  if (/nano-banana/i.test(endpoint)) return { kind: "banana" };
  if (/flux-2/i.test(endpoint)) return { kind: "flux2" };
  if (/flux\/schnell/i.test(endpoint)) return { kind: "flux1", steps: true };
  if (/flux/i.test(endpoint)) return { kind: "flux1", steps: true, guidance: true };
  if (/seedream/i.test(endpoint)) return { kind: "seedream" };
  return { kind: "generic" };
}

function falImageSizePixels(size?: string, aspectRatio?: string): { width: number; height: number } | undefined {
  const mapped = huggingfaceImageSize(size, aspectRatio);
  if (!mapped) return undefined;
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(mapped);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

const FAL_BANANA_RESOLUTION_TIERS = new Set(["1k", "2k", "4k"]);

export function planFalImageRequest(
  input: Pick<
    ImageGenInput,
    "model" | "prompt" | "n" | "imageUrl" | "imageUrls" | "strength" | "size" | "aspectRatio" | "seed" | "steps" | "guidance"
  >,
) {
  const refs = collectImageRefs(input);
  const path = falEndpointPath(input.model, refs.length > 0);
  const endpoint = path.replace(/^\//, "");
  const profile = falParamProfile(endpoint);
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    num_images: input.n || 1,
    enable_safety_checker: false,
  };
  // 尺寸：banana 系吃 aspect_ratio / resolution 档位，其余吃 image_size {width,height}
  if (profile.kind === "banana") {
    const aspect = String(input.aspectRatio || "").trim();
    if (aspect) body.aspect_ratio = aspect;
    const tier = String(input.size || "").trim().toLowerCase();
    if (/nano-banana-pro/i.test(endpoint) && FAL_BANANA_RESOLUTION_TIERS.has(tier)) {
      body.resolution = tier.toUpperCase();
    }
  } else {
    const pixels = falImageSizePixels(input.size, input.aspectRatio);
    if (pixels) body.image_size = pixels;
  }
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) body.seed = input.seed;
  if (profile.steps && typeof input.steps === "number" && Number.isFinite(input.steps)) {
    body.num_inference_steps = input.steps;
  }
  if (profile.guidance && typeof input.guidance === "number" && Number.isFinite(input.guidance)) {
    body.guidance_scale = input.guidance;
  }
  if (refs.length) {
    if (/(?:^|\/)edit(?:\/|$)/i.test(endpoint)) {
      body.image_urls = refs;
    } else {
      if (refs.length > 1) {
        throw new Error(`Fal 端点 ${endpoint} 只接受 1 张 image_url，当前 ${refs.length} 张参考图。`);
      }
      body.image_url = refs[0];
      if (typeof input.strength === "number") body.strength = input.strength;
    }
  } else if (typeof input.strength === "number") {
    body.strength = input.strength;
  }
  return { path, authScheme: "Key" as const, body };
}

const FAL_QUEUE_BASE = "https://queue.fal.run";

/**
 * 队列状态/结果走 app 命名空间根（submit 返回的 status_url/response_url 即此形态），
 * 用完整端点路径查状态会被 405 拒。命名空间 = 端点前两段（fal-ai/kling-video 等）。
 */
export function falVideoQueueNamespace(endpoint: string) {
  return endpoint.split("/").filter(Boolean).slice(0, 2).join("/");
}

/**
 * fal 视频队列端点与每模型参考图/参数合同。
 * 2026-09-15 全量重验：fal 队列对任意路径都收（IN_QUEUE 不算存活证据），
 * 只有结果拉取能区分真假端点——假端点秒回 0.05s COMPLETED 且结果 404
 * 「Path /xxx not found」，真端点返回参数校验错误或真实任务。实测结论：
 * - kling-3-pro（v3/pro）：start_image_url 首帧 + end_image_url 尾帧（最多 2 张）；
 *   duration 3–15（字符串枚举）、aspect_ratio（仅 t2v）、generate_audio、
 *   negative_prompt、cfg_scale。
 * - kling-3-standard（v3/standard）：同 pro 的首尾帧与参数合同。
 * - kling-3-turbo（v3/turbo/standard）/ kling-3-turbo-pro（v3/turbo/pro）：
 *   image_url 仅首帧；duration 3–15、aspect_ratio（仅 t2v）。
 *   注意：v3/turbo 直拼路径不存在，必须带 standard/pro 档。
 * - hailuo-2.3（minimax/hailuo-2.3/pro）：image_url 仅首帧；prompt_optimizer。
 * - veo-3.1：t2v 在根路径 fal-ai/veo3.1，i2v 在 fal-ai/veo3.1/image-to-video；
 *   image_url 仅首帧；duration 4s/6s/8s、aspect_ratio auto/16:9/9:16、
 *   resolution 720p/1080p/4k、generate_audio、negative_prompt、seed。
 * - wan-pro：image_url 仅首帧；seed、enable_safety_checker；t2v/i2v 均实测存活。
 * - minimax-h3（minimax/hailuo-03）：已 GA，t2v/i2v 均存活；image_url 仅首帧；
 *   duration 为数字且 ≤15。
 */
type FalVideoProfile = {
  base: string;
  /** 覆盖默认的 `${base}/text-to-video` / `${base}/image-to-video` 拼接（如 veo-3.1 t2v 在根路径）。 */
  t2vPath?: string;
  i2vPath?: string;
  firstFrameField: "start_image_url" | "image_url";
  lastFrameField?: "end_image_url";
  durationKind?: "kling" | "veo" | "hailuo03";
  aspectValues?: readonly string[];
  resolutionValues?: readonly string[];
  audio?: boolean;
  negativePrompt?: boolean;
  cfgScale?: boolean;
  promptOptimizer?: boolean;
  seed?: boolean;
  safetyChecker?: boolean;
};

const FAL_VIDEO_PROFILES: Record<string, FalVideoProfile> = {
  "kling-3-pro": {
    base: "fal-ai/kling-video/v3/pro",
    firstFrameField: "start_image_url",
    lastFrameField: "end_image_url",
    durationKind: "kling",
    aspectValues: ["16:9", "9:16", "1:1"],
    audio: true,
    negativePrompt: true,
    cfgScale: true,
  },
  "kling-3-standard": {
    base: "fal-ai/kling-video/v3/standard",
    firstFrameField: "start_image_url",
    lastFrameField: "end_image_url",
    durationKind: "kling",
    aspectValues: ["16:9", "9:16", "1:1"],
    audio: true,
    negativePrompt: true,
    cfgScale: true,
  },
  "kling-3-turbo": {
    base: "fal-ai/kling-video/v3/turbo/standard",
    firstFrameField: "image_url",
    durationKind: "kling",
    aspectValues: ["16:9", "9:16", "1:1"],
  },
  "kling-3-turbo-pro": {
    base: "fal-ai/kling-video/v3/turbo/pro",
    firstFrameField: "image_url",
    durationKind: "kling",
    aspectValues: ["16:9", "9:16", "1:1"],
  },
  "hailuo-2.3": {
    base: "fal-ai/minimax/hailuo-2.3/pro",
    firstFrameField: "image_url",
    promptOptimizer: true,
  },
  "veo-3.1": {
    base: "fal-ai/veo3.1",
    // t2v 在根路径（fal-ai/veo3.1），i2v 才挂 /image-to-video（2026-09-15 实测）。
    t2vPath: "fal-ai/veo3.1",
    i2vPath: "fal-ai/veo3.1/image-to-video",
    firstFrameField: "image_url",
    durationKind: "veo",
    aspectValues: ["auto", "16:9", "9:16"],
    resolutionValues: ["720p", "1080p", "4k"],
    audio: true,
    negativePrompt: true,
    seed: true,
  },
  "wan-pro": {
    base: "fal-ai/wan-pro",
    firstFrameField: "image_url",
    seed: true,
    safetyChecker: true,
  },
  "minimax-h3": {
    base: "fal-ai/minimax/hailuo-03",
    firstFrameField: "image_url",
    durationKind: "hailuo03",
  },
};

function falVideoProfileForModel(model: string): FalVideoProfile {
  const trimmed = trimFalModel(model).toLowerCase();
  if (FAL_VIDEO_PROFILES[trimmed]) return FAL_VIDEO_PROFILES[trimmed];
  const qualified = Object.keys(FAL_VIDEO_PROFILES).find((key) => trimmed === FAL_VIDEO_PROFILES[key].base);
  if (qualified) return FAL_VIDEO_PROFILES[qualified];
  throw new Error(`Fal 视频模型 ${model} 未映射到官方队列端点（2026-09-15 实测存活：kling-3-pro/standard/turbo/turbo-pro、hailuo-2.3、veo-3.1、wan-pro、minimax-h3）。`);
}

export function planFalVideoRequest(input: Pick<
  VideoCreateInput,
  "model" | "prompt" | "duration" | "aspectRatio" | "resolution" | "generateAudio" | "negativePrompt" | "seed" | "guidance" | "promptExpansion" | "safetyChecker" | "imageUrl" | "lastFrameUrl" | "imageUrls"
>) {
  const profile = falVideoProfileForModel(input.model);
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  const extras = (input.imageUrls || []).map((url) => String(url || "").trim()).filter(Boolean);
  if (extras.length) {
    throw new Error(`Fal 模型 ${input.model} 只吃${profile.lastFrameField ? "首帧+尾帧" : "首帧"}，多出的 ${extras.length} 张参考图已拒绝提交（别硬塞）。`);
  }
  if (last && !profile.lastFrameField) {
    throw new Error(`Fal 模型 ${input.model} 不支持尾帧，只接受首帧参考图。`);
  }
  const hasRefs = Boolean(first || last);
  if (last && !first) throw new Error("尾帧需要同时提供首帧，不能只给尾帧。");
  const endpoint = hasRefs
    ? profile.i2vPath || `${profile.base}/image-to-video`
    : profile.t2vPath || `${profile.base}/text-to-video`;

  const body: Record<string, unknown> = { prompt: input.prompt };
  if (hasRefs) {
    body[profile.firstFrameField] = first;
    if (last && profile.lastFrameField) body[profile.lastFrameField] = last;
  }
  if (typeof input.duration === "number" && Number.isFinite(input.duration)) {
    if (profile.durationKind === "kling") {
      const seconds = Math.min(15, Math.max(3, Math.round(input.duration)));
      body.duration = String(seconds);
    } else if (profile.durationKind === "veo") {
      const allowed = [4, 6, 8];
      const target = input.duration;
      const nearest = allowed.reduce((best, cur) => (Math.abs(cur - target) <= Math.abs(best - target) ? cur : best));
      body.duration = `${nearest}s`;
    } else if (profile.durationKind === "hailuo03") {
      // hailuo-03 的 duration 是数字且 ≤15（2026-09-15 校验报错实证）。
      body.duration = Math.min(15, Math.max(1, Math.round(input.duration)));
    }
  }
  const aspect = String(input.aspectRatio || "").trim();
  if (aspect && profile.aspectValues && !hasRefs) {
    // kling/veo 的 aspect_ratio 只作用于文生视频；图生视频跟原图走。
    if (profile.aspectValues.includes(aspect)) body.aspect_ratio = aspect;
  }
  const resolution = String(input.resolution || "").trim().toLowerCase();
  if (resolution && profile.resolutionValues?.includes(resolution)) body.resolution = resolution;
  if (profile.audio && typeof input.generateAudio === "boolean") body.generate_audio = input.generateAudio;
  const negative = String(input.negativePrompt || "").trim();
  if (negative && profile.negativePrompt) body.negative_prompt = negative;
  if (profile.cfgScale && typeof input.guidance === "number" && Number.isFinite(input.guidance)) body.cfg_scale = input.guidance;
  if (profile.promptOptimizer && typeof input.promptExpansion === "boolean") body.prompt_optimizer = input.promptExpansion;
  if (profile.seed && typeof input.seed === "number" && Number.isFinite(input.seed)) body.seed = input.seed;
  if (profile.safetyChecker && typeof input.safetyChecker === "boolean") body.enable_safety_checker = input.safetyChecker;
  return { endpoint, path: `/${endpoint}`, body };
}

export const falAdapter: StudioAdapter = {
  id: "fal",
  label: "Fal.ai",
  docs: "https://fal.ai/models/fal-ai/flux/dev/image-to-image",
  async generateImage(ctx, input) {
    const { allImageUrls, studioProxyJson } = await import("@/studio/generate/proxy");
    const planned = planFalImageRequest(input);
    const data = await studioProxyJson<{ images?: Array<{ url?: string }>; image?: { url?: string } }>({
      provider: ctx.provider,
      path: planned.path,
      authScheme: planned.authScheme,
      body: planned.body,
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    const url = urls[0] || data.images?.[0]?.url || data.image?.url || "";
    if (!url) throw new Error("Fal 没有返回图片");
    return { url, urls: urls.length ? urls : [url] };
  },
  async createVideo(ctx, input) {
    const { studioProxyJson } = await import("@/studio/generate/proxy");
    const planned = planFalVideoRequest(input);
    const data = await studioProxyJson<{ request_id?: string; status?: string }>({
      // queue.fal.run is a subdomain of the vault host fal.run; the relay
      // honors the hint only because of that (see resolveSameOriginBaseOverride).
      provider: { ...ctx.provider, baseUrlHint: true },
      baseUrl: FAL_QUEUE_BASE,
      path: planned.path,
      authScheme: "Key",
      body: planned.body,
      timeoutMs: 60_000,
    });
    const requestId = String(data.request_id || "").trim();
    if (!requestId) throw new Error(`Fal 视频没有返回 request_id：${JSON.stringify(data).slice(0, 200)}`);
    return { id: `${planned.endpoint}::${requestId}` };
  },
  async pollVideo(ctx, taskId) {
    const { studioProxyJson } = await import("@/studio/generate/proxy");
    const [endpoint, requestId] = String(taskId || "").split("::");
    if (!endpoint || !requestId) return { status: "failed", error: "Fal 视频任务 id 无效" };
    // 状态/结果走 app 命名空间根（submit 返回的 status_url/response_url 即此形态），
    // 用完整端点路径查状态会被 405 拒。命名空间 = 端点前两段（fal-ai/kling-video 等）。
    const namespace = falVideoQueueNamespace(endpoint);
    const status = await studioProxyJson<{ status?: string }>({
      provider: { ...ctx.provider, baseUrlHint: true },
      baseUrl: FAL_QUEUE_BASE,
      path: `/${namespace}/requests/${requestId}/status`,
      method: "GET",
      authScheme: "Key",
      timeoutMs: 30_000,
    }).catch((err) => ({ status: "", error: err instanceof Error ? err.message : String(err) }) as { status?: string; error?: string });
    const raw = String(status.status || "").toUpperCase();
    if (raw === "IN_QUEUE" || raw === "IN_PROGRESS") return { status: "pending" };
    if (raw !== "COMPLETED") {
      return { status: "failed", error: `Fal 视频任务失败：${raw || ("error" in status ? String(status.error) : "未知状态")}` };
    }
    const result = await studioProxyJson<{ video?: { url?: string } }>({
      provider: { ...ctx.provider, baseUrlHint: true },
      baseUrl: FAL_QUEUE_BASE,
      path: `/${namespace}/requests/${requestId}`,
      method: "GET",
      authScheme: "Key",
      timeoutMs: 30_000,
    });
    const url = String(result.video?.url || "").trim();
    if (!url) return { status: "failed", error: "Fal 视频完成但没有返回视频地址" };
    return { status: "completed", url };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 Fal Key" };
    return { ok: true, message: "已保存 Fal Key。生成时走 fal.run（视频走 queue.fal.run 队列），Authorization: Key。" };
  },
};
