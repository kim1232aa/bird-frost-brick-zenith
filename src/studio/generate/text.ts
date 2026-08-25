import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { adapterForProvider } from "@/studio/adapters";
import { modelPoints, useOpsStore } from "@/studio/ops";
import { STUDIO_PROVIDERS, STUDIO_ROUTES } from "@/studio/wiring";
import { providerById } from "./proxy";

export async function generateStudioText(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  system?: string;
  model?: string;
  providerId?: string;
  json?: boolean;
}) {
  const providerId = input.providerId || STUDIO_ROUTES.text.providerId;
  const model = input.model || STUDIO_ROUTES.text.model;
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
      { model, prompt: input.prompt, system: input.system, json: input.json },
    );
    return { text: result.text, model, providerId };
  } catch (err) {
    useOpsStore.getState().refund(ticket.id);
    throw err;
  }
}