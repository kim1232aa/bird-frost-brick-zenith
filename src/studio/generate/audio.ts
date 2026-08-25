import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_PROVIDERS, STUDIO_ROUTES } from "@/studio/wiring";
import { providerById } from "./proxy";

export async function generateStudioAudio(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  model?: string;
  providerId?: string;
  voice?: string;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写旁白/台词");
  const providerId = input.providerId || STUDIO_ROUTES.audio.providerId;
  const model = input.model || STUDIO_ROUTES.audio.model;
  const provider = providerById(providerId, input.relays);
  const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
  const adapter = adapterForProvider(
    { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
    model,
  );
  if (!adapter.generateAudio) throw new Error(`${adapter.label} 不支持音频。到接线页填阿里云 Token Plan 或 OpenAI 兼容 TTS。`);
  const result = await adapter.generateAudio({ provider }, { model, prompt, voice: input.voice });
  return { url: result.url, model, providerId };
}
