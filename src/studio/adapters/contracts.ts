/** Official wire contracts. Register a new file here when adding an API. */

import { buildAgnesVideoBody } from "./agnes.ts";

export function isXaiImagineVideoModel(model: string) {
  return /grok-imagine-video/i.test(model.trim());
}

export function isXaiImagineImageModel(model: string) {
  return /grok-imagine-image/i.test(model.trim());
}

export function isArkSeedreamModel(model: string) {
  return /seedream/i.test(model.trim());
}

export function isArkSeedanceModel(model: string) {
  return /seedance/i.test(model.trim());
}

export function isOfficialXaiHost(baseUrl: string) {
  return hostnameOf(baseUrl) === "api.x.ai";
}

export function isOfficialOpenAiHost(baseUrl: string) {
  return hostnameOf(baseUrl) === "api.openai.com";
}

export const SAFE_IMAGE_REF_CAP = 5;
/** Official GPT Image JSON edits accept up to 16 references. Relay profiles keep SAFE_IMAGE_REF_CAP. */
export const OFFICIAL_OPENAI_IMAGE_REF_CAP = 16;
/** Official DashScope video tasks take 1–5 minutes; native image poll uses 10 minutes. */
export const DASHSCOPE_TASK_POLL_WINDOW_MS = 10 * 60_000;
export const DASHSCOPE_TASK_POLL_INTERVAL_MS = 15_000;
/** Studio UI wait loop for OpenAI / xAI / Ark single-GET polls. Official jobs regularly exceed 4 minutes. */
export const STUDIO_VIDEO_POLL_WINDOW_MS = 10 * 60_000;
export const STUDIO_VIDEO_POLL_INTERVAL_MS = 4_000;

export type XaiImagineVideoProfile = "official" | "relay";

export function openaiVideoWireKind(baseUrl?: string, protocol?: string) {
  if (isOfficialOpenAiHost(String(baseUrl || "")) || protocol === "openai-official") return "openai-official";
  return "openai-compat";
}

export function xaiVideoProfileFromHost(baseUrl?: string): XaiImagineVideoProfile {
  if (!baseUrl) return "official";
  return isOfficialXaiHost(baseUrl) ? "official" : "relay";
}

export type XaiImagineVideoRequest = {
  model: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  generateAudio?: boolean;
  image?: { url: string };
  last_frame_image?: { url: string };
  images?: Array<{ url: string }>;
  image_urls?: string[];
  reference_images?: Array<{ url: string }>;
  profile?: XaiImagineVideoProfile;
};

export function buildXaiImagineVideoBody(input: XaiImagineVideoRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
  };
  if (typeof input.duration === "number" && Number.isFinite(input.duration)) body.duration = input.duration;
  if (input.aspect_ratio) body.aspect_ratio = input.aspect_ratio;
  if (input.resolution) body.resolution = input.resolution;
  if (typeof input.generateAudio === "boolean") body.generate_audio = input.generateAudio;

  const first = String(input.image?.url || "").trim();
  const last = String(input.last_frame_image?.url || "").trim();
  const listed = [
    ...(input.reference_images || []).map((item) => item?.url),
    ...(input.images || []).map((item) => item?.url),
    ...(input.image_urls || []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const extras = Array.from(new Set(listed.filter((url) => url !== first)));

  if ((input.profile || "official") === "relay") {
    if (first) body.image = { url: first };
    if (last && last !== first) body.last_frame_image = { url: last };
    const urls = Array.from(new Set([first, ...extras, last].filter(Boolean)));
    if (urls.length && (extras.length || last)) body.image_urls = urls;
    return body;
  }

  if (last) {
    throw new Error("xAI 官方视频没有静帧尾帧字段。延长请走 POST /v1/videos/extensions。");
  }
  if (first && extras.length) {
    throw new Error("xAI 官方视频 I2V（image）与 R2V（reference_images）互斥，不能同时发送。");
  }
  if (first) body.image = { url: first };
  else if (extras.length) body.reference_images = extras.map((url) => ({ url }));
  return body;
}

export function xaiImagineCreatePath() {
  return "/videos/generations";
}

export function xaiImaginePollPath(requestId: string) {
  return `/videos/${encodeURIComponent(requestId)}`;
}

export function readXaiImagineRequestId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return String(record.request_id || record.id || "").trim();
}

