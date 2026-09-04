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
/**
 * Civitai LTX2.3 720p / 5s is typically 2–5 minutes and can keep returning HTTP 202
 * from GetWorkflow `wait` until the Comfy worker finishes. A 10-minute abort refunded
 * a still-202 distilled job. Recipe: submit wait=0, poll until terminal.
 * https://developer.civitai.com/orchestration/recipes/ltx2
 */
export const STUDIO_LTX_POLL_WINDOW_MS = 20 * 60_000;
/**
 * Civitai HunyuanVideo is compute-heavy. Official recipe: expect 5–30 minutes;
 * this 720p / 5s / 40-step job finished in ~24 minutes after the UI had already
 * thrown 视频生成超时. https://developer.civitai.com/orchestration/recipes/hunyuan
 */
export const STUDIO_HUNYUAN_POLL_WINDOW_MS = 30 * 60_000;
export const STUDIO_VIDEO_POLL_INTERVAL_MS = 4_000;

export function studioVideoPollWindowMs(model?: string) {
  const id = String(model || "").trim();
  if (/(?:^|[/:])hunyuan(?:$|[/:])/i.test(id)) return STUDIO_HUNYUAN_POLL_WINDOW_MS;
  if (/(?:^|[/:])ltx2(?:\.3)?(?:$|[/:])/i.test(id)) return STUDIO_LTX_POLL_WINDOW_MS;
  return STUDIO_VIDEO_POLL_WINDOW_MS;
}

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
  fps?: number;
  negative_prompt?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  audioUrl?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
  image?: { url: string };
  last_frame_image?: { url: string };
  images?: Array<{ url: string }>;
  image_urls?: string[];
  reference_images?: Array<{ url: string }>;
  profile?: XaiImagineVideoProfile;
};

const XAI_OFFICIAL_VIDEO_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
const XAI_OFFICIAL_VIDEO_RESOLUTIONS = new Set(["480p", "720p", "1080p"]);

function isXaiImagineVideo15Model(model: string) {
  return /^grok-imagine-video-1\.5(?:-preview)?$/i.test(String(model || "").trim());
}

