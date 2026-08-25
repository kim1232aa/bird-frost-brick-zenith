import type { ProviderModelSelection } from "@/stores/api-relay-config";

/**
 * Video placeholders created directly on the canvas have no workflow owner.
 * Their selection must reset any provider/model-bound parameter snapshot.
 */
export function standaloneSeedance2VideoModelPatch(modelOrSelection: string | ProviderModelSelection) {
    const selectedModel = typeof modelOrSelection === "string"
        ? modelOrSelection.trim()
        : String(modelOrSelection.model || "").trim();
    const modelProviderId = typeof modelOrSelection === "string"
        ? undefined
        : String(modelOrSelection.providerId || "").trim() || undefined;
    return {
        model: selectedModel,
        modelProviderId,
        seedanceModel: selectedModel,
        videoGenerationSettings: undefined,
        videoGenerationScope: undefined,
        videoGenerationCapabilityId: undefined,
        videoWireFormat: undefined,
    };
}

export function isStandaloneSeedance2VideoPlaceholder(metadata: {
    seedanceWorkflowRole?: string;
    seedanceWorkflowNodeId?: string;
} | null | undefined) {
    return metadata?.seedanceWorkflowRole === "placeholder" && !metadata.seedanceWorkflowNodeId;
}

export function standaloneVideoSettingsAccess(model: string, hasExactRoute: boolean) {
    if (!model.trim()) return "select-model" as const;
    return hasExactRoute ? "ready" as const : "route-unavailable" as const;
}