export function readXaiImaginePoll(data: unknown): { status: "pending" | "completed" | "failed"; url?: string; error?: string } {
  if (!data || typeof data !== "object") return { status: "failed", error: "视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  const video = record.video && typeof record.video === "object" ? (record.video as Record<string, unknown>) : undefined;
  const url = String(video?.url || record.video_url || record.url || "").trim();
  if (status === "done" || status === "completed" || status === "succeeded" || status === "success") {
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有返回地址" };
  }
  if (status === "failed" || status === "expired" || status === "cancelled" || status === "canceled") {
    return { status: "failed", error: readProviderError(record) || `视频生成${status}` };
  }
  return { status: "pending" };
}

export type ArkImageRequest = {
  model: string;
  prompt: string;
  size?: string;
  watermark?: boolean;
  output_format?: string;
};

export function buildArkImageBody(input: ArkImageRequest): Record<string, unknown> {
  return {
    model: input.model,
    prompt: input.prompt,
    size: input.size || "2K",
    watermark: input.watermark === true,
    output_format: input.output_format || "png",
  };
}

export function buildArkImageGenerationBody(input: {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  image?: string[];
  watermark?: boolean;
  output_format?: string;
}): Record<string, unknown> {
  const n = typeof input.n === "number" && input.n > 1 ? input.n : undefined;
  return {
    model: input.model,
    prompt: input.prompt,
    size: input.size || "2K",
    watermark: input.watermark === true ? true : false,
    output_format: input.output_format || "png",
    response_format: "url",
    ...(n
      ? {
          sequential_image_generation: "auto",
          sequential_image_generation_options: { max_images: n },
        }
      : {}),
    ...(input.image?.length ? { image: input.image } : {}),
  };
}

export function arkImageCreatePath() {
  return "/images/generations";
}

export function arkVideoCreatePath() {
  return "/contents/generations/tasks";
}

export function arkVideoPollPath(taskId: string) {
  return `/contents/generations/tasks/${encodeURIComponent(taskId)}`;
}

export function buildArkVideoBody(input: {
  model: string;
  prompt: string;
  duration?: number;
  ratio?: string;
  generateAudio?: boolean;
  watermark?: boolean;
  imageUrl?: string;
  lastFrameUrl?: string;
  imageUrls?: string[];
  resolution?: string;
}): Record<string, unknown> {
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  const extras = (input.imageUrls || [])
    .map((url) => String(url || "").trim())
    .filter((url) => url && url !== first && url !== last);
  const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
  if (first && last) {
    content.push({ type: "image_url", image_url: { url: first }, role: "first_frame" });
    content.push({ type: "image_url", image_url: { url: last }, role: "last_frame" });
  } else if (first) {
    content.push({ type: "image_url", image_url: { url: first } });
  } else if (last) {
    content.push({ type: "image_url", image_url: { url: last }, role: "last_frame" });
  } else {
    for (const url of extras) {
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    }
  }
  return {
    model: input.model,
    content,
    ...(finiteNumber(input.duration) !== undefined ? { duration: input.duration } : {}),
    ...(input.ratio ? { ratio: input.ratio } : {}),
    ...(typeof input.generateAudio === "boolean" ? { generate_audio: input.generateAudio } : {}),
    ...(typeof input.watermark === "boolean" ? { watermark: input.watermark } : {}),
  };
}

export function readArkVideoTaskId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  return String((data as { id?: string }).id || "").trim();
}

export type StudioVideoWirePayload = {
  prompt: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
  fps?: number;
  generateAudio?: boolean;
  negative_prompt?: string;
  first_frame?: string;
  last_frame?: string;
  image_urls?: string[];
  operation?: string;
};

const CIVITAI_LTX_VIDEO_SIZE_BY_RATIO: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
};

const CIVITAI_HUNYUAN_VIDEO_SIZE_BY_RATIO: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 480, height: 854 },
  "1:1": { width: 480, height: 480 },
};

function civitaiWorkflowBody(input: Record<string, unknown>) {
  return {
    allowMatureContent: true,
    currencies: ["yellow"],
    steps: [{ $type: "videoGen", input }],
  };
}

function civitaiCustomerOperation(value: unknown): "text" | "image" | "firstLast" | "create" | undefined {
  const operation = String(value || "").trim().toLowerCase().replaceAll("_", "-");
  if (!operation) return undefined;
  if (operation === "text-to-video" || operation === "texttovideo") return "text";
  if (operation === "image-to-video" || operation === "imagetovideo") return "image";
  if (
    operation === "first-last-frame-to-video" ||
    operation === "first-last-frame" ||
    operation === "firstlastframetovideo"
  ) return "firstLast";
  if (operation === "createvideo" || operation === "create-video") return "create";
  throw new Error(`Civitai customer 视频 operation ${String(value)} 未经过官方合同验证，已停止提交`);
}

function civitaiVideoSize(model: string, ratio?: string) {
  const normalizedRatio = String(ratio || "").trim().replace(/\s+/g, "");
  const sizes = model === "hunyuan" ? CIVITAI_HUNYUAN_VIDEO_SIZE_BY_RATIO : CIVITAI_LTX_VIDEO_SIZE_BY_RATIO;
  if (!normalizedRatio) return sizes["16:9"]!;
  const size = sizes[normalizedRatio];
  if (!size) throw new Error(`Civitai ${model} 视频画幅 ${normalizedRatio} 未经过官方合同验证，已停止提交`);
  return size;
}

