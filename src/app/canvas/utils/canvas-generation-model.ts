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

/**
 * Pin a Canvas node's explicit model in both the legacy request field and the
 * capability-specific field consumed by request routing. The latter removes
 * the ambiguity for model IDs intentionally classified for more than one
 * capability (for example, both text and image).
 */
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

/**
 * Resolve the selection shown by a global Canvas picker without guessing a
 * provider for legacy duplicate model IDs. An unavailable/ambiguous legacy
 * model remains visible through `legacyModel` until the user chooses a pair.
 * Do not remap the user's provider — 选哪个就是哪个.
 */
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
  const route = config.apiRouting[mode];
  const fallbackSelection = route?.providerId && route.model
    ? { selection: { providerId: route.providerId, model: route.model }, legacyModel: "" }
    : { selection: null, legacyModel: "" };

  if (model && providerId) {
    // Explicit provider/model pairs are authoritative, unless the provider
    // itself classifies the model for a different capability. That stale pair
    // happens after a mode switch and must not make an image model masquerade
    // as the selected video model.
    if (modelMatchesExplicitProviderCapability(config, providerId, model, mode)) {
      return { selection: { providerId, model }, legacyModel: "" };
    }
    return fallbackSelection;
  }
  if (model) {
    const resolution = resolveProviderModelSelection(config, mode, model);
    return resolution.status === "resolved"
      ? { selection: resolution.selection, legacyModel: "" }
      : { selection: null, legacyModel: model };
  }

  return fallbackSelection;
}

/**
 * Return a node's saved model only when it still belongs to the selected mode.
 *
 * Explicit provider classification is authoritative for opaque/custom model
 * ids. If its provider later disappears, the node selection remains explicit
 * so request routing reports that no provider owns it instead of silently
 * substituting the workspace default. A model explicitly classified only for a
 * different capability is the one case that is treated as a cross-mode stale
 * value and ignored.
 */
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

  // An unclassified opaque node value is still explicit user state. Keeping it
  // lets strict route resolution block with a useful ownership error.
  return candidate;
}

function firstNonEmptyModel(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
}

function modelMatchesExplicitProviderCapability(
  config: AiConfig,
  providerId: string,
  model: string,
  mode: CanvasGenerationMode,
) {
  const capability = mode as ApiCapability;
  const provider = ensureApiRelaySettings({ ...config, channelMode: "local" })
    .apiRelays.find((candidate) => candidate.id === providerId);
  if (!provider) return false;
  const declaredCapabilities = API_CAPABILITIES.filter((candidateCapability) =>
    provider.capabilities.includes(candidateCapability) &&
    providerModelsForCapability(provider, candidateCapability).includes(model),
  );
  if (declaredCapabilities.length) return declaredCapabilities.includes(capability);
  return modelMatchesCapability(model, capability);
}
