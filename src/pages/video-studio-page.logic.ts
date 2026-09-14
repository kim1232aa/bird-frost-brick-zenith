/** Page-only Civitai param-chain helpers for VideoStudioPage. Do not send unverified fields. */

import {
  civitaiVideoFpsOptions,
  civitaiVideoFpsSpec,
  civitaiVideoLoraShape,
  clampCivitaiVideoFps,
  isCivitaiAdapterType,
  type CivitaiLoraShape,
} from "../studio/civitai-ui-options.ts";
import { isOfficialXaiHost, openaiVideoWireKind } from "../studio/adapters/contracts.ts";
import {
  describeVideoGenerationParameters,
  resolveVideoModelCapability,
  validateVideoGenerationParameters,
  type VideoCapabilityProvider,
  type VideoGenerationParameterName,
  type VideoGenerationParameterValue,
} from "../services/api/video-model-capabilities.ts";
import { normalizeVideoDuration, videoDurationOptions } from "../studio/video-duration-options.ts";

export type VideoStudioMode = "t2v" | "i2v" | "flf" | "extract";

type VideoStudioCapabilityInput = {
  adapterType?: string;
  providerId?: string;
  model: string;
  mode?: VideoStudioMode;
  firstFrame?: string;
  lastFrame?: string;
  host?: string;
  protocol?: string;
  provider?: VideoCapabilityProvider;
  videoCapabilityProfiles?: VideoCapabilityProvider["videoCapabilityProfiles"];
  isArk?: boolean;
};

export type VideoStudioReferenceControls = {
  supportsFirstFrame: boolean;
  supportsFirstLastFrame: boolean;
  supportsLastFrameInI2v: boolean;
  rejectsLastFrameInI2v: boolean;
  firstFrameReason?: string;
  lastFrameReason?: string;
  i2vReason?: string;
  flfReason?: string;
  notice?: string;
};

const OPENAI_OFFICIAL_FRAME_REASON =
  "OpenAI 官方 Videos 只支持一个 input_reference 作为视频首帧，不支持静帧尾帧；请使用图生视频，或切换到支持首尾帧的 provider/model。";
const XAI_OFFICIAL_FRAME_REASON =
  "xAI 官方视频没有静帧尾帧字段；I2V 的 image 与 R2V 的 reference_images 互斥。请使用图生视频（仅首帧），或切换到支持首尾帧的 provider/model。";
const UNKNOWN_VIDEO_REFERENCE_REASON =
  "当前 provider/model 尚未配置可验证的视频 capability profile；参考帧入口已禁用，不会猜测 provider 字段。";
const HUNYUAN_REFERENCE_REASON =
  "Hunyuan 只支持文生视频，不接受参考图。请切回文生视频，或换 LTX 等支持图生视频的模型。";

function providerProtocol(provider: VideoCapabilityProvider | undefined, fallback?: string) {
  return String((provider as (VideoCapabilityProvider & { protocol?: string }) | undefined)?.protocol || fallback || "").trim();
}

function capabilityProvider(input: VideoStudioCapabilityInput) {
  const source = input.provider || {
    id: input.providerId,
    baseUrl: input.host,
    adapterType: input.adapterType,
    videoCapabilityProfiles: input.videoCapabilityProfiles,
  };
  const adapterType = String(source.adapterType || input.adapterType || "").trim().toLowerCase();
  const host = String(source.baseUrl || input.host || "").trim();
  const protocol = providerProtocol(source, input.protocol);
  const officialOpenAi = openaiVideoWireKind(host, protocol) === "openai-official";
  const normalizedAdapterType = officialOpenAi && adapterType === "openai-compat"
    ? "openai"
    : adapterType === "ark-plan"
      ? "ark"
      : adapterType === "civitai"
        ? "civitai-orchestration"
        : adapterType;
  return normalizedAdapterType === adapterType ? source : { ...source, adapterType: normalizedAdapterType };
}

