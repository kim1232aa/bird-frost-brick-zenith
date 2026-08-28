import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { STUDIO_PROVIDERS } from "@/studio/wiring";
import { providerById } from "./proxy";

export async function generateStudioText(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  system?: string;
  model?: string;
  providerId?: string;
  json?: boolean;
  imageUrl?: string;
}) {
  const providerId = String(input.providerId || "").trim();
  const model = String(input.model || "").trim();
  if (!providerId || !model) throw new Error("请先选择供应商和模型。选哪个就走哪个，不会自动改线路。");
  const ticket = useOpsStore.getState().spend("text", model, modelPoints(`${providerId}::${model}`));
  try {
    const provider = providerById(providerId, input.relays);
    const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
    const adapter = adapterForProvider(
      { adapterType: blueprint?.adapter || provider.adapterType, baseUrl: provider.baseUrl },
      model,
    );
    if (!adapter.generateText) throw new Error(`${adapter.label} 不支持文本`);
    const result = await adapter.generateText(
      { provider },
      { model, prompt: input.prompt, system: input.system, json: input.json, imageUrl: input.imageUrl },
    );
    return { text: result.text, model, providerId };
  } catch (err) {
    useOpsStore.getState().refund(ticket.id);
    throw err;
  }
}