import { providerCapabilityIsRunnable, type ApiRelayProvider } from "@/stores/api-relay-config";
import type { VideoCreateInput } from "@/studio/adapters/types";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_VIDEO_POLL_INTERVAL_MS, STUDIO_VIDEO_POLL_WINDOW_MS } from "@/studio/adapters/contracts";
import { studioVideoAdapterFields } from "@/studio/civitai-ui-options";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { STUDIO_PROVIDERS } from "@/studio/wiring";
import { providerById } from "./proxy";

function assertRunnableVideoCapability(provider: ApiRelayProvider, providerName?: string) {
  if (!providerCapabilityIsRunnable(provider, "video")) {
    throw new Error(`${providerName || provider.name || provider.id} 视频能力尚未接线，已阻止发送`);
  }
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
  loras?: Record<string, number> | Readonly<Record<string, number>>;
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
  const civitai = studioVideoAdapterFields(adapter.id, model, {
    fps: input.fps,
    loras: input.loras,
    generateAudio: input.generateAudio,
    aspectRatio: input.aspectRatio,
    width: input.width,
    height: input.height,
  });
  const videoInput: VideoCreateInput = {
    model,
    prompt,
    duration: input.duration,
    aspectRatio: civitai.aspectRatio,
    resolution: input.resolution,
    imageUrl: input.imageUrl,
    lastFrameUrl: input.lastFrameUrl,
    imageUrls: input.imageUrls,
    ...(typeof civitai.width === "number" ? { width: civitai.width } : {}),
    ...(typeof civitai.height === "number" ? { height: civitai.height } : {}),
    generateAudio: civitai.generateAudio,
    negativePrompt: input.negativePrompt,
    fps: civitai.fps,
    loras: civitai.loras,
  };
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
    while (Date.now() - started < STUDIO_VIDEO_POLL_WINDOW_MS) {
      tick += 1;
      input.onTick?.(tick);
      const state = await pollStudioVideo(input);
      if (state.status === "completed" && state.url) {
        if (typeof window !== "undefined") {
          const { recordGeneratedWork } = await import("@/studio/history");
          recordGeneratedWork({
            kind: "video",
            title: (input.workTitle || input.prompt || input.model || "视频").slice(0, 40),
            prompt: input.prompt || "",
            model: input.model || "",
            urls: [state.url],
          });
        }
        return state.url;
      }
      if (state.status === "failed") throw new Error(state.error || "视频生成失败");
      const remaining = STUDIO_VIDEO_POLL_WINDOW_MS - (Date.now() - started);
      if (remaining <= 0) break;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(STUDIO_VIDEO_POLL_INTERVAL_MS, remaining)));
    }
    throw new Error("视频生成超时");
  } catch (err) {
    if (input.ticketId) useOpsStore.getState().refund(input.ticketId);
    throw err;
  }
}