function unavailableVideoReferenceControls(reason: string): VideoStudioReferenceControls {
  return {
    supportsFirstFrame: false,
    supportsFirstLastFrame: false,
    supportsLastFrameInI2v: false,
    rejectsLastFrameInI2v: true,
    firstFrameReason: reason,
    lastFrameReason: reason,
    i2vReason: reason,
    flfReason: reason,
  };
}

function civitaiVideoReferenceControls(model: string): VideoStudioReferenceControls {
  const normalizedModel = String(model || "").trim().toLowerCase();
  if (normalizedModel === "ltx2.3") {
    return {
      supportsFirstFrame: true,
      supportsFirstLastFrame: true,
      // The LTX createVideo operation only submits its first-frame input;
      // the separate firstLastFrameToVideo operation uses the tail frame.
      supportsLastFrameInI2v: false,
      rejectsLastFrameInI2v: false,
      lastFrameReason: "LTX 图生视频只提交首帧；需要尾帧请切换首尾帧模式。",
    };
  }
  if (normalizedModel === "hunyuan") {
    return unavailableVideoReferenceControls(HUNYUAN_REFERENCE_REASON);
  }
  return unavailableVideoReferenceControls(UNKNOWN_VIDEO_REFERENCE_REASON);
}

export function videoStudioReferenceControls(input: VideoStudioCapabilityInput): VideoStudioReferenceControls {
  const providerId = input.providerId || input.provider?.id;
  const adapterType = String(input.provider?.adapterType || input.adapterType || "").trim().toLowerCase();
  const civitai = isCivitaiStudioAdapter(adapterType, providerId);
  const provider = capabilityProvider(input);
  const host = String(provider.baseUrl || input.host || "").trim();
  const protocol = providerProtocol(provider, input.protocol);
  const capability = resolveVideoModelCapability({ model: input.model, provider });
  if (civitai) {
    const normalizedModel = String(input.model || "").trim().toLowerCase();
    if (normalizedModel === "ltx2.3" || normalizedModel === "hunyuan") return civitaiVideoReferenceControls(input.model);
  }
  const officialXai = isOfficialXaiHost(host) &&
    (adapterType === "xai-imagine" || adapterType === "xai" || capability.id === "xai-imagine-video");
  const officialOpenAi = !officialXai && openaiVideoWireKind(host, protocol) === "openai-official";
  const legacyArk = Boolean(input.isArk) || adapterType === "ark-plan" || adapterType === "ark";
  const providerLabel = capability.providerLabel || capability.model || "当前模型";
  const profileReason = capability.requiresExplicitProfile ? UNKNOWN_VIDEO_REFERENCE_REASON : "";

  let supportsFirstFrame = capability.supportsFirstFrame;
  let supportsFirstLastFrame = capability.supportsFirstLastFrame;
  if (legacyArk && capability.requiresExplicitProfile && !officialOpenAi && !officialXai) {
    // The existing Ark adapter has an explicit first/last-frame content wire;
    // preserve that relay capability while an exact dated profile is absent.
    supportsFirstFrame = true;
    supportsFirstLastFrame = true;
  }
  if (!officialXai && capability.id === "xai-imagine-video") {
    // xAI-compatible relays retain their existing legacy first/last-frame wire;
    // this must not broaden the official api.x.ai contract.
    supportsFirstFrame = true;
    supportsFirstLastFrame = true;
  }

  let firstFrameReason = !supportsFirstFrame
    ? profileReason || `${providerLabel} 当前 capability profile 不支持首帧输入。`
    : undefined;
  let lastFrameReason = !supportsFirstLastFrame
    ? profileReason || `${providerLabel} 当前 capability profile 不支持首尾帧或尾帧输入。`
    : undefined;
  let notice: string | undefined;

  if (officialOpenAi) {
    supportsFirstLastFrame = false;
    lastFrameReason = OPENAI_OFFICIAL_FRAME_REASON;
  } else if (officialXai) {
    supportsFirstLastFrame = false;
    lastFrameReason = XAI_OFFICIAL_FRAME_REASON;
    notice = XAI_OFFICIAL_FRAME_REASON;
  }

  const i2vReason = !supportsFirstFrame
    ? firstFrameReason
    : capability.requiresFirstLastFrame
      ? `${providerLabel} 要求同时提供首帧和尾帧，请切换首尾帧模式。`
      : capability.supportedOperations && !capability.supportedOperations.includes("image-to-video")
        ? `${providerLabel} 当前 operation 不支持图生视频，请切换首尾帧或文生视频。`
        : undefined;
  const flfReason = !supportsFirstLastFrame
    ? lastFrameReason
    : capability.supportedOperations && !capability.supportedOperations.includes("first-last-frame-to-video")
      ? `${providerLabel} 当前 operation 不支持首尾帧。`
      : undefined;

  firstFrameReason = firstFrameReason || undefined;
  lastFrameReason = lastFrameReason || undefined;
  return {
    supportsFirstFrame,
    supportsFirstLastFrame,
    supportsLastFrameInI2v: supportsFirstLastFrame,
    rejectsLastFrameInI2v: !supportsFirstLastFrame,
    firstFrameReason,
    lastFrameReason,
    i2vReason,
    flfReason,
    notice,
  };
}