export function buildCivitaiCustomerVideoBody(model: string, payload: StudioVideoWirePayload): Record<string, unknown> {
  const normalizedModel = String(model || "").trim().toLowerCase();
  const first = String(payload.first_frame || "").trim();
  const last = String(payload.last_frame || "").trim();
  const extraReferences = (payload.image_urls || [])
    .map((url) => String(url || "").trim())
    .filter(Boolean);
  if (extraReferences.length) {
    throw new Error("Civitai customer 视频不接受未标注的 image_urls；不会猜测普通参考图的官方字段");
  }
  if (last && !first) throw new Error("Civitai 视频尾帧必须与首帧同时提交；不会用单独尾帧冒充首尾帧");
  if (first && last && first === last) throw new Error("Civitai 视频首帧与尾帧不能相同；不会重复提交同一张图片");

  const requestedOperation = civitaiCustomerOperation(payload.operation);
  if (normalizedModel === "ltx2.3") {
    if (requestedOperation === "text" && (first || last)) {
      throw new Error("Civitai LTX text-to-video 不接受首帧或尾帧");
    }
    if (requestedOperation === "image" && (!first || last)) {
      throw new Error("Civitai LTX image-to-video 需要且仅需要一张首帧");
    }
    if (requestedOperation === "firstLast" && (!first || !last)) {
      throw new Error("Civitai LTX firstLastFrameToVideo 需要首帧和尾帧");
    }
    if (requestedOperation === "create" && last) {
      throw new Error("Civitai LTX createVideo 不接受尾帧；请使用 firstLastFrameToVideo");
    }

    const input: Record<string, unknown> = {
      engine: "ltx2.3",
      operation: first && last ? "firstLastFrameToVideo" : "createVideo",
      model: "22b-distilled",
      prompt: payload.prompt,
      duration: finiteNumber(payload.duration) || 5,
      ...civitaiVideoSize("ltx2.3", payload.ratio),
      fps: finiteNumber(payload.fps) || 24,
      ...(typeof payload.generateAudio === "boolean" ? { generateAudio: payload.generateAudio } : {}),
    };
    if (first && last) {
      input.firstFrame = first;
      input.lastFrame = last;
    } else if (first) {
      input.images = [first];
    }
    return civitaiWorkflowBody(input);
  }

  if (normalizedModel === "hunyuan") {
    if (requestedOperation && requestedOperation !== "text") {
      throw new Error("Civitai Hunyuan 仅验证了 text-to-video，不接受当前 operation");
    }
    if (first || last) throw new Error("Civitai Hunyuan 是纯文本生视频，不接受首帧或尾帧");
    return civitaiWorkflowBody({
      engine: "hunyuan",
      prompt: payload.prompt,
      duration: finiteNumber(payload.duration) || 5,
      ...civitaiVideoSize("hunyuan", payload.ratio),
      frameRate: finiteNumber(payload.fps) || 25,
      cfgScale: 4,
    });
  }

  throw new Error(`未知 Civitai 视频模型：${model || "(empty)"}，不会 fallback 到 customer compatibility wire`);
}

export function toStudioVideoWire(
  adapter: string,
  model: string,
  payload: StudioVideoWirePayload,
  options?: { baseUrl?: string; protocol?: string; profile?: XaiImagineVideoProfile },
): Record<string, unknown> {
  if (adapter === "civitai") return buildCivitaiCustomerVideoBody(model, payload);
  if (adapter === "xai-imagine") {
    return buildXaiImagineVideoBody({
      model,
      prompt: payload.prompt,
      duration: payload.duration,
      aspect_ratio: payload.ratio,
      resolution: payload.resolution,
      generateAudio: payload.generateAudio,
      image: payload.first_frame ? { url: payload.first_frame } : undefined,
      last_frame_image: payload.last_frame ? { url: payload.last_frame } : undefined,
      image_urls: payload.image_urls,
      profile: options?.profile || xaiVideoProfileFromHost(options?.baseUrl),
    });
  }
  if (adapter === "ark-plan") {
    return buildArkVideoBody({
      model,
      prompt: payload.prompt,
      duration: payload.duration,
      ratio: payload.ratio,
      generateAudio: payload.generateAudio,
      imageUrl: payload.first_frame,
      lastFrameUrl: payload.last_frame,
      imageUrls: payload.image_urls,
      resolution: payload.resolution,
    });
  }
  if (adapter === "dashscope") {
    return buildDashscopeVideoBody({
      model,
      prompt: payload.prompt,
      duration: payload.duration,
      ratio: payload.ratio,
      resolution: payload.resolution,
      fps: payload.fps,
      generateAudio: payload.generateAudio,
      negativePrompt: payload.negative_prompt,
      imageUrl: payload.first_frame,
      lastFrameUrl: payload.last_frame,
      imageUrls: payload.image_urls,
    });
  }
  if (adapter === "agnes") {
    return buildAgnesVideoBody({
      model,
      prompt: payload.prompt,
      duration: payload.duration,
      aspectRatio: payload.ratio,
      resolution: payload.resolution,
      imageUrl: payload.first_frame,
      lastFrameUrl: payload.last_frame,
      imageUrls: payload.image_urls,
      generateAudio: payload.generateAudio,
      fps: payload.fps,
      negativePrompt: payload.negative_prompt,
    });
  }
  if (adapter === "fal") {
    throw new Error("Fal 视频未接线：Studio 已支持生图，视频未实现，不能按 openai-compat 发送 /videos。");
  }
  if (adapter === "openai-official" || openaiVideoWireKind(options?.baseUrl, options?.protocol) === "openai-official") {
    return buildOpenAiOfficialVideoBody({
      model,
      prompt: payload.prompt,
      duration: payload.duration,
      size: payload.resolution,
      first_frame: payload.first_frame,
      last_frame: payload.last_frame,
      image_urls: payload.image_urls,
      fps: payload.fps,
      generateAudio: payload.generateAudio,
      negative_prompt: payload.negative_prompt,
      ratio: payload.ratio,
    });
  }
  return {
    model,
    prompt: payload.prompt,
    ...(finiteNumber(payload.duration) !== undefined ? { duration: payload.duration } : {}),
    ...(payload.ratio ? { ratio: payload.ratio, aspect_ratio: payload.ratio } : {}),
    ...(payload.resolution ? { resolution: payload.resolution } : {}),
    ...(finiteNumber(payload.fps) !== undefined ? { fps: payload.fps } : {}),
    ...(typeof payload.generateAudio === "boolean" ? { generate_audio: payload.generateAudio } : {}),
    ...(payload.negative_prompt ? { negative_prompt: payload.negative_prompt } : {}),
    ...(payload.first_frame ? { image: { url: payload.first_frame } } : {}),
    ...(payload.last_frame ? { last_frame: payload.last_frame, last_frame_image: { url: payload.last_frame } } : {}),
    ...(payload.image_urls?.length ? { image_urls: payload.image_urls.filter(Boolean) } : {}),
  };
}

