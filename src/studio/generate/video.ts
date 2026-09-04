import { resolveVideoModelCapability } from "@/services/api/video-model-capabilities";
import { providerCapabilityIsRunnable, type ApiRelayProvider } from "@/stores/api-relay-config";
import type { VideoCreateInput } from "@/studio/adapters/types";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_VIDEO_POLL_INTERVAL_MS, studioVideoPollWindowMs } from "@/studio/adapters/contracts";
import { studioVideoAdapterFields } from "@/studio/civitai-ui-options";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { STUDIO_PROVIDERS } from "@/studio/wiring";
import { toDataUrlIfLocal } from "@/studio/persist-url";
import { providerById } from "./proxy";

function assertRunnableVideoCapability(provider: ApiRelayProvider, providerName?: string) {
  if (!providerCapabilityIsRunnable(provider, "video")) {
    throw new Error(`${providerName || provider.name || provider.id} 视频能力尚未接线，已阻止发送`);
  }
}

function allocateStudioVideoReferences(
  provider: ApiRelayProvider,
  model: string,
  input: { imageUrl?: string; lastFrameUrl?: string; imageUrls?: string[] },
) {
  const capability = resolveVideoModelCapability({ model, provider });
  const first = String(input.imageUrl || input.imageUrls?.[0] || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  const extras = (input.imageUrls || []).map((url) => String(url || "").trim()).filter(Boolean);
  const refs = capability.referenceImagePolicy;
  const refsSupported = Boolean(refs && refs.supported);
  const firstLast = Boolean(capability.supportsFirstLastFrame || capability.requiresFirstLastFrame);
  if (refsSupported) {
    const max = refs && refs.supported && refs.max != null ? refs.max : extras.length + 1;
    const all = Array.from(new Set([first, ...extras].filter(Boolean))).slice(0, Math.max(1, max));
    return { imageUrl: all[0], lastFrameUrl: undefined as string | undefined, imageUrls: all.length ? all : undefined };
  }
  if (firstLast) {
    const lastFrameUrl = last && last !== first ? last : undefined;
    const all = [first, lastFrameUrl].filter(Boolean) as string[];
    return { imageUrl: first || undefined, lastFrameUrl, imageUrls: all.length ? all : undefined };
  }
  if (capability.supportsFirstFrame) {
    return {
      imageUrl: first || undefined,
      lastFrameUrl: undefined as string | undefined,
      imageUrls: first ? [first] : undefined,
    };
  }
  return {
    imageUrl: undefined as string | undefined,
    lastFrameUrl: undefined as string | undefined,
    imageUrls: undefined as string[] | undefined,
  };
}

export function buildStudioVideoCreateInput(input: VideoCreateInput & { adapterId: string }): VideoCreateInput {
  const adapterFields = studioVideoAdapterFields(input.adapterId, input.model, {
    fps: input.fps,
    loras: input.loras,
    generateAudio: input.generateAudio,
    aspectRatio: input.aspectRatio,
    width: input.width,
    height: input.height,
  });
  return {
    model: input.model,
    prompt: input.prompt,
    duration: input.duration,
    aspectRatio: adapterFields.aspectRatio,
    resolution: input.resolution,
    imageUrl: input.imageUrl,
    lastFrameUrl: input.lastFrameUrl,
    imageUrls: input.imageUrls,
    ...(typeof adapterFields.width === "number" ? { width: adapterFields.width } : {}),
    ...(typeof adapterFields.height === "number" ? { height: adapterFields.height } : {}),
    generateAudio: adapterFields.generateAudio,
    negativePrompt: input.negativePrompt,
    fps: adapterFields.fps,
    seed: input.seed,
    steps: input.steps,
    guidance: input.guidance,
    modelVariant: input.modelVariant,
    watermark: input.watermark,
    promptExpansion: input.promptExpansion,
    returnLastFrame: input.returnLastFrame,
    audioUrl: input.audioUrl,
    loras: adapterFields.loras,
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
  };
}

export async function createStudioVideo(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  model?: string;
  providerId?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  imageUrls?: string[];
  width?: number;
  height?: number;
  generateAudio?: boolean;
  negativePrompt?: string;
  fps?: number;
  seed?: number;
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  audioUrl?: string;
  loras?: Record<string, number> | Readonly<Record<string, number>>;
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
}) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写视频提示词");
  const providerId = String(input.providerId || "").trim();
  const model = String(input.model || "").trim();
  if (!providerId || !model) throw new Error("请先选择供应商和模型。选哪个就走哪个，不会自动改线路。");
  const key = `${providerId}::${model}`;
  const provider = providerById(providerId, input.relays);
  const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
  assertRunnableVideoCapability(provider, blueprint?.name);
  const adapter = adapterForProvider(
    { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
    model,
  );
  if (!adapter.createVideo) throw new Error(`${adapter.label} 不支持生视频`);
  const allocated = allocateStudioVideoReferences(provider, model, input);
  const imageUrl = allocated.imageUrl ? await toDataUrlIfLocal(allocated.imageUrl) : undefined;
  const lastFrameUrl = allocated.lastFrameUrl ? await toDataUrlIfLocal(allocated.lastFrameUrl) : undefined;
  const imageUrls = allocated.imageUrls
    ? await Promise.all(allocated.imageUrls.map((url) => toDataUrlIfLocal(url)))
    : undefined;
  const videoInput = buildStudioVideoCreateInput({
    adapterId: adapter.id,
    model,
    prompt,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    imageUrl,
    lastFrameUrl,
    imageUrls,
    width: input.width,
    height: input.height,
    generateAudio: input.generateAudio,
    negativePrompt: input.negativePrompt,
    fps: input.fps,
    seed: input.seed,
    steps: input.steps,
    guidance: input.guidance,
    modelVariant: input.modelVariant,
    watermark: input.watermark,
    promptExpansion: input.promptExpansion,
    returnLastFrame: input.returnLastFrame,
    audioUrl: input.audioUrl,
    loras: input.loras,
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
  });
  const ticket = useOpsStore.getState().spend("video", model, modelPoints(key));
  try {
    const created = await adapter.createVideo({ provider }, videoInput);
    return { id: created.id, model, providerId, adapter: adapter.id, ticketId: ticket.id };
  } catch (err) {
    useOpsStore.getState().refund(ticket.id);
    throw err;
  }
}