/**
 * Live OpenAPI `ComfyLtx23VideoGenInput.duration`: integer 3–20, default 5
 * (https://orchestration.civitai.com/openapi/v2-consumers.json).
 * Recipe copy at https://developer.civitai.com/orchestration/recipes/ltx2 says
 * "Only these two values are accepted" for 3 or 20 — that conflicts with the
 * live schema (`minimum: 3`, `maximum: 20`, not an enum). Page follows live
 * schema and offers practical chips inside that range.
 *
 * Live `HunyuanVdeoGenInput.duration`: integer 1–30, default 5
 * (https://developer.civitai.com/orchestration/recipes/hunyuan).
 * Chips stay inside both ranges and do not reuse OpenAI 4/8/12.
 */
const CIVITAI_LTX_DURATION_OPTIONS = [3, 5, 8, 10, 15, 20] as const;
const CIVITAI_HUNYUAN_DURATION_OPTIONS = [3, 5, 8, 10, 15, 20] as const;

function snapDuration(duration: number, options: readonly number[]) {
  if (!options.length) return duration;
  if (options.includes(duration)) return duration;
  return options.reduce((best, item) => (Math.abs(item - duration) < Math.abs(best - duration) ? item : best), options[0]);
}

function civitaiVideoDurationOptions(model: string): readonly number[] | undefined {
  if (model === "ltx2.3") return CIVITAI_LTX_DURATION_OPTIONS;
  if (model === "hunyuan") return CIVITAI_HUNYUAN_DURATION_OPTIONS;
  return undefined;
}

export function isCivitaiStudioAdapter(adapterType?: string, providerId?: string) {
  if (isCivitaiAdapterType(adapterType)) return true;
  const adapter = String(adapterType || "").trim().toLowerCase();
  if (adapter) return false;
  const id = String(providerId || "").trim();
  return id === "preset-civitai" || id.startsWith("preset-civitai::");
}

type VideoFpsSpec = NonNullable<ReturnType<typeof civitaiVideoFpsSpec>>;

export function videoStudioCivitaiControls(adapterType: string | undefined, model: string, providerId?: string) {
  if (!isCivitaiStudioAdapter(adapterType, providerId)) {
    return {
      showLora: false,
      loraShape: undefined as CivitaiLoraShape | undefined,
      fpsSpec: undefined as VideoFpsSpec | undefined,
      fpsOptions: [] as number[],
      showGenerateAudio: false,
    };
  }
  const loraShape = civitaiVideoLoraShape(model);
  const fpsSpec = civitaiVideoFpsSpec(model);
  return {
    showLora: Boolean(loraShape),
    loraShape,
    fpsSpec,
    fpsOptions: civitaiVideoFpsOptions(model),
    // Live ComfyLtx23VideoGenInput.generateAudio: boolean, default true. Hunyuan schema has no such field.
    showGenerateAudio: model === "ltx2.3",
  };
}