const WAN26_SIZE_BY_RATIO: Record<string, Record<string, string>> = {
  "720P": { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960", "4:3": "1088*832", "3:4": "832*1088" },
  "1080P": { "16:9": "1920*1080", "9:16": "1080*1920", "1:1": "1440*1440", "4:3": "1632*1248", "3:4": "1248*1632" },
};

export function buildDashscopeVideoBody(input: {
  model: string;
  prompt: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
  fps?: number;
  generateAudio?: boolean;
  negativePrompt?: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  imageUrls?: string[];
}): Record<string, unknown> {
  void input.fps;
  const family = dashscopeVideoFamily(input.model);
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  const extras = (input.imageUrls || [])
    .map((item) => String(item || "").trim())
    .filter((url) => url && url !== first && url !== last);
  const duration = finiteNumber(input.duration);
  const resolution = normalizeDashscopeVideoResolution(input.resolution);
  const ratio = String(input.ratio || "").trim();
  const negative = String(input.negativePrompt || "").trim();

  if (family === "wan26") {
    const i2v = /i2v/i.test(input.model);
    if (i2v && last) {
      throw new Error(
        `DashScope ${input.model} 不支持尾帧 lastFrameUrl；官方 Wan2.6 I2V 仅支持首帧 input.img_url，请切换到支持首尾帧的 wan2.7-i2v。`,
      );
    }
    return {
      model: input.model,
      input: {
        prompt: input.prompt,
        ...(i2v && first ? { img_url: first } : {}),
      },
      parameters: {
        ...(duration !== undefined ? { duration } : {}),
        ...(i2v ? (resolution ? { resolution } : {}) : ratio ? { size: wan26Size(ratio, resolution) } : {}),
        ...(negative ? { negative_prompt: negative } : {}),
      },
    };
  }

  if (family === "happyhorse") {
    const refs = Array.from(new Set([first, ...extras, last].filter(Boolean)));
    return {
      model: input.model,
      input: {
        prompt: input.prompt,
        ...(refs.length ? { media: refs.map((url) => ({ type: "reference_image", url })) } : {}),
      },
      parameters: {
        ...(duration !== undefined ? { duration } : {}),
        ...(ratio ? { ratio } : {}),
        ...(resolution ? { resolution } : {}),
      },
    };
  }

  if (family === "wan27") {
    const i2v = /i2v/i.test(input.model) || Boolean(first || last);
    const media = i2v ? dashscopeFrameMedia(first, last) : [];
    return {
      model: input.model,
      input: {
        prompt: input.prompt,
        ...(media.length ? { media } : {}),
        ...(negative ? { negative_prompt: negative } : {}),
      },
      parameters: {
        ...(duration !== undefined ? { duration } : {}),
        ...(!i2v && ratio ? { ratio } : {}),
        ...(resolution ? { resolution } : {}),
      },
    };
  }

  const frameMedia = dashscopeFrameMedia(first, last);
  const refMedia = extras.map((url) => ({ type: "reference_image" as const, url }));
  const media = frameMedia.length ? frameMedia : refMedia;
  return {
    model: input.model,
    input: {
      prompt: input.prompt,
      ...(media.length ? { media } : {}),
      ...(negative ? { negative_prompt: negative } : {}),
    },
    parameters: {
      ...(duration !== undefined ? { duration } : {}),
      ...(ratio ? { ratio } : {}),
      ...(resolution ? { resolution } : {}),
    },
  };
}

export function dashscopeNativeApiHost(baseUrl: string) {
  const trimmed = String(baseUrl || "").trim();
  try {
    const url = new URL(trimmed);
    if (/token-plan/i.test(url.hostname)) return url.origin;
    if (/\.maas\.aliyuncs\.com$/i.test(url.hostname)) return url.origin;
    if (/(^|\.)dashscope\.aliyuncs\.com$/i.test(url.hostname)) return `${url.protocol}//${url.host}`;
    if (url.hostname) return url.origin;
  } catch {
    /* fall through */
  }
  return "https://dashscope.aliyuncs.com";
}

export function buildDashscopeImageRequest(input: {
  model: string;
  prompt: string;
  imageUrls?: string[];
  negativePrompt?: string;
  seed?: number;
  n?: number;
  size?: string;
  aspectRatio?: string;
}): { path: string; async: boolean; body: Record<string, unknown> } {
  const model = input.model.trim();
  const refs = (input.imageUrls || []).map((url) => String(url || "").trim()).filter(Boolean);
  const negative = String(input.negativePrompt || "").trim();
  const seed = typeof input.seed === "number" && Number.isFinite(input.seed) ? input.seed : undefined;
  const n = input.n || 1;

  if (isDashscopeMultimodalImage(model)) {
    const size = dashscopeMultimodalImageSize(model, input.size, input.aspectRatio);
    return {
      path: "/api/v1/services/aigc/multimodal-generation/generation",
      async: false,
      body: {
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [...refs.map((image) => ({ image })), { text: input.prompt }],
            },
          ],
        },
        parameters: {
          watermark: false,
          prompt_extend: true,
          n,
          ...(size ? { size } : {}),
          ...(negative ? { negative_prompt: negative } : {}),
          ...(seed !== undefined ? { seed } : {}),
        },
      },
    };
  }

  if (refs.length && isDashscopeLegacyI2I(model)) {
    return {
      path: "/api/v1/services/aigc/image2image/image-synthesis",
      async: true,
      body: {
        model,
        input: {
          prompt: input.prompt,
          images: refs,
          ...(negative ? { negative_prompt: negative } : {}),
        },
        parameters: {
          prompt_extend: true,
          n,
          ...(seed !== undefined ? { seed } : {}),
        },
      },
    };
  }

  const wanx = isWanxV1(model);
  return {
    path: "/api/v1/services/aigc/text2image/image-synthesis",
    async: true,
    body: {
      model,
      input: {
        prompt: input.prompt,
        ...(negative ? { negative_prompt: negative } : {}),
        ...(refs[0] && wanx ? { ref_image: refs[0] } : {}),
      },
      parameters: {
        n,
        size: wanx ? wanxV1Size(input.size) : input.size === "3K" ? "1440*1440" : "1280*1280",
        ...(seed !== undefined ? { seed } : {}),
        ...(refs[0] && wanx ? { ref_strength: 0.7, ref_mode: "repaint" } : {}),
      },
    },
  };
}

