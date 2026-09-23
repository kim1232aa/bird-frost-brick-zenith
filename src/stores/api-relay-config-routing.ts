import type {
    ApiCapability,
    ApiBoardRouteKey,
    ApiBoardModelRoute,
    ApiRelayProvider,
    ApiRelayRouting,
    ProviderModelSelection,
    ProviderModelOption,
    ProviderModelResolution,
    ResolvedCapabilityRoute,
    RelayCompatibleConfig,
} from "./api-relay-config-models";
import {
    API_CAPABILITIES,
    API_CAPABILITY_LABELS,
    API_BOARD_ROUTE_DEFINITIONS,
    defaultApiRelayRouting,
    defaultApiBoardModelRouting,
    defaultApiPlatformBoardModelRouting,
    providerModelsForCapability,
    modelBelongsToProvider,
    normalizeModelList,
    mergeModelLists,
    filterModelsByCapability,
    normalizeCapabilities,
    providerCapabilityIsRunnable,
    inferCapabilityFromModel,
} from "./api-relay-config-models";
import {
    ensureApiRelaySettings,
    listedRelayModelOptionsForCapability,
    providerCanRunCapability,
    canonicalProviderModel,
    providerHasUsableCredential,
} from "./api-relay-config-provider";
import { resolveUniqueModelOwner } from "./api-relay-model-inference";
import { PRESET_RELAY_ENDPOINTS } from "./api-relay-presets";

export function enabledRelayModelOptionsForCapability(
    providers: readonly ApiRelayProvider[],
    capability: ApiCapability,
): ProviderModelOption[] {
    return listedRelayModelOptionsForCapability(providers, capability).filter((option) => {
        const provider = (providers || []).find((item) => item.id === option.providerId);
        return Boolean(provider && providerCanRunCapability(provider, capability));
    });
}

function isProviderModelSelection(value: unknown): value is ProviderModelSelection {
    return Boolean(value && typeof value === "object" && "providerId" in value && "model" in value);
}

export function resolveProviderModelSelection(
    config: RelayCompatibleConfig,
    capability: ApiCapability,
    requested: ProviderModelSelection | string | null | undefined,
): ProviderModelResolution {
    const normalized = ensureApiRelaySettings(config);
    const providers = normalized.apiRelays;

    if (isProviderModelSelection(requested)) {
        const providerId = String(requested.providerId || "").trim();
        const requestedModel = String(requested.model || "").trim();
        if (!providerId || !requestedModel) return { status: "empty", selection: null, model: "", owners: [] };

        const provider = providers.find((item) => item.id === providerId);
        if (!provider) return { status: "unavailable", selection: null, model: requestedModel, owners: [] };
        const model = canonicalProviderModel(provider, capability, requestedModel);
        if (!model || !providerCanRunCapability(provider, capability)) {
            return { status: "unavailable", selection: null, model: requestedModel, owners: [provider] };
        }
        return {
            status: "resolved",
            selection: { providerId: provider.id, model },
            provider,
        };
    }

    const model = String(requested || "").trim();
    if (!model) return { status: "empty", selection: null, model: "", owners: [] };

    const owners: ApiRelayProvider[] = [];
    const canonicalModels = new Map<string, string>();
    for (const provider of providers) {
        const canonical = canonicalProviderModel(provider, capability, model);
        if (!canonical || !providerCanRunCapability(provider, capability)) continue;
        owners.push(provider);
        canonicalModels.set(provider.id, canonical);
    }
    if (owners.length > 1) {
        const lowerModel = model.toLowerCase();
        let preferredOwner: ApiRelayProvider | undefined;
        if (lowerModel.startsWith("agnes-") || lowerModel.includes("agnes")) {
            preferredOwner = owners.find((p) => p.id === "preset-agnes-ai" || p.adapterType === "agnes" || p.name.toLowerCase().includes("agnes"));
        } else if (lowerModel.startsWith("sensenova-") || lowerModel.includes("sensenova")) {
            preferredOwner = owners.find((p) => p.id === "preset-sensenova" || p.adapterType === "sensenova" || p.name.toLowerCase().includes("sensenova") || p.name.includes("商汤"));
        } else if (lowerModel.startsWith("grok-") || lowerModel.includes("grok")) {
            preferredOwner = owners.find((p) => p.id === "preset-grok-relay" || p.name.toLowerCase().includes("grok"));
        }
        if (preferredOwner) {
            return {
                status: "resolved",
                selection: { providerId: preferredOwner.id, model: canonicalModels.get(preferredOwner.id) || model },
                provider: preferredOwner,
            };
        }
    }
    const unique = resolveUniqueModelOwner(owners);
    if (unique.status === "ambiguous") {
        return { status: "ambiguous", selection: null, model, owners: unique.owners };
    }
    if (unique.status === "resolved") {
        const provider = unique.owner;
        return {
            status: "resolved",
            selection: { providerId: provider.id, model: canonicalModels.get(provider.id) || model },
            provider,
        };
    }
    return { status: "unavailable", selection: null, model, owners: [] };
}