export function buildXaiImagineVideoBody(input: XaiImagineVideoRequest): Record<string, unknown> {
  const profile = input.profile || "official";
  const duration = input.duration;
  const aspectRatio = String(input.aspect_ratio || "").trim();
  const rawResolution = String(input.resolution || "").trim();
  const resolution = /^\d{3,4}$/.test(rawResolution) ? `${rawResolution}p` : rawResolution;
  if (duration !== undefined && (!Number.isFinite(duration) || !Number.isInteger(duration))) {
    throw new Error(`xAI 视频 duration 必须是整数，收到 ${String(duration)}；不会静默改值。`);
  }
  const unsupportedFields: Array<[string, unknown]> = [
    ["fps", input.fps],
    ["negative_prompt", input.negative_prompt],
    ["watermark", input.watermark],
    ["promptExpansion", input.promptExpansion],
    ["returnLastFrame", input.returnLastFrame],
    ["audioUrl", input.audioUrl],
    ["width", input.width],
    ["height", input.height],
    ["steps", input.steps],
    ["guidance", input.guidance],
    ["modelVariant", input.modelVariant],
    ...studioVideoExtensionFields(input),
  ];
  for (const [name, value] of unsupportedFields) {
    if (value !== undefined && value !== null && (typeof value !== "string" || Boolean(value.trim()))) {
      throw new Error(`xAI ${profile === "relay" ? "兼容 relay" : "官方"}视频不支持 ${name}；不会静默丢弃该字段。`);
    }
  }
  if (profile === "official") {
    if (duration !== undefined && (duration < 1 || duration > 15)) {
      throw new Error(`xAI 官方视频 duration 为 1–15 秒，收到 ${duration}；不会静默截断。`);
    }
    if (aspectRatio && !XAI_OFFICIAL_VIDEO_ASPECT_RATIOS.has(aspectRatio)) {
      throw new Error(`xAI 官方视频 aspect_ratio 只接受 1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3，收到 ${aspectRatio}。`);
    }
    if (resolution && !XAI_OFFICIAL_VIDEO_RESOLUTIONS.has(resolution)) {
      throw new Error(`xAI 官方视频 resolution 只接受 480p / 720p / 1080p，收到 ${resolution}。`);
    }
    if (resolution === "1080p" && !isXaiImagineVideo15Model(input.model)) {
      throw new Error("xAI 官方视频 1080p 只适用于 grok-imagine-video-1.5 的文生视频或图生视频。当前模型不支持该值。");
    }
    if (typeof input.generateAudio === "boolean" && !isXaiImagineVideo15Model(input.model)) {
      throw new Error("xAI 官方视频 generate_audio 音频开关只适用于 grok-imagine-video-1.5；不会静默丢弃该字段。");
    }
  }

  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
  };
  if (duration !== undefined) body.duration = duration;
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (resolution) body.resolution = resolution;
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

  if (profile === "relay") {
    const urls = Array.from(new Set([first, ...extras, last].filter(Boolean)));
    if (urls.length > 1 || extras.length) {
      body.reference_images = urls.map((url) => ({ url }));
      return body;
    }
    if (first) body.image = { url: first };
    if (last && last !== first) body.last_frame_image = { url: last };
    return body;
  }

  if (last) {
    throw new Error("xAI 官方视频没有静帧尾帧字段。延长请走 POST /v1/videos/extensions。");
  }
  if (first && extras.length) {
    throw new Error("xAI 官方视频 I2V（image）与 R2V（reference_images）互斥，不能同时发送。");
  }
  if (first) body.image = { url: first };
  else if (extras.length) {
    if (extras.length > 7) {
      throw new Error(`xAI 官方 R2V 最多 7 张 reference_images，当前 ${extras.length} 张。`);
    }
    if (resolution === "1080p") {
      throw new Error("xAI 官方 R2V（reference_images）最高支持 720p，不接受 1080p。");
    }
    body.reference_images = extras.map((url) => ({ url }));
  }
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
  returnLastFrame?: boolean;
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
}): Record<string, unknown> {
  rejectUnsupportedStudioVideoExtensions("Ark 官方视频", input);
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
  const resolution = officialArkVideoResolution(input.resolution);
  return {
    model: input.model,
    content,
    ...(finiteNumber(input.duration) !== undefined ? { duration: input.duration } : {}),
    ...(input.ratio ? { ratio: input.ratio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(typeof input.generateAudio === "boolean" ? { generate_audio: input.generateAudio } : {}),
    ...(typeof input.watermark === "boolean" ? { watermark: input.watermark } : {}),
    ...(typeof input.returnLastFrame === "boolean" ? { return_last_frame: input.returnLastFrame } : {}),
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
  seed?: number;
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  audioUrl?: string;
  width?: number;
  height?: number;
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
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

function hasVideoPayloadValue(value: unknown) {
  return value !== undefined && value !== null && (typeof value !== "string" || Boolean(value.trim()));
}

function studioVideoExtensionFields(payload: {
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
}): ReadonlyArray<[string, unknown]> {
  return [
    ["frames", payload.frames],
    ["audioMode", payload.audioMode],
    ["quantity", payload.quantity],
    ["mode", payload.mode],
    ["frameGuideStrength", payload.frameGuideStrength],
    ["safetyChecker", payload.safetyChecker],
    ["shift", payload.shift],
    ["turbo", payload.turbo],
    ["sampler", payload.sampler],
    ["scheduler", payload.scheduler],
    ["usePro", payload.usePro],
  ];
}

function rejectUnsupportedStudioVideoExtensions(label: string, payload: Parameters<typeof studioVideoExtensionFields>[0]) {
  for (const [name, value] of studioVideoExtensionFields(payload)) {
    if (hasVideoPayloadValue(value)) {
      throw new Error(`${label} 不支持 ${name}；不会静默丢弃该字段。`);
    }
  }
}

function rejectCivitaiVideoFields(
  model: string,
  payload: StudioVideoWirePayload,
  fields: ReadonlyArray<[string, unknown]>,
) {
  for (const [name, value] of fields) {
    if (hasVideoPayloadValue(value)) {
      throw new Error(`Civitai ${model} 官方视频不支持 ${name}；不会静默丢弃该字段。`);
    }
  }
}

function civitaiVideoSize(model: string, ratio?: string, width?: number, height?: number) {
  const hasWidth = width !== undefined;
  const hasHeight = height !== undefined;
  if (hasWidth !== hasHeight) {
    throw new Error(`Civitai ${model} 视频 width 和 height 必须同时提交；不会用比例替换缺失尺寸`);
  }
  if (hasWidth && hasHeight) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Civitai ${model} 视频 width 和 height 必须是正整数；不会静默改值`);
    }
    return { width, height };
  }
  const normalizedRatio = String(ratio || "").trim().replace(/\\s+/g, "");
  const sizes = model === "hunyuan" ? CIVITAI_HUNYUAN_VIDEO_SIZE_BY_RATIO : CIVITAI_LTX_VIDEO_SIZE_BY_RATIO;
  if (!normalizedRatio) return sizes["16:9"]!;
  const size = sizes[normalizedRatio];
  if (!size) throw new Error(`Civitai ${model} 视频画幅 ${normalizedRatio} 未经过官方合同验证，已停止提交`);
  return size;
}

function civitaiVideoSeed(model: string, seed?: number) {
  if (seed === undefined) return undefined;
  if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647) {
    throw new Error(`Civitai ${model} 视频 seed 只接受 0–2147483647 的整数，收到 ${String(seed)}`);
  }
  return seed;
}

function civitaiVideoNumber(
  model: string,
  name: string,
  value: number | undefined,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < minimum || value > maximum) {
    throw new Error(`Civitai ${model} 视频 ${name} 只接受 ${integer ? "整数 " : ""}${minimum}–${maximum}，收到 ${String(value)}`);
  }
  return value;
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

    rejectCivitaiVideoFields("LTX 2.3", payload, [
      ["resolution", payload.resolution],
      ["watermark", payload.watermark],
      ["promptExpansion", payload.promptExpansion],
      ["returnLastFrame", payload.returnLastFrame],
      ["audioUrl", payload.audioUrl],
      ["frames", payload.frames],
      ["audioMode", payload.audioMode],
      ["mode", payload.mode],
      ["safetyChecker", payload.safetyChecker],
      ["shift", payload.shift],
      ["turbo", payload.turbo],
      ["sampler", payload.sampler],
      ["scheduler", payload.scheduler],
      ["usePro", payload.usePro],
    ]);
    const size = civitaiVideoSize("ltx2.3", payload.ratio, payload.width, payload.height);
    const duration = payload.duration === undefined
      ? 5
      : civitaiVideoNumber("LTX 2.3", "duration", payload.duration, 3, 20, true)!;
    const fps = payload.fps === undefined
      ? 24
      : civitaiVideoNumber("LTX 2.3", "fps", payload.fps, 1, 60)!;
    const steps = civitaiVideoNumber("LTX 2.3", "numInferenceSteps", payload.steps, 8, 50, true);
    const guidance = civitaiVideoNumber("LTX 2.3", "guidanceScale", payload.guidance, 1, 10);
    const quantity = civitaiVideoNumber("LTX 2.3", "quantity", payload.quantity, 1, 10, true);
    const frameGuideStrength = civitaiVideoNumber("LTX 2.3", "frameGuideStrength", payload.frameGuideStrength, 0, 1);
    if (frameGuideStrength !== undefined && !(first && last)) {
      throw new Error("Civitai LTX 2.3 frameGuideStrength 只属于 firstLastFrameToVideo；不会静默丢弃该字段。");
    }
    const seed = civitaiVideoSeed("LTX 2.3", payload.seed);
    const modelVariant = String(payload.modelVariant || "").trim() || "22b-distilled";
    if (modelVariant !== "22b-dev" && modelVariant !== "22b-distilled") {
      throw new Error(`Civitai LTX 2.3 model 只接受 22b-dev / 22b-distilled，收到 ${modelVariant}`);
    }
    const input: Record<string, unknown> = {
      engine: "ltx2.3",
      operation: first && last ? "firstLastFrameToVideo" : "createVideo",
      model: modelVariant,
      prompt: payload.prompt,
      duration,
      ...size,
      fps,
      ...(typeof payload.generateAudio === "boolean" ? { generateAudio: payload.generateAudio } : {}),
      ...(hasVideoPayloadValue(payload.negative_prompt) ? { negativePrompt: payload.negative_prompt } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(steps !== undefined ? { numInferenceSteps: steps } : {}),
      ...(guidance !== undefined ? { guidanceScale: guidance } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
    };
    if (first && last) {
      input.firstFrame = first;
      input.lastFrame = last;
      if (frameGuideStrength !== undefined) input.frameGuideStrength = frameGuideStrength;
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
    rejectCivitaiVideoFields("Hunyuan", payload, [
      ["resolution", payload.resolution],
      ["generateAudio", payload.generateAudio],
      ["negativePrompt", payload.negative_prompt],
      ["modelVariant", payload.modelVariant],
      ["watermark", payload.watermark],
      ["promptExpansion", payload.promptExpansion],
      ["returnLastFrame", payload.returnLastFrame],
      ["audioUrl", payload.audioUrl],
      ["frames", payload.frames],
      ["audioMode", payload.audioMode],
      ["quantity", payload.quantity],
      ["mode", payload.mode],
      ["frameGuideStrength", payload.frameGuideStrength],
      ["safetyChecker", payload.safetyChecker],
      ["shift", payload.shift],
      ["turbo", payload.turbo],
      ["sampler", payload.sampler],
      ["scheduler", payload.scheduler],
      ["usePro", payload.usePro],
    ]);
    const size = civitaiVideoSize("hunyuan", payload.ratio, payload.width, payload.height);
    const duration = payload.duration === undefined
      ? 5
      : civitaiVideoNumber("Hunyuan", "duration", payload.duration, 1, 30, true)!;
    const frameRate = payload.fps === undefined
      ? 25
      : civitaiVideoNumber("Hunyuan", "frameRate", payload.fps, -2_147_483_648, 2_147_483_647, true)!;
    const seed = civitaiVideoSeed("Hunyuan", payload.seed);
    const steps = civitaiVideoNumber("Hunyuan", "steps", payload.steps, 10, 50, true);
    const guidance = civitaiVideoNumber("Hunyuan", "cfgScale", payload.guidance, 0, 100);
    return civitaiWorkflowBody({
      engine: "hunyuan",
      prompt: payload.prompt,
      duration,
      ...size,
      frameRate,
      cfgScale: guidance ?? 4,
      ...(seed !== undefined ? { seed } : {}),
      ...(steps !== undefined ? { steps } : {}),
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
      fps: payload.fps,
      negative_prompt: payload.negative_prompt,
      watermark: payload.watermark,
      promptExpansion: payload.promptExpansion,
      returnLastFrame: payload.returnLastFrame,
      audioUrl: payload.audioUrl,
      width: payload.width,
      height: payload.height,
      steps: payload.steps,
      guidance: payload.guidance,
      modelVariant: payload.modelVariant,
      frames: payload.frames,
      audioMode: payload.audioMode,
      quantity: payload.quantity,
      mode: payload.mode,
      frameGuideStrength: payload.frameGuideStrength,
      safetyChecker: payload.safetyChecker,
      shift: payload.shift,
      turbo: payload.turbo,
      sampler: payload.sampler,
      scheduler: payload.scheduler,
      usePro: payload.usePro,
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
      watermark: payload.watermark,
      returnLastFrame: payload.returnLastFrame,
      frames: payload.frames,
      audioMode: payload.audioMode,
      quantity: payload.quantity,
      mode: payload.mode,
      frameGuideStrength: payload.frameGuideStrength,
      safetyChecker: payload.safetyChecker,
      shift: payload.shift,
      turbo: payload.turbo,
      sampler: payload.sampler,
      scheduler: payload.scheduler,
      usePro: payload.usePro,
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
      seed: payload.seed,
      watermark: payload.watermark,
      promptExpansion: payload.promptExpansion,
      audioUrl: payload.audioUrl,
      audioMode: payload.audioMode,
      frames: payload.frames,
      quantity: payload.quantity,
      mode: payload.mode,
      frameGuideStrength: payload.frameGuideStrength,
      safetyChecker: payload.safetyChecker,
      shift: payload.shift,
      turbo: payload.turbo,
      sampler: payload.sampler,
      scheduler: payload.scheduler,
      usePro: payload.usePro,
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
      width: payload.width,
      height: payload.height,
      seed: payload.seed,
      steps: payload.steps,
      frames: payload.frames,
      audioMode: payload.audioMode,
      quantity: payload.quantity,
      mode: payload.mode,
      frameGuideStrength: payload.frameGuideStrength,
      safetyChecker: payload.safetyChecker,
      shift: payload.shift,
      turbo: payload.turbo,
      sampler: payload.sampler,
      scheduler: payload.scheduler,
      usePro: payload.usePro,
      watermark: payload.watermark,
      promptExpansion: payload.promptExpansion,
      returnLastFrame: payload.returnLastFrame,
      audioUrl: payload.audioUrl,
      guidance: payload.guidance,
      modelVariant: payload.modelVariant,
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
      steps: payload.steps,
      guidance: payload.guidance,
      modelVariant: payload.modelVariant,
      watermark: payload.watermark,
      promptExpansion: payload.promptExpansion,
      returnLastFrame: payload.returnLastFrame,
      audioUrl: payload.audioUrl,
      width: payload.width,
      height: payload.height,
      frames: payload.frames,
      audioMode: payload.audioMode,
      quantity: payload.quantity,
      mode: payload.mode,
      frameGuideStrength: payload.frameGuideStrength,
      safetyChecker: payload.safetyChecker,
      shift: payload.shift,
      turbo: payload.turbo,
      sampler: payload.sampler,
      scheduler: payload.scheduler,
      usePro: payload.usePro,
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
    ...(finiteNumber(payload.seed) !== undefined ? { seed: payload.seed } : {}),
    ...(finiteNumber(payload.steps) !== undefined ? { steps: payload.steps } : {}),
    ...(finiteNumber(payload.guidance) !== undefined ? { guidance: payload.guidance } : {}),
    ...(payload.modelVariant ? { model_variant: payload.modelVariant } : {}),
    ...(typeof payload.watermark === "boolean" ? { watermark: payload.watermark } : {}),
    ...(typeof payload.promptExpansion === "boolean" ? { prompt_expansion: payload.promptExpansion } : {}),
    ...(typeof payload.returnLastFrame === "boolean" ? { return_last_frame: payload.returnLastFrame } : {}),
    ...(payload.audioUrl ? { audio_url: payload.audioUrl } : {}),
    ...(finiteNumber(payload.width) !== undefined ? { width: payload.width } : {}),
    ...(finiteNumber(payload.height) !== undefined ? { height: payload.height } : {}),
    ...(payload.first_frame ? { image: { url: payload.first_frame } } : {}),
    ...(payload.last_frame ? { last_frame: payload.last_frame, last_frame_image: { url: payload.last_frame } } : {}),
    ...(payload.image_urls?.length ? { image_urls: payload.image_urls.filter(Boolean) } : {}),
    ...(finiteNumber(payload.frames) !== undefined ? { num_frames: payload.frames, frames: payload.frames } : {}),
    ...(payload.audioMode ? { audio_mode: payload.audioMode, audio_setting: payload.audioMode } : {}),
    ...(finiteNumber(payload.quantity) !== undefined ? { quantity: payload.quantity, n: payload.quantity } : {}),
    ...(payload.mode ? { mode: payload.mode } : {}),
    ...(finiteNumber(payload.frameGuideStrength) !== undefined ? { frame_guide_strength: payload.frameGuideStrength } : {}),
    ...(typeof payload.safetyChecker === "boolean" ? { enable_safety_checker: payload.safetyChecker } : {}),
    ...(finiteNumber(payload.shift) !== undefined ? { shift: payload.shift } : {}),
    ...(typeof payload.turbo === "boolean" ? { turbo: payload.turbo, use_turbo: payload.turbo } : {}),
    ...(payload.sampler ? { sampler: payload.sampler } : {}),
    ...(payload.scheduler ? { scheduler: payload.scheduler } : {}),
    ...(typeof payload.usePro === "boolean" ? { use_pro: payload.usePro } : {}),
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
  seed?: number;
  watermark?: boolean;
  promptExpansion?: boolean;
  audioUrl?: string;
  audioMode?: string;
  frames?: number;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
}): Record<string, unknown> {
  const family = dashscopeVideoFamily(input.model);
  rejectUnsupportedStudioVideoExtensions(`DashScope ${input.model}`, {
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
  });
  if (input.fps !== undefined) {
    throw new Error(`DashScope ${input.model} 输出帧率固定，官方请求合同不支持可配置 fps；不会静默丢弃该字段。`);
  }
  const audioMode = String(input.audioMode || "").trim();
  if (audioMode) {
    if (audioMode !== "auto" && audioMode !== "origin") {
      throw new Error(`DashScope ${input.model} 的 audioMode / parameters.audio_setting 只接受 auto / origin，收到 ${audioMode}。`);
    }
    if (!/videoedit|video-edit/i.test(input.model)) {
      throw new Error(`DashScope ${input.model} 不支持 parameters.audio_setting；该字段仅属于 wan2.7-videoedit / happyhorse-*-video-edit。`);
    }
  }
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  const extras = (input.imageUrls || [])
    .map((item) => String(item || "").trim())
    .filter((url) => url && url !== first && url !== last);
  const duration = finiteNumber(input.duration);
  const resolution = normalizeDashscopeVideoResolution(input.resolution);
  const ratio = String(input.ratio || "").trim();
  const negative = String(input.negativePrompt || "").trim();
  const audioUrl = String(input.audioUrl || "").trim();
  const extrasParameters = dashscopeOfficialVideoParameters({ ...input, audioMode: audioMode || undefined });

  if (family === "wan26") {
    const i2v = /i2v/i.test(input.model);
    const r2v = /r2v/i.test(input.model);
    const flash = /flash/i.test(input.model);
    if (i2v && last) {
      throw new Error(
        `DashScope ${input.model} 不支持尾帧 lastFrameUrl；官方 Wan2.6 I2V 仅支持首帧 input.img_url，请切换到支持首尾帧的 wan2.7-i2v。`,
      );
    }
    if (i2v && ratio) {
      throw new Error(`DashScope ${input.model} 的画幅跟随首帧，不支持 ratio；不会静默丢弃 ${ratio}。`);
    }
    if (r2v && negative) {
      throw new Error(`DashScope ${input.model} 不支持 negativePrompt / negative_prompt；不会静默丢弃该字段。`);
    }
    if (typeof input.generateAudio === "boolean" && !(flash && (i2v || r2v))) {
      throw new Error(`DashScope ${input.model} 不支持 parameters.audio 布尔 generateAudio；该开关仅属于 Wan2.6 I2V/R2V flash 模型。`);
    }
    const size = !i2v && (ratio || resolution) ? wan26Size(ratio, resolution) : undefined;
    return {
      model: input.model,
      input: {
        prompt: input.prompt,
        ...(i2v && first ? { img_url: first } : {}),
        ...(r2v && extras.length ? { reference_urls: extras } : {}),
        ...((i2v || !r2v) && audioUrl ? { audio_url: audioUrl } : {}),
        ...(negative ? { negative_prompt: negative } : {}),
      },
      parameters: {
        ...(duration !== undefined ? { duration } : {}),
        ...(i2v ? (resolution ? { resolution } : {}) : size ? { size } : {}),
        ...(flash && (i2v || r2v) && typeof input.generateAudio === "boolean"
          ? { audio: input.generateAudio }
          : {}),
        ...extrasParameters,
      },
    };
  }

  if (family === "happyhorse") {
    if (negative) {
      throw new Error(`DashScope HappyHorse ${input.model} 不支持 negativePrompt / negative_prompt；不会静默丢弃该字段。`);
    }
    if (typeof input.generateAudio === "boolean") {
      throw new Error(`DashScope HappyHorse ${input.model} 不支持 generateAudio；不会静默丢弃该字段。`);
    }
    const i2v = /i2v/i.test(input.model);
    const refs = Array.from(new Set([first, ...extras, last].filter(Boolean)));
    const media = i2v && first
      ? [{ type: "first_frame" as const, url: first }]
      : refs.map((url) => ({ type: "reference_image" as const, url }));
    return {
      model: input.model,
      input: {
        prompt: input.prompt,
        ...(media.length ? { media } : {}),
      },
      parameters: {
        ...(duration !== undefined ? { duration } : {}),
        ...(!i2v && ratio ? { ratio } : {}),
        ...(resolution ? { resolution } : {}),
        ...extrasParameters,
      },
    };
  }

  if (family === "wan27") {
    const r2v = /r2v/i.test(input.model);
    const i2v = /i2v/i.test(input.model) || Boolean(!r2v && (first || last));
    if (typeof input.generateAudio === "boolean") {
      throw new Error(`DashScope ${input.model} 不支持 parameters.audio 布尔 generateAudio；音频输入请使用已验证的 audioUrl 字段。`);
    }
    if (i2v && ratio) {
      throw new Error(`DashScope ${input.model} 的画幅跟随首帧或首段视频，不支持 ratio；不会静默丢弃 ${ratio}。`);
    }
    const media = r2v
      ? extras.map((url) => ({ type: "reference_image" as const, url }))
      : i2v
        ? [
            ...dashscopeFrameMedia(first, last),
            ...(audioUrl ? [{ type: "driving_audio" as const, url: audioUrl }] : []),
          ]
        : [];
    return {
      model: input.model,
      input: {
        prompt: input.prompt,
        ...(media.length ? { media } : {}),
        ...(!i2v && audioUrl ? { audio_url: audioUrl } : {}),
        ...(negative ? { negative_prompt: negative } : {}),
      },
      parameters: {
        ...(duration !== undefined ? { duration } : {}),
        ...(!i2v && ratio ? { ratio } : {}),
        ...(resolution ? { resolution } : {}),
        ...extrasParameters,
      },
    };
  }

  if (negative) {
    throw new Error(`DashScope wan3 ${input.model} 不支持 negativePrompt / negative_prompt；不会静默丢弃该字段。`);
  }
  if (audioUrl) {
    throw new Error(`DashScope wan3 ${input.model} 的普通 audioUrl 未经过官方合同验证；请使用明确标注用途的参考音频。`);
  }
  const frameMedia = dashscopeFrameMedia(first, last);
  const refMedia = extras.map((url) => ({ type: "reference_image" as const, url }));
  const media = frameMedia.length ? frameMedia : refMedia;
  return {
    model: input.model,
    input: {
      prompt: input.prompt,
      ...(media.length ? { media } : {}),
    },
    parameters: {
      ...(duration !== undefined ? { duration } : {}),
      ...(ratio ? { ratio } : {}),
      ...(resolution ? { resolution } : {}),
      ...(typeof input.generateAudio === "boolean" ? { audio: input.generateAudio } : {}),
      ...extrasParameters,
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
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  audioUrl?: string;
  width?: number;
  height?: number;
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
}): Record<string, unknown> {
  const seconds = officialOpenAiVideoSeconds(input.duration);
  const first = String(input.first_frame || "").trim();
  const last = String(input.last_frame || "").trim();
  const extras = (input.image_urls || []).map((url) => String(url || "").trim()).filter(Boolean);
  if (finiteNumber(input.fps) !== undefined) {
    throw new Error("OpenAI 官方 Videos 不支持 fps；不会静默丢弃该字段。");
  }
  if (typeof input.generateAudio === "boolean") {
    throw new Error("OpenAI 官方 Videos 不支持 generate_audio 音频开关；不会静默丢弃该字段。");
  }
  if (String(input.negative_prompt || "").trim()) {
    throw new Error("OpenAI 官方 Videos 不支持 negative_prompt 负面提示词；不会静默丢弃该字段。");
  }
  const unsupportedFields: Array<[string, unknown]> = [
    ["steps", input.steps],
    ["guidance", input.guidance],
    ["modelVariant", input.modelVariant],
    ["watermark", input.watermark],
    ["promptExpansion", input.promptExpansion],
    ["returnLastFrame", input.returnLastFrame],
    ["audioUrl", input.audioUrl],
    ["width", input.width],
    ["height", input.height],
    ...studioVideoExtensionFields(input),
  ];
  for (const [name, value] of unsupportedFields) {
    if (hasVideoPayloadValue(value)) {
      throw new Error(`OpenAI 官方 Videos 不支持 ${name}；不会静默丢弃该字段。`);
    }
  }
  if (extras.length) {
    throw new Error("OpenAI 官方 Videos 只接受 1 个 input_reference，不支持 image_urls；不会静默丢弃额外参考图。");
  }
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
  if (typeof input.seed === "number" && Number.isFinite(input.seed)) {
    throw new Error("OpenAI 官方 Images 不支持 seed；不会静默丢弃该字段。");
  }
  if (String(input.negativePrompt || "").trim()) {
    throw new Error("OpenAI 官方 Images 不支持 negative_prompt；不会静默丢弃该字段。");
  }
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
  seed?: number;
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  audioUrl?: string;
  width?: number;
  height?: number;
  frames?: number;
  audioMode?: string;
  quantity?: number;
  mode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
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

/** API ref enum is 4|8|12. Non-enum values are rejected, never silently re-mapped. */
export function officialOpenAiVideoSeconds(duration?: number) {
  const n = finiteNumber(duration);
  if (n === undefined) return undefined;
  if ((OFFICIAL_OPENAI_VIDEO_SECONDS as readonly number[]).includes(n)) return String(n);
  throw new Error(`OpenAI 官方 Videos 的 seconds 只接受 4 / 8 / 12，收到 ${n}；不会静默改成相邻档位。`);
}

const OFFICIAL_OPENAI_VIDEO_SIZES = ["720x1280", "1280x720", "1024x1792", "1792x1024"] as const;

function officialArkVideoResolution(value?: string) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "4k") return "4k";
  const normalized = raw.replace(/p$/, "");
  if (normalized === "480") return "480p";
  if (normalized === "720") return "720p";
  if (normalized === "1080") return "1080p";
  throw new Error(`Ark 官方视频 resolution 只接受 480p / 720p / 1080p / 4k，收到 ${value || "(空)"}；不会静默省略。`);
}

function dashscopeOfficialVideoParameters(input: {
  seed?: number;
  watermark?: boolean;
  promptExpansion?: boolean;
  audioMode?: string;
}) {
  const seed = finiteNumber(input.seed);
  const audioMode = String(input.audioMode || "").trim();
  return {
    ...(typeof input.watermark === "boolean" ? { watermark: input.watermark } : {}),
    ...(typeof input.promptExpansion === "boolean" ? { prompt_extend: input.promptExpansion } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(audioMode ? { audio_setting: audioMode } : {}),
  };
}

function officialOpenAiVideoSize(size?: string, ratio?: string) {
  const raw = String(size || "").trim();
  if (!raw) {
    // Empty size: infer from ratio when provided. No ratio → no size (API default applies).
    const aspect = String(ratio || "").trim();
    if (aspect === "9:16") return "720x1280";
    if (aspect === "16:9") return "1280x720";
    if (aspect === "3:4") return "1024x1792";
    if (aspect === "4:3") return "1792x1024";
    return "";
  }
  if (/^\d+x\d+$/i.test(raw)) {
    const hit = OFFICIAL_OPENAI_VIDEO_SIZES.find((item) => item.toLowerCase() === raw.toLowerCase());
    if (!hit) {
      throw new Error(`OpenAI 官方 Videos 的 size 只接受 720x1280 / 1280x720 / 1024x1792 / 1792x1024，收到 ${raw}；不会静默省略。`);
    }
    return hit;
  }
  if (raw.toLowerCase().replace(/p$/, "") === "720") {
    const aspect = String(ratio || "").trim();
    if (aspect === "9:16") return "720x1280";
    if (aspect === "16:9") return "1280x720";
    if (aspect === "3:4") return "1024x1792";
    if (aspect === "4:3") return "1792x1024";
    throw new Error(`OpenAI 官方 Videos 的 720p 需要 9:16 / 16:9 / 3:4 / 4:3 之一，收到 ${ratio || "(空)"}；不会静默取 1280x720。`);
  }
  throw new Error(`OpenAI 官方 Videos 的 size 只接受 720x1280 / 1280x720 / 1024x1792 / 1792x1024 或 720p 档位，收到 ${size || "(空)"}；不会静默省略。`);
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
  throw new Error(`DashScope 官方视频 resolution 只接受 480P / 720P / 1080P，收到 ${value || "(空)"}；不会静默省略。`);
}

function wan26Size(ratio: string, resolution: string) {
  const tier = resolution === "1080P" ? "1080P" : "720P";
  const aspect = ratio || "16:9";
  const size = WAN26_SIZE_BY_RATIO[tier][aspect];
  if (!size) {
    throw new Error(`DashScope Wan2.6 视频 ratio 不支持 ${aspect}；只接受 16:9 / 9:16 / 1:1 / 4:3 / 3:4，不会回退到 16:9。`);
  }
  return size;
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
