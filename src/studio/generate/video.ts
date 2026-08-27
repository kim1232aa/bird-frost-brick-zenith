import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { STUDIO_PROVIDERS, STUDIO_ROUTES } from "@/studio/wiring";
import { providerById } from "./proxy";

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
  generateAudio?: boolean;
  negativePrompt?: string;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写视频提示词");
  const providerId = input.providerId || STUDIO_ROUTES.video.providerId;
  const model = input.model || STUDIO_ROUTES.video.model;
  const key = `${providerId}::${model}`;
  const ticket = useOpsStore.getState().spend("video", model, modelPoints(key));
  try {
    const provider = providerById(providerId, input.relays);
    const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
    const adapter = adapterForProvider(
      { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
      model,
    );
    if (!adapter.createVideo) throw new Error(`${adapter.label} 不支持生视频`);
    const created = await adapter.createVideo(
      { provider },
      {
        model,
        prompt,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        imageUrl: input.imageUrl,
        lastFrameUrl: input.lastFrameUrl,
        imageUrls: input.imageUrls,
        generateAudio: input.generateAudio,
        negativePrompt: input.negativePrompt,
      },
    );
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
}) {
  try {
    for (let i = 0; i < 60; i += 1) {
      input.onTick?.(i + 1);
      const state = await pollStudioVideo(input);
      if (state.status === "completed" && state.url) return state.url;
      if (state.status === "failed") throw new Error(state.error || "视频生成失败");
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
    }
    throw new Error("视频生成超时");
  } catch (err) {
    if (input.ticketId) useOpsStore.getState().refund(input.ticketId);
    throw err;
  }
}