function providerModelResolutionError(
    resolution: ProviderModelResolution,
    label: string,
    capability: ApiCapability,
    explicit = true,
): Error {
    if (resolution.status === "ambiguous") {
        const ownerNames = resolution.owners.map((owner) => owner.name || owner.id).slice(0, 5).join("、");
        return new Error(`${explicit ? `显式${label}` : label}模型“${resolution.model}”由多个可用中转提供（${ownerNames}），无法确定路由，已阻止请求；请在模型选择器中改用「中转 · 模型」精确项`);
    }
    if (resolution.status === "unavailable") {
        const [provider] = resolution.owners;
        if (provider) {
            if (!provider.enabled) return new Error(`当前选择的${label}中转已停用`);
            if (!provider.capabilities.includes(capability)) return new Error(`当前中转不支持${label}生成`);
            if (!providerCapabilityIsRunnable(provider, capability)) return new Error(`当前中转的${label}能力尚未接线`);
            if (!provider.baseUrl.trim()) return new Error(`请为${label}中转填写 Base URL`);
            if (!providerHasUsableCredential(provider)) return new Error(`请为${label}中转填写 API Key`);
            return new Error(`${label}模型“${resolution.model}”不在所选中转模型列表中，已阻止请求`);
        }
        return new Error(`${explicit ? `显式${label}` : label}模型“${resolution.model}”没有可用中转，已阻止请求`);
    }
    return new Error(`请为${label}选择模型`);
}

export function resolveProviderModelRoute(
    config: RelayCompatibleConfig,
    capability: ApiCapability,
    requested: ProviderModelSelection | string,
): ResolvedCapabilityRoute {
    const resolution = resolveProviderModelSelection(config, capability, requested);
    if (resolution.status !== "resolved") throw providerModelResolutionError(resolution, API_CAPABILITY_LABELS[capability], capability);
    return { provider: resolution.provider, capability, model: resolution.selection.model };
}

export function resolveBoardRouteSelection(
    mode: ApiBoardModelRoute["mode"],
    providerId: string,
    model: string,
    providers: readonly ApiRelayProvider[],
    capability: ApiCapability,
    providerChanged = false,
) {
    if (mode === "inherit") return { providerId: "", model: "" };
    const selectedProviderId = String(providerId || "").trim();
    if (!selectedProviderId) return { providerId: "", model: "" };
    if (!providerChanged) return { providerId: selectedProviderId, model: String(model || "") };
    const provider = providers.find((item) => item.id === selectedProviderId);
    const currentModel = String(model || "");
    return {
        providerId: selectedProviderId,
        model: provider && modelBelongsToProvider(provider, capability, currentModel) ? currentModel : "",
    };
}

export function fillMissingCapabilityRoutes(routing: Partial<ApiRelayRouting>, provider: ApiRelayProvider): ApiRelayRouting {
    return API_CAPABILITIES.reduce((nextRouting, capability) => {
        const current = routing[capability] || defaultApiRelayRouting[capability];
        if (!provider.capabilities.includes(capability)) {
            nextRouting[capability] = { source: "relay", providerId: current.providerId || "", model: current.model || "" };
            return nextRouting;
        }
        const providerModels = providerModelsForCapability(provider, capability);
        const currentUsesProvider = current.providerId === provider.id;
        const routeNeedsProvider = !current.providerId;
        const routeNeedsModelRefresh = currentUsesProvider && (!current.model || (providerModels.length > 0 && !modelBelongsToProvider(provider, capability, current.model)));
        if (!routeNeedsProvider && !routeNeedsModelRefresh) {
            nextRouting[capability] = { source: "relay", providerId: current.providerId || "", model: current.model || "" };
            return nextRouting;
        }
        nextRouting[capability] = {
            source: "relay",
            providerId: current.providerId || provider.id,
            model: modelBelongsToProvider(provider, capability, current.model) ? current.model : "",
        };
        return nextRouting;
    }, { ...defaultApiRelayRouting } as ApiRelayRouting);
}

