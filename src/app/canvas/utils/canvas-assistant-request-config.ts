import { resolveProviderModelSelection, type ApiBoardRouteKey, type ApiCapability, type ProviderModelSelection } from "@/stores/api-relay-config";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasAssistantMode = "ask" | "image";

export type CanvasAssistantRequest = {
    config: AiConfig;
    boardRouteKey: Extract<ApiBoardRouteKey, "imagePrompt" | "imageGeneration">;
};

export function buildCanvasAssistantRequestConfig(config: AiConfig, mode: CanvasAssistantMode): CanvasAssistantRequest | null {
    const capability: ApiCapability = mode === "image" ? "image" : "text";
    const boardRouteKey: CanvasAssistantRequest["boardRouteKey"] = mode === "image" ? "imageGeneration" : "imagePrompt";
    const selectedModel = String(mode === "image" ? config.imageModel : config.textModel).trim();
    if (!selectedModel) return null;

    const capabilityRoute = config.apiRouting[capability];
    const boardRoute = config.apiBoardRouting[boardRouteKey];
    const exactSelections: ProviderModelSelection[] = [
        ...(capabilityRoute?.providerId && capabilityRoute.model === selectedModel
            ? [{ providerId: capabilityRoute.providerId, model: selectedModel }]
            : []),
        ...(boardRoute?.mode === "custom" && boardRoute.providerId && boardRoute.model === selectedModel
            ? [{ providerId: boardRoute.providerId, model: selectedModel }]
            : []),
    ];
    const exactResolution = exactSelections
        .map((selection) => resolveProviderModelSelection(config, capability, selection))
        .find((resolution) => resolution.status === "resolved");
    const resolution = exactResolution || resolveProviderModelSelection(config, capability, selectedModel);
    if (resolution.status !== "resolved") return null;

    return {
        boardRouteKey,
        config: {
            ...config,
            model: selectedModel,
            ...(capability === "image" ? { imageModel: selectedModel } : { textModel: selectedModel }),
            apiBoardRouting: {
                ...config.apiBoardRouting,
                [boardRouteKey]: { mode: "custom", providerId: resolution.selection.providerId, model: resolution.selection.model },
            },
        },
    };
}