export function buildOpenAiOfficialVideoBody(input: {
  model: string;
  prompt: string;
  duration?: number;
  size?: string;
  first_frame?: string;
  last_frame?: string;
  image_urls?: string[];
  fps?: number;
  generateAudio?: boolean;
  negative_prompt?: string;
  ratio?: string;
}): Record<string, unknown> {
  const seconds = officialOpenAiVideoSeconds(input.duration);
  const first = String(input.first_frame || "").trim();
  const last = String(input.last_frame || "").trim();
  if (last) {
    throw new Error(
      "OpenAI 官方 Videos 不支持 last_frame；input_reference 只能作为视频首帧。请移除尾帧或切换到支持首尾帧的 provider/model。",
    );
  }
  const size = officialOpenAiVideoSize(input.size, input.ratio);
  return {
    model: input.model,
    prompt: input.prompt,
    ...(seconds ? { seconds } : {}),
    ...(size ? { size } : {}),
    ...(first ? { input_reference: { image_url: first } } : {}),
  };
}

export function buildOpenAiOfficialImageBody(input: {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  seed?: number;
  negativePrompt?: string;
  imageUrls?: string[];
  maskUrl?: string;
  operation?: "generate" | "edit";
}): Record<string, unknown> {
  const refs = (input.imageUrls || []).map((url) => String(url || "").trim()).filter(Boolean);
  const editing = input.operation === "edit" || refs.length > 0;
  return {
    model: input.model,
    prompt: input.prompt,
    n: input.n || 1,
    ...(input.size ? { size: input.size } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    ...(editing
      ? {
          images: refs.map((url) => ({ image_url: url })),
          ...(input.maskUrl ? { mask: { image_url: input.maskUrl } } : {}),
        }
      : {}),
  };
}

export function sniffMedia(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio/mpeg";
  if (bytes.length >= 10 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41) return "audio/wav";
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "audio/ogg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
  return "";
}

export function assertRefCount(count: number, max = SAFE_IMAGE_REF_CAP) {
  if (count > max) {
    throw new Error(`该模型最多 ${max} 张参考图，当前 ${count} 张。请先去掉多余的参考再生成。`);
  }
}

export function studioEndpoint(
  endpoints: { chat?: string; images?: string; videosCreate?: string; videosPoll?: string; audio?: string } | undefined,
  key: "chat" | "images" | "videosCreate" | "videosPoll" | "audio",
  fallback: string,
  id?: string,
) {
  let path = String(endpoints?.[key] || fallback).trim() || fallback;
  const absolute = /^https?:\/\//i.test(path);
  if (!absolute && !path.startsWith("/")) path = `/${path}`;
  if (id !== undefined) path = path.replace(/\{id\}/g, encodeURIComponent(id));
  return path;
}

const CIVITAI_CUSTOMER_VIDEO_CREATE_PATH = "/workflows?wait=0";

export function officialAwareVideoCreatePath(
  adapter: string,
  endpoints?: { videosCreate?: string },
  options?: { baseUrl?: string; protocol?: string },
) {
  if (adapter === "civitai") return CIVITAI_CUSTOMER_VIDEO_CREATE_PATH;
  if (adapter === "openai-official" || openaiVideoWireKind(options?.baseUrl, options?.protocol) === "openai-official") return "/videos";
  if (adapter === "agnes") return "/videos";
  if (adapter === "xai-imagine" && isOfficialXaiHost(String(options?.baseUrl || ""))) return "/videos/generations";
  if (endpoints?.videosCreate) return studioEndpoint(endpoints, "videosCreate", endpoints.videosCreate);
  if (adapter === "ark-plan") return "/contents/generations/tasks";
  if (adapter === "dashscope") return "/api/v1/services/aigc/video-generation/video-synthesis";
  return "/videos/generations";
}

/** Live Studio openai-compat.createVideo path+body. Official host must match officialAwareVideoCreatePath. */
export function planOpenAiCompatCreateVideo(input: {
  model: string;
  prompt: string;
  duration?: number;
  ratio?: string;
  resolution?: string;
  fps?: number;
  generateAudio?: boolean;
  negative_prompt?: string;
  first_frame?: string;
  last_frame?: string;
  image_urls?: string[];
  baseUrl?: string;
  protocol?: string;
  endpoints?: { videosCreate?: string; videosPoll?: string }
}) {
  const adapter = openaiVideoWireKind(input.baseUrl, input.protocol);
  return {
    path: officialAwareVideoCreatePath("openai-compat", input.endpoints, {
      baseUrl: input.baseUrl,
      protocol: input.protocol,
    }),
    body: toStudioVideoWire(
      adapter,
      input.model,
      {
        prompt: input.prompt,
        duration: input.duration,
        ratio: input.ratio,
        resolution: input.resolution,
        fps: input.fps,
        generateAudio: input.generateAudio,
        negative_prompt: input.negative_prompt,
        first_frame: input.first_frame,
        last_frame: input.last_frame,
        image_urls: input.image_urls,
      },
      { baseUrl: input.baseUrl, protocol: input.protocol },
    ),
  };
}

export function agnesVideoPollPath(taskId: string) {
  return `/agnesapi?video_id=${encodeURIComponent(taskId)}`;
}

export function videoPollPath(
  adapter: string,
  taskId: string,
  endpoints?: { videosPoll?: string },
  options?: { baseUrl?: string; protocol?: string },
) {
  if (adapter === "agnes") return agnesVideoPollPath(taskId);
  if (adapter === "civitai") return `/workflows/${encodeURIComponent(taskId)}?wait=0`;
  if (openaiVideoWireKind(options?.baseUrl, options?.protocol) === "openai-official") {
    return `/videos/${encodeURIComponent(taskId)}`;
  }
  if (adapter === "xai-imagine" && isOfficialXaiHost(String(options?.baseUrl || ""))) {
    return xaiImaginePollPath(taskId);
  }
  if (endpoints?.videosPoll) return studioEndpoint(endpoints, "videosPoll", endpoints.videosPoll, taskId);
  if (adapter === "ark-plan") return arkVideoPollPath(taskId);
  if (adapter === "xai-imagine") return xaiImaginePollPath(taskId);
  if (adapter === "dashscope") return `/api/v1/tasks/${encodeURIComponent(taskId)}`;
  return `/videos/${encodeURIComponent(taskId)}`;
}

type CustomerVideoTaskWire = {
  status?: string;
  file_urls?: string[];
  files?: string[];
  content?: { video_url?: string } | null;
  result?: string;
  url?: string;
  video_url?: string;
  video?: { url?: string } | null;
  steps?: unknown[];
};

function customerVideoTaskHasFileUrl(task?: CustomerVideoTaskWire) {
  if (task?.file_urls?.some((item) => String(item || "").trim())) return true;
  if (task?.files?.some((item) => String(item || "").trim())) return true;
  if (String(task?.content?.video_url || "").trim()) return true;
  if (String(task?.video?.url || "").trim()) return true;
  if (String(task?.url || task?.video_url || "").trim()) return true;
  const result = String(task?.result || "").trim();
  return /^(https?:|blob:|asset:\/\/)/i.test(result) || result.startsWith("/") || /\.(mp4|mov|webm|m3u8)(\?|#|$)/i.test(result);
}

/** Official Civitai workflow video output is steps[].output.video (a blob). */
export function readCivitaiCustomerVideoBlob(data: unknown): { id?: string; url?: string } | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const steps = (data as { steps?: unknown[] }).steps;
  if (!Array.isArray(steps)) return undefined;
  for (const step of steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const output = (step as { output?: unknown }).output;
    if (!output || typeof output !== "object" || Array.isArray(output)) continue;
    const outputRecord = output as Record<string, unknown>;
    const candidates = [
      outputRecord.video,
      ...(Array.isArray(outputRecord.additionalVideos) ? outputRecord.additionalVideos : []),
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const blob = candidate as { id?: unknown; url?: unknown; available?: unknown };
      if (blob.available === false) continue;
      const id = String(blob.id || "").trim();
      const url = String(blob.url || "").trim();
      if (id || url) return { ...(id ? { id } : {}), ...(url ? { url } : {}) };
    }
  }
  return undefined;
}

function exposeCivitaiCustomerVideoUrl(task: CustomerVideoTaskWire | undefined, url: string) {
  if (!task || !url || typeof task !== "object") return;
  const record = task as CustomerVideoTaskWire & Record<string, unknown>;
  const existing = Array.isArray(record.file_urls)
    ? record.file_urls.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  record.file_urls = Array.from(new Set([...existing, url]));
  const content = record.content && typeof record.content === "object" ? record.content : {};
  record.content = { ...content, video_url: url };
}

const CIVITAI_CUSTOMER_VIDEO_SUCCESS_STATUSES = new Set(["completed", "succeeded", "success", "done"]);
const CIVITAI_CUSTOMER_VIDEO_FAILURE_STATUSES = new Set(["failed", "expired", "cancelled", "canceled", "error"]);

export function planCustomerVideoContentFetch(input: {
  adapter?: string;
  adapterType?: string;
  model?: string;
  baseUrl?: string;
  protocol?: string;
  taskId: string;
  task?: CustomerVideoTaskWire;
}) {
  const adapter = customerVideoWireAdapter(input);
  const status = String(input.task?.status || "").trim().toLowerCase();
  if (adapter === "civitai") {
    if (CIVITAI_CUSTOMER_VIDEO_FAILURE_STATUSES.has(status)) return null;
    if (customerVideoTaskHasFileUrl(input.task)) return null;
    if (status && !CIVITAI_CUSTOMER_VIDEO_SUCCESS_STATUSES.has(status)) return null;
    const blob = readCivitaiCustomerVideoBlob(input.task);
    if (!blob) return null;
    if (blob.url) exposeCivitaiCustomerVideoUrl(input.task, blob.url);
    const taskId = String(input.taskId || "").trim();
    if (!taskId || !blob.id) return null;
    return {
      method: "GET" as const,
      path: `/blobs/${encodeURIComponent(blob.id)}?workflowId=${encodeURIComponent(taskId)}`,
    };
  }
  if (openaiVideoWireKind(input.baseUrl, input.protocol) !== "openai-official") return null;
  if (!CIVITAI_CUSTOMER_VIDEO_SUCCESS_STATUSES.has(status)) return null;
  if (customerVideoTaskHasFileUrl(input.task)) return null;
  const taskId = String(input.taskId || "").trim();
  if (!taskId) return null;
  return { method: "GET" as const, path: `/videos/${encodeURIComponent(taskId)}/content` };
}

export function attachOfficialOpenAiVideoContent<T>(
  task: T,
  content: { url?: string; video?: { url?: string } },
): T & { file_urls: string[]; content: { video_url: string } } {
  const record = (task && typeof task === "object" ? task : {}) as T & { file_urls?: string[]; content?: { video_url?: string } | null };
  const url = String(content.url || content.video?.url || "").trim();
  if (!url) return record as T & { file_urls: string[]; content: { video_url: string } };
  const file_urls = Array.from(new Set([...(record.file_urls || []), url].filter((item) => String(item || "").trim())));
  return {
    ...record,
    file_urls,
    content: { ...(record.content && typeof record.content === "object" ? record.content : {}), video_url: url },
  };
}

export function customerVideoWireAdapter(input: {
  adapter?: string;
  adapterType?: string;
  model?: string;
  baseUrl?: string;
  protocol?: string;
}) {
  const named = String(input.adapterType || input.adapter || "").toLowerCase();
  if (named === "ark" || named === "ark-plan") return "ark-plan";
  if (named === "xai-imagine" || named === "xai") return "xai-imagine";
  if (named === "dashscope") return "dashscope";
  if (named === "agnes") return "agnes";
  if (named === "fal") return "fal";
  if (named === "civitai" || named === "civitai-orchestration") return "civitai";
  if (named === "openai" || named === "openai-compat" || named === "openai-official") return "openai-compat";
  const protocol = String(input.protocol || "").toLowerCase();
  if (protocol === "civitai" || protocol === "civitai-orchestration") return "civitai";
  const host = hostnameOf(String(input.baseUrl || ""));
  if (host === "orchestration.civitai.com" || host.endsWith(".civitai.com")) return "civitai";
  const model = String(input.model || "");
  if (/grok-imagine/i.test(model)) return "xai-imagine";
  if (/seedream|seedance/i.test(model)) return "ark-plan";
  const rawBaseUrl = String(input.baseUrl || "").toLowerCase();
  if (rawBaseUrl.includes("volces.com") || rawBaseUrl.includes("/api/plan/v3")) return "ark-plan";
  if (rawBaseUrl.includes("x.ai")) return "xai-imagine";
  if (rawBaseUrl.includes("dashscope") || rawBaseUrl.includes("aliyuncs.com")) return "dashscope";
  if (rawBaseUrl.includes("agnes-ai.com")) return "agnes";
  if (rawBaseUrl.includes("fal.run") || rawBaseUrl.includes("fal.ai")) return "fal";
  return "openai-compat";
}

export function buildCustomerVideoStudioRequest(input: {
  adapterType?: string;
  model?: string;
  baseUrl?: string;
  protocol?: string;
  endpoints?: { videosCreate?: string; videosPoll?: string };
} & StudioVideoWirePayload) {
  const adapter = customerVideoWireAdapter(input);
  const options = { baseUrl: input.baseUrl, protocol: input.protocol };
  return {
    adapter,
    path: officialAwareVideoCreatePath(adapter, input.endpoints, options),
    body: toStudioVideoWire(
      adapter,
      input.model || "",
      {
        prompt: input.prompt,
        duration: input.duration,
        ratio: input.ratio,
        resolution: input.resolution,
        fps: input.fps,
        generateAudio: input.generateAudio,
        negative_prompt: input.negative_prompt,
        first_frame: input.first_frame,
        last_frame: input.last_frame,
        image_urls: input.image_urls,
        operation: input.operation,
      },
      options,
    ),
  };
}

export function readArkVideoPoll(data: unknown): { status: "pending" | "completed" | "failed"; url?: string; error?: string } {
  if (!data || typeof data !== "object") return { status: "failed", error: "视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  const content = record.content && typeof record.content === "object" ? (record.content as Record<string, unknown>) : undefined;
  const url = String(content?.video_url || record.video_url || record.url || "").trim();
  if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有返回地址" };
  }
  if (status === "failed" || status === "expired" || status === "cancelled" || status === "canceled") {
    return { status: "failed", error: readProviderError(record) || `视频生成${status}` };
  }
  return { status: "pending" };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hostnameOf(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function readProviderError(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const err = record.error;
  if (err && typeof err === "object") return String((err as { message?: string }).message || "").trim();
  return String(err || record.message || "").trim();
}

export function readOpenAiCompatPoll(
  data: unknown,
  official: boolean,
): { status: "pending" | "completed" | "failed"; url?: string; error?: string; needsContent?: boolean } {
  if (!data || typeof data !== "object") return { status: "failed", error: "视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  if (["failed", "expired", "cancelled", "canceled"].includes(status)) {
    return { status: "failed", error: readProviderError(record) || status };
  }
  if (official) {
    if (!["completed", "succeeded", "success", "done"].includes(status)) return { status: "pending" };
    return { status: "completed", needsContent: true };
  }
  const video = record.video && typeof record.video === "object" ? (record.video as Record<string, unknown>) : undefined;
  const url = String(video?.url || record.video_url || record.url || "").trim();
  if (["done", "completed", "succeeded", "success"].includes(status) || url) {
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有地址" };
  }
  return { status: "pending" };
}

const OFFICIAL_OPENAI_VIDEO_SECONDS = [4, 8, 12] as const;

/** API ref enum is 4|8|12. Non-enum values map to the nearest; ties round toward 8. */
export function officialOpenAiVideoSeconds(duration?: number) {
  const n = finiteNumber(duration);
  if (n === undefined) return undefined;
  if ((OFFICIAL_OPENAI_VIDEO_SECONDS as readonly number[]).includes(n)) return String(n);
  let best: (typeof OFFICIAL_OPENAI_VIDEO_SECONDS)[number] = 8;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of OFFICIAL_OPENAI_VIDEO_SECONDS) {
    const score = Math.abs(n - candidate) * 1000 + Math.abs(candidate - 8);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return String(best);
}

const OFFICIAL_OPENAI_VIDEO_SIZES = ["720x1280", "1280x720", "1024x1792", "1792x1024"] as const;

function officialOpenAiVideoSize(size?: string, ratio?: string) {
  const raw = String(size || "").trim();
  if (/^\d+x\d+$/i.test(raw)) {
    const hit = OFFICIAL_OPENAI_VIDEO_SIZES.find((item) => item.toLowerCase() === raw.toLowerCase());
    return hit || "";
  }
  const tier = raw.toLowerCase().replace(/p$/, "");
  const aspect = String(ratio || "").trim();
  if (tier === "720" || raw.toUpperCase() === "720P" || !raw) {
    if (aspect === "9:16") return "720x1280";
    if (aspect === "16:9") return "1280x720";
    if (aspect === "3:4") return "1024x1792";
    if (aspect === "4:3") return "1792x1024";
    if (!raw) return "";
    return "1280x720";
  }
  return "";
}

function dashscopeVideoFamily(model: string): "wan26" | "wan27" | "wan3" | "happyhorse" {
  const key = model.toLowerCase();
  if (key.includes("happyhorse")) return "happyhorse";
  if (/wan3/.test(key)) return "wan3";
  if (/wan2\.6|wan2-6/.test(key)) return "wan26";
  return "wan27";
}

function dashscopeFrameMedia(first: string, last: string) {
  const media: Array<{ type: string; url: string }> = [];
  if (first) media.push({ type: "first_frame", url: first });
  if (last && last !== first) media.push({ type: "last_frame", url: last });
  return media;
}

function normalizeDashscopeVideoResolution(value?: string) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "480" || raw === "480P") return "480P";
  if (raw === "720" || raw === "720P") return "720P";
  if (raw === "1080" || raw === "1080P") return "1080P";
  return "";
}

function wan26Size(ratio: string, resolution: string) {
  const tier = resolution === "1080P" ? "1080P" : "720P";
  const aspect = ratio || "16:9";
  return WAN26_SIZE_BY_RATIO[tier][aspect] || WAN26_SIZE_BY_RATIO[tier]["16:9"];
}

function isWanxV1(model: string) {
  return /^wanx-v1$/i.test(model.trim());
}

function isDashscopeMultimodalImage(model: string) {
  return /qwen[-_]?image|wan2\.[6-9]-image|wan2\.6-t2i|wan2\.7-image/i.test(model);
}

function isDashscopeLegacyI2I(model: string) {
  return /wan2\.5.*i2i|wan2\.5-i2i/i.test(model);
}

function wanxV1Size(size?: string) {
  const allowed = new Set(["1024*1024", "720*1280", "768*1152", "1280*720"]);
  const raw = String(size || "").trim().replace(/[x×]/g, "*");
  if (allowed.has(raw)) return raw;
  return "1024*1024";
}

function dashscopeMultimodalImageSize(model: string, size?: string, _ratio?: string) {
  const raw = String(size || "").trim();
  if (/^[1234]K$/i.test(raw) && /wan2\.7/i.test(model)) return raw.toUpperCase();
  if (/^\d+\s*[x×*]\s*\d+$/i.test(raw)) return raw.replace(/[x×]/g, "*");
  if (/wan2\.7/i.test(model)) return raw || "2K";
  return raw || undefined;
}