export function resolveCapabilityRoute(
    config: RelayCompatibleConfig,
    capability: ApiCapability,
    preferredModel: string | ProviderModelSelection = "",
): ResolvedCapabilityRoute {
    const normalized = ensureApiRelaySettings(config);
    const label = API_CAPABILITY_LABELS[capability];
    const route = normalized.apiRouting[capability];

    const qualifiedSelection = isProviderModelSelection(preferredModel)
        ? resolveProviderModelSelection(normalized, capability, preferredModel)
        : undefined;
    if (qualifiedSelection && qualifiedSelection.status !== "resolved") {
        throw providerModelResolutionError(qualifiedSelection, label, capability);
    }

    const cleanPreferred = typeof preferredModel === "string" ? preferredModel.trim() : "";
    const configuredProvider = route.providerId ? normalized.apiRelays.find((item) => item.id === route.providerId) : undefined;
    const explicitRoute = qualifiedSelection?.status === "resolved"
        ? { provider: qualifiedSelection.provider, model: qualifiedSelection.selection.model }
        : cleanPreferred
        ? resolveExplicitModelRoute(normalized.apiRelays, capability, cleanPreferred, label)
        : undefined;
    let provider = explicitRoute?.provider || configuredProvider;

    if (!provider) {
        if (route.providerId) throw new Error(`未找到${label}中转 API，请重新选择`);
        throw new Error(`未配置${label}中转 API，请到设置中添加`);
    }
    if (!provider.enabled) throw new Error(`当前选择的${label}中转已停用`);
    if (!provider.capabilities.includes(capability)) throw new Error(`当前中转不支持${label}生成`);
    if (!providerCapabilityIsRunnable(provider, capability)) throw new Error(`当前中转的${label}能力尚未接线`);
    if (!provider.baseUrl.trim()) throw new Error(`请为${label}中转填写 Base URL`);
    if (!providerHasUsableCredential(provider)) {
        const providerId = provider.id;
        const preset = PRESET_RELAY_ENDPOINTS.find((p) => p.id === providerId);
        if (preset?.apiKey) {
            provider = { ...provider, apiKey: preset.apiKey, hasApiKey: true };
        } else {
            throw new Error(`请为${label}中转填写 API Key`);
        }
    }

    const requestedModel = explicitRoute?.model || route.model.trim();
    if (!requestedModel) throw new Error(`请为${label}中转选择模型`);
    const model = resolveAllowedCapabilityModel(provider, capability, requestedModel, normalized.apiRelayAdvanced.allowCustomModel);
    if (!model) throw new Error(`${label}模型不在当前中转模型列表中`);

    return { provider, capability, model };
}

