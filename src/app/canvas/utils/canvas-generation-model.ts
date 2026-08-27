import {
  API_CAPABILITIES,
  ensureApiRelaySettings,
  modelMatchesCapability,
  providerModelsForCapability,
  resolveProviderModelSelection,
  type ApiCapability,
  type ProviderModelSelection,
} from "@/stores/api-relay-config";
import type { AiConfig } from "@/stores/use-config-store";
import type {
  CanvasGenerationMode,
  CanvasNodeMetadata,
} from "../types";

export function applyExplicitCanvasGenerationModel(
  config: AiConfig,
  mode: CanvasGenerationMode,
  modelOrSelection: string | ProviderModelSelection,
): AiConfig {
  const selectedModel = typeof modelOrSelection === "string"
    ? modelOrSelection.trim()
    : String(modelOrSelection.model || "").trim();
  if (!selectedModel) return config;
  const selectedProviderId = typeof modelOrSelection === "string"
    ? ""
    : String(modelOrSelection.providerId || "").trim();
  const apiRouting = {
    ...config.apiRouting,
    [mode]: {
      source: "relay" as const,
      providerId: selectedProviderId,
      model: selectedModel,
    },
  };
  return {
    ...config,
    apiRouting,
    requestModelSelections: {
      ...config.requestModelSelections,
      [mode]: typeof modelOrSelection === "string"
        ? selectedModel
        : { providerId: selectedProviderId, model: selectedModel },
    },
    model: selectedModel,
    textModel: mode === "text" ? selectedModel : config.textModel,
    imageModel: mode === "image" ? selectedModel : config.imageModel,
    videoModel: mode === "video" ? selectedModel : config.videoModel,
    audioModel: mode === "audio" ? selectedModel : config.audioModel,
  };
}

export function resolveCanvasGenerationModelSelection(
  config: AiConfig,
  metadata: CanvasNodeMetadata | undefined,
  mode: CanvasGenerationMode,
): { selection: ProviderModelSelection | null; legacyModel: string } {
  const exactVideoScope = mode === "video" &&
    metadata?.videoGenerationScope?.providerId?.trim() &&
    metadata.videoGenerationScope.model?.trim()
      ? {
          providerId: metadata.videoGenerationScope.providerId.trim(),
          model: metadata.videoGenerationScope.model.trim(),
        }
      : undefined;
  if (exactVideoScope) {
    return { selection: exactVideoScope, legacyModel: "" };
  }
  const model = firstNonEmptyModel(
    mode === "video" ? metadata?.seedanceModel : undefined,
    metadata?.model,
    mode === "video" ? metadata?.videoGenerationScope?.model : undefined,
  );
  const providerId = firstNonEmptyModel(
    metadata?.modelProviderId,
    mode === "video" ? metadata?.videoGenerationScope?.providerId : undefined,
  );

  if (model && providerId) {
    return { selection: { providerId, model }, legacyModel: "" };
  }
  if (model) {
    const resolution = resolveProviderModelSelection(config, mode, model);
    return resolution.status === "resolved"
      ? { selection: resolution.selection, legacyModel: "" }
      : { selection: null, legacyModel: model };
  }

  const route = config.apiRouting[mode];
  if (route?.providerId && route.model) {
    return {
      selection: { providerId: route.providerId, model: route.model },
      legacyModel: "",
    };
  }
  return { selection: null, legacyModel: "" };
}

export function replayableCanvasGenerationModel(
  config: AiConfig,
  metadata: CanvasNodeMetadata | undefined,
  mode: CanvasGenerationMode,
) {
  const exactVideoScopeModel = mode === "video" &&
    metadata?.videoGenerationScope?.providerId?.trim() &&
    metadata.videoGenerationScope.model?.trim()
      ? metadata.videoGenerationScope.model.trim()
      : "";
  const candidate = firstNonEmptyModel(
    exactVideoScopeModel,
    mode === "video" ? metadata?.seedanceModel : undefined,
    metadata?.model,
    mode === "video" ? metadata?.videoGenerationScope?.model : undefined,
  );
  if (!candidate) return "";

  const capability = mode as ApiCapability;
  const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
  const declaredCapabilities = API_CAPABILITIES.filter((candidateCapability) =>
    normalized.apiRelays.some(
      (provider) =>
        provider.capabilities.includes(candidateCapability) &&
        providerModelsForCapability(provider, candidateCapability).includes(candidate),
    ),
  );
  if (declaredCapabilities.includes(capability)) return candidate;
  if (declaredCapabilities.length) return "";

  if (modelMatchesCapability(candidate, capability)) return candidate;
  if (
    API_CAPABILITIES.some(
      (candidateCapability) =>
        candidateCapability !== capability &&
        modelMatchesCapability(candidate, candidateCapability),
    )
  ) {
    return "";
  }

  return candidate;
}

function firstNonEmptyModel(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
}