export function snapVideoStudioFps(model: string, fps: number) {
  const spec = civitaiVideoFpsSpec(model);
  if (!spec) return undefined;
  const options = civitaiVideoFpsOptions(model);
  const clamped = clampCivitaiVideoFps(model, fps) ?? spec.defaultFps;
  if (options.includes(clamped)) return clamped;
  return spec.defaultFps;
}

export function buildVideoStudioLoras(
  showLora: boolean,
  loras: ReadonlyArray<{ resource: string; weight: number }>,
): Record<string, number> | undefined {
  if (!showLora) return undefined;
  const map = Object.fromEntries(
    loras.filter((item) => item.resource.trim()).map((item) => [item.resource.trim(), item.weight]),
  );
  return Object.keys(map).length ? map : undefined;
}

export function videoStudioModeError(input: VideoStudioCapabilityInput & { mode: VideoStudioMode }) {
  if (input.mode === "extract") return "";
  const referenceControls = videoStudioReferenceControls(input);
  if (input.mode === "i2v") {
    if (referenceControls.i2vReason) return referenceControls.i2vReason;
    if (!input.firstFrame) return "图生视频需要首帧";
    if (input.lastFrame && referenceControls.rejectsLastFrameInI2v) {
      return referenceControls.lastFrameReason || "当前图生视频 operation 不接受尾帧，请移除尾帧或切换首尾帧模式。";
    }
    return "";
  }
  if (input.mode === "flf") {
    if (referenceControls.flfReason) return referenceControls.flfReason;
    if (!input.firstFrame) return "图生视频需要首帧";
    if (!input.lastFrame) return "首尾帧模式需要尾帧";
  }
  return "";
}