export function resolveBoardCapabilityRoute(
    config: RelayCompatibleConfig,
    boardKey: ApiBoardRouteKey,
    preferredModel: string | ProviderModelSelection = "",
): ResolvedCapabilityRoute {
    const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === boardKey);
    if (!definition) throw new Error(`未知板块模型路由：${boardKey}`);

    const normalized = ensureApiRelaySettings(config);
    const route = normalized.apiBoardRouting[boardKey] || defaultApiBoardModelRouting[boardKey];
    if (route.mode !== "custom") return resolveCapabilityRoute(normalized, definition.capability, preferredModel);

    const boardLabel = definition.label;
    const capabilityLabel = API_CAPABILITY_LABELS[definition.capability];

    const qualifiedSelection = isProviderModelSelection(preferredModel)
        ? resolveProviderModelSelection(normalized, definition.capability, preferredModel)
        : undefined;
    if (qualifiedSelection && qualifiedSelection.status !== "resolved") {
        throw providerModelResolutionError(qualifiedSelection, boardLabel, definition.capability);
    }

    const cleanPreferred = typeof preferredModel === "string" ? preferredModel.trim() : "";
    const configuredProvider = route.providerId ? normalized.apiRelays.find((item) => item.id === route.providerId) : undefined;
    const explicitRoute = qualifiedSelection?.status === "resolved"
        ? { provider: qualifiedSelection.provider, model: qualifiedSelection.selection.model }
        : cleanPreferred
        ? resolveExplicitModelRoute(normalized.apiRelays, definition.capability, cleanPreferred, `${boardLabel}板块`)
        : undefined;
    if (!route.providerId && !explicitRoute) throw new Error(`未配置${boardLabel}板块中转 API，请到设置中添加`);

    let provider = explicitRoute?.provider || configuredProvider;
    if (!provider) throw new Error(`未找到${boardLabel}板块中转 API，请重新选择`);
    if (!provider.enabled) throw new Error(`当前选择的${boardLabel}板块中转已停用`);
    if (!provider.capabilities.includes(definition.capability)) throw new Error(`当前中转不支持${boardLabel}所需的${capabilityLabel}能力`);
    if (!providerCapabilityIsRunnable(provider, definition.capability)) throw new Error(`当前中转的${boardLabel}能力尚未接线`);
    if (!provider.baseUrl.trim()) throw new Error(`请为${boardLabel}板块中转填写 Base URL`);
    if (!providerHasUsableCredential(provider)) {
        const providerId = provider.id;
        const preset = PRESET_RELAY_ENDPOINTS.find((p) => p.id === providerId);
        if (preset?.apiKey) {
            provider = { ...provider, apiKey: preset.apiKey, hasApiKey: true };
        } else {
            throw new Error(`请为${boardLabel}板块中转填写 API Key`);
        }
    }

    const requestedModel = explicitRoute?.model || route.model.trim();
    if (!requestedModel) throw new Error(`请为${boardLabel}板块中转选择模型`);
    const model = resolveAllowedCapabilityModel(
        provider,
        definition.capability,
        requestedModel,
        normalized.apiRelayAdvanced.allowCustomModel,
    );
    if (!model) throw new Error(`${boardLabel}板块模型不在当前中转模型列表中`);

    return { provider, capability: definition.capability, model };
}

function resolveAllowedCapabilityModel(
    provider: ApiRelayProvider,
    capability: ApiCapability,
    requestedModel: string,
    allowCustomModel: boolean,
) {
    const canonical = canonicalProviderModel(provider, capability, requestedModel);
    if (canonical) return canonical;
    const models = providerModelsForCapability(provider, capability);
    if (allowCustomModel || !models.length) return requestedModel;
    return "";
}

function resolveExplicitModelRoute(
    providers: ApiRelayProvider[],
    capability: ApiCapability,
    model: string,
    routeLabel: string,
): Pick<ResolvedCapabilityRoute, "provider" | "model"> {
    const owners = providers.filter(
        (provider) =>
            providerCanRunCapability(provider, capability) &&
            Boolean(canonicalProviderModel(provider, capability, model)),
    );
    if (owners.length > 1) {
        const lowerModel = model.toLowerCase();
        let preferredOwner: ApiRelayProvider | undefined;
        if (lowerModel.startsWith("agnes-") || lowerModel.includes("agnes")) {
            preferredOwner = owners.find((p) => p.id === "preset-agnes-ai" || p.adapterType === "agnes" || p.name.toLowerCase().includes("agnes"));
        } else if (lowerModel.startsWith("sensenova-") || lowerModel.includes("sensenova")) {
            preferredOwner = owners.find((p) => p.id === "preset-sensenova" || p.adapterType === "sensenova" || p.name.toLowerCase().includes("sensenova") || p.name.includes("商汤"));
        } else if (lowerModel.startsWith("grok-") || lowerModel.includes("grok")) {
            preferredOwner = owners.find((p) => p.id === "preset-grok-relay" || p.name.toLowerCase().includes("grok"));
        }
        if (preferredOwner) {
            return {
                provider: preferredOwner,
                model: canonicalProviderModel(preferredOwner, capability, model) || model,
            };
        }
    }
    const unique = resolveUniqueModelOwner(owners);
    if (unique.status === "empty") throw new Error(`显式${routeLabel}模型“${model}”没有可用中转，已阻止请求`);
    if (unique.status === "ambiguous") {
        throw providerModelResolutionError(
            { status: "ambiguous", selection: null, model, owners: unique.owners },
            routeLabel,
            capability,
        );
    }
    return {
        provider: unique.owner,
        model: canonicalProviderModel(unique.owner, capability, model) || model,
    };
}

