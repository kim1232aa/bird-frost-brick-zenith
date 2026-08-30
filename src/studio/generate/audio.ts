import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { STUDIO_PROVIDERS } from "@/studio/wiring";
import { providerById } from "./proxy";

export async function generateStudioAudio(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  model?: string;
  providerId?: string;
  voice?: string;
  format?: string;
  speed?: number;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("请填写旁白/台词");
  const providerId = String(input.providerId || "").trim();
  const model = String(input.model || "").trim();
  if (!providerId || !model) throw new Error("请先选择供应商和模型。选哪个就走哪个，不会自动改线路。");
  const provider = providerById(providerId, input.relays);
  const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
  const capabilities = blueprint?.capabilities || provider.capabilities || [];
  if (!capabilities.includes("audio")) {
    throw new Error(`${blueprint?.name || provider.name || providerId} 未配置音频能力。请选择已声明 TTS 的 DashScope 或 OpenAI 兼容供应商。`);
  }
  const adapter = adapterForProvider(
    { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
    model,
  );
  if (!adapter.generateAudio) throw new Error(`${adapter.label} 不支持音频。请选择已配置 DashScope 原生 TTS 或 OpenAI 兼容 TTS 能力的供应商。`);
  const result = await adapter.generateAudio(
    { provider },
    { model, prompt, voice: input.voice, format: input.format, speed: input.speed },
  );
  return { url: result.url, model, providerId };
}