export function buildVideoStudioGenerateFields(input: {
  adapterType?: string;
  providerId?: string;
  model: string;
  mode: VideoStudioMode;
  duration: number;
  ratio: string;
  resolution?: string;
  firstFrame?: string;
  lastFrame?: string;
  audio?: boolean;
  fps: number;
  negativePrompt?: string;
  seed?: number;
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
  generationMode?: string;
  frameGuideStrength?: number;
  safetyChecker?: boolean;
  shift?: number;
  turbo?: boolean;
  sampler?: string;
  scheduler?: string;
  usePro?: boolean;
  loras: ReadonlyArray<{ resource: string; weight: number }>;
  isArk: boolean;
  host?: string;
  protocol?: string;
  provider?: VideoCapabilityProvider;
  videoCapabilityProfiles?: VideoCapabilityProvider["videoCapabilityProfiles"];
}) {
  const controls = videoStudioCivitaiControls(input.adapterType, input.model, input.providerId);
  const referenceControls = videoStudioReferenceControls(input);
  const provider = capabilityProvider(input);
  const capabilityModel = isCivitaiStudioAdapter(input.adapterType, input.providerId) && String(input.model || "").trim().toLowerCase() === "ltx2.3"
    ? (input.mode === "flf" ? "video/ltx2.3/firstLastFrameToVideo" : "video/ltx2.3/createVideo")
    : input.model;
  const capability = resolveVideoModelCapability({ model: capabilityModel, provider });
  const adapterType = String(input.provider?.adapterType || input.adapterType || "").trim().toLowerCase();
  const host = String(input.provider?.baseUrl || input.host || "").trim();
  const protocol = providerProtocol(input.provider, input.protocol);
  const officialOpenAi = openaiVideoWireKind(host, protocol) === "openai-official";
  const genericCompatibilityRelay = adapterType === "openai-compat" && !officialOpenAi;
  const civitai = isCivitaiStudioAdapter(input.adapterType, input.providerId);
  const civitaiDurations = civitai ? civitaiVideoDurationOptions(input.model) : undefined;
  // 时长档位优先用能力合同的枚举值（合同说只有 5 就别渲染 4/6/8/10 让用户点了被拦）；
  // 合同没有枚举才回落到 host/protocol 的通用档位。
  const contractDurationField = capability.generationParameters.duration;
  const contractDurations = contractDurationField.status === "supported" && Array.isArray(contractDurationField.enumValues)
    ? contractDurationField.enumValues.filter((v): v is number => typeof v === "number")
    : [];
  const durationOptions = civitaiDurations || (contractDurations.length ? contractDurations : videoDurationOptions(host, protocol));
  const validationErrors: string[] = [];
  const isProvided = (value: unknown) => value !== undefined
    && value !== null
    && (typeof value !== "string" || Boolean(value.trim()));
  const validateParameter = <T extends VideoGenerationParameterValue>(
    name: VideoGenerationParameterName,
    value: T | undefined,
  ): T | undefined => {
    if (!isProvided(value)) return undefined;
    if (genericCompatibilityRelay) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        validationErrors.push(`兼容 relay 视频参数 ${name} 必须是有限数字；不会静默丢弃。`);
        return undefined;
      }
      if (name === "dimensions") {
        const dimensions = value as { width?: unknown; height?: unknown };
        if (
          !Number.isInteger(dimensions.width)
          || !Number.isInteger(dimensions.height)
          || Number(dimensions.width) <= 0
          || Number(dimensions.height) <= 0
        ) {
          validationErrors.push("兼容 relay 视频 width 和 height 必须同时为正整数；不会静默丢弃。");
          return undefined;
        }
      }
      return value;
    }
    try {
      // 「官方合同未公布」≠「不支持」：不发该参数、也不拦截生成。
      // 只有明确 unsupported / conflict 才报错（validateVideoGenerationParameters 会拦）。
      if (capability.generationParameters[name]?.status === "unpublished") return undefined;
      validateVideoGenerationParameters(capability, { [name]: value } as Partial<Record<VideoGenerationParameterName, VideoGenerationParameterValue>>);
      return value;
    } catch (error) {
      validationErrors.push(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  };

  const duration = input.duration;
  const normalizedModel = String(input.model || "").trim().toLowerCase();
  if (civitai && normalizedModel === "ltx2.3") {
    if (!Number.isInteger(duration) || duration < 3 || duration > 20) {
      validationErrors.push(`Civitai LTX 2.3 视频 duration 必须是 3–20 的整数，收到 ${String(duration)}；不会静默改值。`);
    }
  } else if (officialOpenAi || isOfficialXaiHost(host)) {
    try {
      normalizeVideoDuration(duration, host, protocol);
    } catch (error) {
      validationErrors.push(error instanceof Error ? error.message : String(error));
    }
  } else if (capability.generationParameters.duration.derivedFrom?.includes("frames") && isProvided(input.frames)) {
    // Official Agnes duration is UI-only; explicit num_frames wins and is not
    // re-derived from the displayed seconds. https://agnes-ai.com/en/docs/agnes-video-v20
  } else {
    validateParameter("duration", duration);
  }

  const modeError = videoStudioModeError(input);
  const fps = controls.fpsSpec || genericCompatibilityRelay || capability.generationParameters.fps.status === "supported"
    ? validateParameter("fps", input.fps) as number | undefined
    : undefined;
  const resolution = validateParameter("resolution", input.resolution) as string | undefined;
  const negativePrompt = validateParameter("negativePrompt", input.negativePrompt) as string | undefined;
  const seed = validateParameter("seed", input.seed) as number | undefined;
  const watermark = validateParameter("watermark", input.watermark) as boolean | undefined;
  const promptExpansion = validateParameter("promptExpansion", input.promptExpansion) as boolean | undefined;
  const returnLastFrame = validateParameter("returnLastFrame", input.returnLastFrame) as boolean | undefined;
  const capabilityAudioBoolean = capability.generationParameters.audio.status === "supported"
    && capability.generationParameters.audio.valueType === "boolean";
  const showGenerateAudio = input.isArk || controls.showGenerateAudio || capabilityAudioBoolean || genericCompatibilityRelay;
  let generateAudio: boolean | undefined;
  if (showGenerateAudio && typeof input.audio === "boolean") {
    if (input.isArk && !capabilityAudioBoolean && !genericCompatibilityRelay) generateAudio = input.audio;
    else generateAudio = validateParameter("audio", input.audio) as boolean | undefined;
  }
  const audioUrl = validateParameter("audio", input.audioUrl) as string | undefined;
  const steps = validateParameter("steps", input.steps) as number | undefined;
  const guidance = validateParameter("guidance", input.guidance) as number | undefined;
  const modelVariant = validateParameter("modelVariant", input.modelVariant) as string | undefined;
  const frames = validateParameter("frames", input.frames) as number | undefined;
  const audioMode = validateParameter("audioMode", input.audioMode) as string | undefined;
  const quantity = validateParameter("quantity", input.quantity) as number | undefined;
  const generationMode = validateParameter("mode", input.generationMode) as string | undefined;
  const frameGuideStrength = validateParameter("frameGuideStrength", input.frameGuideStrength) as number | undefined;
  const safetyChecker = validateParameter("safetyChecker", input.safetyChecker) as boolean | undefined;
  const shift = validateParameter("shift", input.shift) as number | undefined;
  const turbo = validateParameter("turbo", input.turbo) as boolean | undefined;
  const sampler = validateParameter("sampler", input.sampler) as string | undefined;
  const scheduler = validateParameter("scheduler", input.scheduler) as string | undefined;
  const usePro = validateParameter("usePro", input.usePro) as boolean | undefined;
  const showAspectRatio = genericCompatibilityRelay
    || capability.generationParameters.aspectRatio.status === "supported";
  const ratio = showAspectRatio
    ? validateParameter("aspectRatio", input.ratio) as string | undefined
    : undefined;
  const dimensions = input.width !== undefined || input.height !== undefined
    ? validateParameter("dimensions", { width: input.width as number, height: input.height as number }) as { width: number; height: number } | undefined
    : undefined;
  const error = modeError || validationErrors[0] || "";
  const parameterDescriptors = describeVideoGenerationParameters(capability);
  const hunyuanT2v = civitai && input.model === "hunyuan";
  const t2v = input.mode === "t2v" || hunyuanT2v;
  const ltxI2v = civitai && input.model === "ltx2.3" && input.mode === "i2v";
  return {
    error: error || undefined,
    controls,
    capability,
    parameterDescriptors,
    referenceControls,
    duration,
    durationOptions,
    showAspectRatio,
    ratio,
    resolution,
    fps,
    loras: error ? undefined : buildVideoStudioLoras(controls.showLora, input.loras),
    showGenerateAudio,
    generateAudio: showGenerateAudio ? generateAudio : undefined,
    negativePrompt,
    seed,
    watermark,
    promptExpansion,
    returnLastFrame,
    audioUrl,
    width: dimensions?.width,
    height: dimensions?.height,
    steps,
    guidance,
    modelVariant,
    frames,
    audioMode,
    quantity,
    generationMode,
    frameGuideStrength,
    safetyChecker,
    shift,
    turbo,
    sampler,
    scheduler,
    usePro,
    imageUrl: t2v ? undefined : input.firstFrame || undefined,
    lastFrameUrl: t2v || ltxI2v ? undefined : input.lastFrame || undefined,
  };
}