export function resolvePlatformBoardModel(config: RelayCompatibleConfig, boardKey: ApiBoardRouteKey, fallbackModel = "") {
    const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === boardKey);
    if (!definition) throw new Error(`未知平台板块模型：${boardKey}`);
    const normalized = ensureApiRelaySettings(config);
    const route = normalized.apiPlatformBoardRouting[boardKey] || defaultApiPlatformBoardModelRouting[boardKey];
    const customModel = route.mode === "custom" ? route.model.trim() : "";
    return customModel || fallbackModel.trim();
}
export function reconcileApiRelayModelAssignments(
    models: string[],
    assignments: Partial<Pick<ApiRelayProvider, "textModels" | "imageModels" | "videoModels" | "audioModels">> = {},
    { inferUnassigned = false }: { inferUnassigned?: boolean } = {},
): Pick<ApiRelayProvider, "models" | "textModels" | "imageModels" | "videoModels" | "audioModels"> {
    const discoveredModels = normalizeModelList(models);
    const available = new Set(discoveredModels);
    const takeAssigned = (values: string[] | undefined) =>
        normalizeModelList(values || []).filter((model) => available.has(model));

    const textModels = takeAssigned(assignments.textModels);
    const imageModels = takeAssigned(assignments.imageModels);
    const videoModels = takeAssigned(assignments.videoModels);
    const audioModels = takeAssigned(assignments.audioModels);

    if (!inferUnassigned) {
        return { models: discoveredModels, textModels, imageModels, videoModels, audioModels };
    }

    const assignedModels = new Set([...textModels, ...imageModels, ...videoModels, ...audioModels]);
    const unassignedModels = discoveredModels.filter((model) => !assignedModels.has(model));
    const inferredImageModels = filterModelsByCapability(unassignedModels, "image");
    const inferredVideoModels = filterModelsByCapability(unassignedModels, "video");
    const inferredAudioModels = filterModelsByCapability(unassignedModels, "audio");
    const inferredCapabilityModels = new Set([...inferredImageModels, ...inferredVideoModels, ...inferredAudioModels]);
    const inferredTextModels = unassignedModels.filter((model) => !inferredCapabilityModels.has(model) && inferCapabilityFromModel(model) === "text");

    return {
        models: discoveredModels,
        textModels: mergeModelLists(textModels, inferredTextModels),
        imageModels: mergeModelLists(imageModels, inferredImageModels),
        videoModels: mergeModelLists(videoModels, inferredVideoModels),
        audioModels: mergeModelLists(audioModels, inferredAudioModels),
    };
}

export function classifyProviderModels(
    provider: ApiRelayProvider,
    capability: ApiCapability,
    values: string[],
): Pick<ApiRelayProvider, "models" | "textModels" | "imageModels" | "videoModels" | "audioModels" | "capabilities"> {
    const selected = normalizeModelList(values);
    const models = normalizeModelList([...provider.models, ...selected]);
    const assignments = {
        textModels: capability === "text" ? selected : provider.textModels,
        imageModels: capability === "image" ? selected : provider.imageModels,
        videoModels: capability === "video" ? selected : provider.videoModels,
        audioModels: capability === "audio" ? selected : provider.audioModels,
    };
    const classified = reconcileApiRelayModelAssignments(models, assignments);
    return {
        ...classified,
        capabilities: normalizeCapabilities([
            ...provider.capabilities,
            ...(classified.textModels.length ? (["text"] as ApiCapability[]) : []),
            ...(classified.imageModels.length ? (["image"] as ApiCapability[]) : []),
            ...(classified.videoModels.length ? (["video"] as ApiCapability[]) : []),
            ...(classified.audioModels.length ? (["audio"] as ApiCapability[]) : []),
        ]),
    };
}