export async function pollStudioVideo(input: {
  relays: ApiRelayProvider[];
  providerId: string;
  taskId: string;
  model?: string;
}) {
  const provider = providerById(input.providerId, input.relays);
  const blueprint = STUDIO_PROVIDERS.find((item) => item.id === input.providerId);
  assertRunnableVideoCapability(provider, blueprint?.name);
  const adapter = adapterForProvider(
    { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
    input.model,
  );
  if (!adapter.pollVideo) throw new Error(`${adapter.label} 不支持视频轮询`);
  return adapter.pollVideo({ provider }, input.taskId);
}

export async function waitStudioVideo(input: {
  relays: ApiRelayProvider[];
  providerId: string;
  taskId: string;
  model?: string;
  ticketId?: string;
  onTick?: (n: number) => void;
  prompt?: string;
  workTitle?: string;
}) {
  try {
    const started = Date.now();
    let tick = 0;
    const windowMs = studioVideoPollWindowMs(input.model);
    while (Date.now() - started < windowMs) {
      tick += 1;
      input.onTick?.(tick);
      const state = await pollStudioVideo(input);
      if (state.status === "completed" && state.url) {
        if (typeof window !== "undefined") {
          const { recordGeneratedWork } = await import("@/studio/history");
          const saved = await recordGeneratedWork({
            kind: "video",
            title: (input.workTitle || input.prompt || input.model || "视频").slice(0, 40),
            prompt: input.prompt || "",
            model: input.model || "",
            providerId: input.providerId,
            urls: [state.url],
          });
          if (saved?.persistError) {
            throw new Error(`作品库保存失败：${saved.persistError}`);
          }
          const persisted = saved?.urls?.[0];
          if (persisted) return persisted;
        }
        return state.url;
      }
      if (state.status === "failed") throw new Error(state.error || "视频生成失败");
      const remaining = windowMs - (Date.now() - started);
      if (remaining <= 0) break;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(STUDIO_VIDEO_POLL_INTERVAL_MS, remaining)));
    }
    throw new Error("视频生成超时");
  } catch (err) {
    if (input.ticketId) useOpsStore.getState().refund(input.ticketId);
    throw err;
  }
}
