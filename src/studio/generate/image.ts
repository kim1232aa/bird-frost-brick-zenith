import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_PROVIDERS, STUDIO_ROUTES } from "@/studio/wiring";
import { modelPoints, useOpsStore } from "@/studio/ops";
import type { StudioLora } from "@/studio/adapters/types";
import { providerById } from "./proxy";

export type StudioImageResult = {
  url: string;
  urls: string[];
  model: string;
  providerId: string;
};

function refsOf(input: { imageUrl?: string; imageUrls?: string[] }) {
  return [...(input.imageUrls || []), input.imageUrl || ""].map((item) => item.trim()).filter(Boolean).slice(0, 3);
}

export async function generateStudioImage(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  model?: string;
  providerId?: string;
  size?: string;
  imageUrl?: string;
  imageUrls?: string[];
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  n?: number;
  loras?: StudioLora[];
  operation?: "create" | "edit" | "variant";
}): Promise<StudioImageResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写提示词");
  const providerId = input.providerId || STUDIO_ROUTES.image.providerId;
  const model = input.model || STUDIO_ROUTES.image.model;
  const key = `${providerId}::${model}`;
  const quantity = Math.max(1, Math.min(4, input.n || 1));
  const ticket = useOpsStore.getState().spend("image", model, modelPoints(key) * quantity);
  try {
    const provider = providerById(providerId, input.relays);
    const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
    const adapter = adapterForProvider(
      { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
      model,
    );
    if (!adapter.generateImage) throw new Error(`${adapter.label} 不支持生图`);
    const imageUrls = refsOf(input);
    const result = await adapter.generateImage(
      { provider },
      {
        model,
        prompt,
        size: input.size,
        imageUrl: imageUrls[0],
        imageUrls,
        width: input.width,
        height: input.height,
        seed: input.seed,
        negativePrompt: input.negativePrompt,
        n: quantity,
        loras: input.loras,
        operation: input.operation,
      },
    );
    const urls = [...(result.urls || []), result.url].filter(Boolean);
    const unique = [...new Set(urls)];
    if (!unique[0]) throw new Error("没有返回图片");
    return { url: unique[0], urls: unique, model, providerId };
  } catch (err) {
    useOpsStore.getState().refund(ticket.id);
    throw err;
  }
}
