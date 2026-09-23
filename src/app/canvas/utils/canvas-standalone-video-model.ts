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

/**
 * A workflow-placed placeholder keeps its shot/workflow identity, but the
 * provider/model-bound snapshot belongs to the previous model. `videoGenerationScope`
 * outranks `model` in both the picker resolver and the submit route resolver, so a
 * stale scope would silently resubmit the old model. Clearing the snapshot — and only
 * the snapshot — is what makes the new selection the one that actually runs.
 */
export function seedance2VideoPlaceholderModelPatch(modelOrSelection: string | ProviderModelSelection) {
    return {
        ...standaloneSeedance2VideoModelPatch(modelOrSelection),
        videoGenerationOperationMigration: undefined,
    };
}

export function isStandaloneSeedance2VideoPlaceholder(metadata: {
    seedanceWorkflowRole?: string;
    seedanceWorkflowNodeId?: string;
} | null | undefined) {
    return metadata?.seedanceWorkflowRole === "placeholder" && !metadata.seedanceWorkflowNodeId;
}

export function isEditableSeedance2VideoPlaceholder(metadata: {
    seedanceWorkflowRole?: string;
} | null | undefined) {
    return metadata?.seedanceWorkflowRole === "placeholder";
}

export function standaloneVideoSettingsAccess(modelOrSelection: string | ProviderModelSelection | null | undefined, hasExactRoute: boolean) {
    const model = typeof modelOrSelection === "string"
        ? modelOrSelection.trim()
        : String(modelOrSelection?.model || "").trim();
    if (!model) return "select-model" as const;
    return hasExactRoute ? "ready" as const : "route-unavailable" as const;
}
