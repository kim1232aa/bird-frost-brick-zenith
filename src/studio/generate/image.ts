import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_PROVIDERS, STUDIO_ROUTES } from "@/studio/wiring";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { providerById } from "./proxy";

export type StudioImageResult = {
  url: string;
  model: string;
  providerId: string;
};

export async function generateStudioImage(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  model?: string;
  providerId?: string;
  size?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  n?: number;
}): Promise<StudioImageResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写提示词");
  const providerId = input.providerId || STUDIO_ROUTES.image.providerId;
  const model = input.model || STUDIO_ROUTES.image.model;
  const key = `${providerId}::${model}`;
  const ticket = useOpsStore.getState().spend("image", model, modelPoints(key));
  try {
    const provider = providerById(providerId, input.relays);
    const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
    const adapter = adapterForProvider(
      { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
      model,
    );
    if (!adapter.generateImage) throw new Error(`${adapter.label} 不支持生图`);
    const result = await adapter.generateImage(
      { provider },
      {
        model,
        prompt,
        size: input.size,
        imageUrl: input.imageUrl,
        width: input.width,
        height: input.height,
        seed: input.seed,
        negativePrompt: input.negativePrompt,
        n: input.n,
      },
    );
    return { url: result.url, model, providerId };
  } catch (err) {
    useOpsStore.getState().refund(ticket.id);
    throw err;
  }
}
