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
  resolveVideoModelCapability,
  type VideoCapabilityProvider,
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
  if (civitai && capability.requiresExplicitProfile) {
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
  firstFrame?: string;
  lastFrame?: string;
  audio: boolean;
  fps: number;
  loras: ReadonlyArray<{ resource: string; weight: number }>;
  isArk: boolean;
  host?: string;
  protocol?: string;
  provider?: VideoCapabilityProvider;
  videoCapabilityProfiles?: VideoCapabilityProvider["videoCapabilityProfiles"];
}) {
  const controls = videoStudioCivitaiControls(input.adapterType, input.model, input.providerId);
  const referenceControls = videoStudioReferenceControls(input);
  const capability = resolveVideoModelCapability({ model: input.model, provider: capabilityProvider(input) });
  const xaiGenerateAudio = capability.id === "xai-imagine-video"
    && capability.generationParameters.audio.status === "supported"
    && capability.generationParameters.audio.valueType === "boolean";
  const civitai = isCivitaiStudioAdapter(input.adapterType, input.providerId);
  const civitaiDurations = civitai ? civitaiVideoDurationOptions(input.model) : undefined;
  const durationOptions = civitaiDurations || videoDurationOptions(input.host, input.protocol);
  const duration = civitaiDurations
    ? snapDuration(input.duration, civitaiDurations)
    : normalizeVideoDuration(input.duration, input.host, input.protocol);
  const error = videoStudioModeError(input);
  const fps = controls.fpsSpec ? snapVideoStudioFps(input.model, input.fps) : undefined;
  const hunyuanT2v = civitai && input.model === "hunyuan";
  const t2v = input.mode === "t2v" || hunyuanT2v;
  const ltxI2v = civitai && input.model === "ltx2.3" && input.mode === "i2v";
  const showGenerateAudio = input.isArk || controls.showGenerateAudio || xaiGenerateAudio;
  return {
    error: error || undefined,
    controls,
    referenceControls,
    duration,
    durationOptions,
    fps,
    loras: error ? undefined : buildVideoStudioLoras(controls.showLora, input.loras),
    showGenerateAudio,
    generateAudio: showGenerateAudio ? input.audio : undefined,
    imageUrl: t2v ? undefined : input.firstFrame || undefined,
    lastFrameUrl: t2v || ltxI2v ? undefined : input.lastFrame || undefined,
  };
}
