import { explicitMediaRequestModel, resolveApiRequestRoute } from "@/services/api/ai-routing";
import { readCivitaiCatalogServiceSnapshot } from "@/services/api/civitai-client";
import {
    resolveImageModelCapability,
    type ImageOperation,
    type ResolvedImageModelCapability,
} from "@/services/api/image-model-capabilities";
import {
    resolveVideoModelCapability,
    type ResolvedVideoModelCapability,
} from "@/services/api/video-model-capabilities";
import {
    readVideoGenerationSettings,
    type AiConfig,
    type ImageAdvancedSettingsScope,
    type VideoGenerationOperation,
    type VideoGenerationSettings,
    type VideoGenerationSettingsScope,
} from "@/stores/use-config-store";
import { providerDisplayName, type ApiRelayProvider } from "@/stores/api-relay-config";

export type ResolvedImageSettingsContext = {
    scope: ImageAdvancedSettingsScope;
    capability: ResolvedImageModelCapability;
    routeError?: string;
};

export type ResolvedVideoSettingsContext = {
    capability: ResolvedVideoModelCapability;
    scope: VideoGenerationSettingsScope;
    settings: VideoGenerationSettings;
    operationResolution: "resolved" | "blocked";
    routeError?: string;
};

export function resolveImageSettingsContext(config: AiConfig, operation: ImageOperation): ResolvedImageSettingsContext {
    const explicitModel = explicitMediaRequestModel(config, "image");
    const requestedModel = requestSelectionModel(explicitModel) || configuredSettingsModel(config, "image", "imageGeneration");
    let route: ReturnType<typeof resolveApiRequestRoute>;
    try {
        route = resolveApiRequestRoute(config, "image", explicitModel, "imageGeneration");
    } catch (error) {
        if (!(error instanceof Error)) throw error;
        return {
            scope: { providerId: "", model: requestedModel, operation },
            capability: resolveImageModelCapability({ model: requestedModel, operation }),
            routeError: error.message,
        };
    }
    const provider = withProviderDisplayName(config, route.mode === "local" ? route.provider : undefined);
    const service = provider?.adapterType === "civitai-orchestration" && route.model
        ? readCivitaiCatalogServiceSnapshot(route.model, {
            providerId: provider.id,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            proxyMode: provider.proxyMode,
            proxyUrl: provider.proxyUrl,
        })
        : undefined;
    return {
        scope: { providerId: provider?.id || "", model: route.model, operation },
        capability: resolveImageModelCapability({ model: route.model, operation, provider, service }),
    };
}

export function resolveVideoSettingsContext(config: AiConfig, operation?: VideoGenerationOperation): ResolvedVideoSettingsContext {
    const explicitModel = explicitMediaRequestModel(config, "video");
    const requestedModel = requestSelectionModel(explicitModel) || configuredSettingsModel(config, "video", "videoGeneration");
    let route: ReturnType<typeof resolveApiRequestRoute>;
    try {
        route = resolveApiRequestRoute(config, "video", explicitModel, "videoGeneration");
    } catch (error) {
        if (!(error instanceof Error)) throw error;
        const capability = resolveVideoModelCapability({ model: requestedModel });
        return buildVideoContext(config, capability, { providerId: "", model: requestedModel }, operation, error.message);
    }
    const provider = withProviderDisplayName(config, route.mode === "local" ? route.provider : undefined);
    const capability = resolveVideoModelCapability({ model: route.model, provider });
    return buildVideoContext(config, capability, { providerId: provider?.id || "", model: route.model }, operation);
}

function buildVideoContext(
    config: AiConfig,
    capability: ResolvedVideoModelCapability,
    routeScope: { providerId: string; model: string },
    operation: VideoGenerationOperation | undefined,
    routeError?: string,
): ResolvedVideoSettingsContext {
    if (!operation) {
        const unresolvedScope = routeScope as VideoGenerationSettingsScope;
        const operationError = `${capability.providerLabel} / ${capability.model || "未命名模型"}：未提供视频 operation；operation scope unresolved，已阻止读取设置`;
        return {
            capability,
            scope: unresolvedScope,
            settings: {},
            operationResolution: "blocked",
            routeError: routeError ? `${routeError}；${operationError}` : operationError,
        };
    }
    const scope: VideoGenerationSettingsScope = { ...routeScope, operation };
    return {
        capability,
        scope,
        settings: readVideoGenerationSettings(config, scope, capability),
        operationResolution: "resolved",
        ...(routeError ? { routeError } : {}),
    };
}

function requestSelectionModel(selection: ReturnType<typeof explicitMediaRequestModel>) {
    return typeof selection === "string" ? selection : selection.model;
}

function configuredSettingsModel(
    config: AiConfig,
    capability: "image" | "video",
    boardKey: "imageGeneration" | "videoGeneration",
) {
    const board = config.apiBoardRouting[boardKey];
    if (board?.mode === "custom" && board.model.trim()) return board.model.trim();
    return config.apiRouting[capability]?.model?.trim() || config[`${capability}Model`].trim();
}

function withProviderDisplayName(config: AiConfig, provider: ApiRelayProvider | undefined) {
    if (!provider) return undefined;
    return {
        ...provider,
        displayName: providerDisplayName(provider, config.apiRelays || []),
    };
}
