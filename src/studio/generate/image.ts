import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_PROVIDERS } from "@/studio/wiring";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { collectImageRefs } from "@/studio/image-refs";
import { providerById } from "./proxy";

export type StudioImageResult = {
  url: string;
  urls: string[];
  model: string;
  providerId: string;
};

export async function generateStudioImage(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  model?: string;
  providerId?: string;
  size?: string;
  aspectRatio?: string;
  imageUrl?: string;
  imageUrls?: string[];
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  n?: number;
  operation?: "generate" | "edit";
  loras?: Record<string, number> | Readonly<Record<string, number>>;
  strength?: number;
}): Promise<StudioImageResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写提示词");
  const providerId = String(input.providerId || "").trim();
  const model = String(input.model || "").trim();
  if (!providerId || !model) throw new Error("请先选择供应商和模型。选哪个就走哪个，不会自动改线路。");
  const key = `${providerId}::${model}`;
  const count = Math.max(1, Math.min(4, input.n || 1));
  const ticket = useOpsStore.getState().spend("image", model, modelPoints(key) * count);
  try {
    const provider = providerById(providerId, input.relays);
    const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
    const adapter = adapterForProvider(
      { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
      model,
    );
    if (!adapter.generateImage) throw new Error(`${adapter.label} 不支持生图`);
    const refs = collectImageRefs(input);
    const result = await Promise.race([
      adapter.generateImage(
        { provider },
        {
          model,
          prompt,
          size: input.size,
          aspectRatio: input.aspectRatio,
          imageUrl: refs[0],
          imageUrls: refs,
          width: input.width,
          height: input.height,
          seed: input.seed,
          negativePrompt: input.negativePrompt,
          n: count,
          operation: input.operation,
          loras: input.loras,
          strength: input.strength,
        },
      ),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("生图超时，请换模型或稍后重试")), 180_000);
      }),
    ]);
    const urls = (result.urls && result.urls.length ? result.urls : [result.url]).filter(Boolean);
    if (!urls[0]) throw new Error("没有返回图片");
    return { url: urls[0], urls, model, providerId };
  } catch (err) {
    useOpsStore.getState().refund(ticket.id);
    throw err;
  }
}
