import {
    IMAGE_CAPABILITY_PROFILES,
    isImageCapabilityProfileId,
    normalizeImageCapabilityProfiles,
    type ImageCapabilityProfileId,
    type ImageCapabilityProfileSelection,
    type ImageOperation,
} from "@/services/api/image-model-capabilities";
import { normalizeAudioCapabilityProfiles } from "@/services/api/audio-model-capabilities";
import { normalizeVideoCapabilityProfiles } from "@/services/api/video-model-capabilities";
import { normalizeModelsDevMetadataRecord } from "@/services/api/models-dev-catalog";
import { CIVITAI_MATURE_POLICY_VERSION, civitaiAllowsMatureContent, isCivitaiAdapterType } from "@/services/api/civitai-orchestration";
import { createProviderCredentialId, hasProviderCredential, normalizeProviderCredentials, reconcileProviderCredentialIds } from "@/stores/provider-credentials";
import type {
    ApiCapability,
    ApiRelayProvider,
    ApiRelayRouting,
    ApiBoardModelRouting,
    ApiPlatformBoardModelRouting,
    ApiRelayAdvanced,
    ProviderModelSelection,
    ProviderModelOption,
    RelayCompatibleConfig,
} from "./api-relay-config-models";
import {
    API_CAPABILITIES,
    API_BOARD_ROUTE_DEFINITIONS,
    defaultApiRelayRouting,
    defaultApiBoardModelRouting,
    defaultApiPlatformBoardModelRouting,
    defaultApiRelayAdvanced,
    normalizeModelList,
    mergeModelLists,
    filterModelsByCapability,
    inferCapabilitiesFromModels,
    normalizeCapabilities,
    providerCapabilityIsRunnable,
    providerModelsForCapability,
    modelBelongsToProvider,
    isHappyHorseVideoModelName,
    isLegacyGrokTextModelName,
    resolveConfiguredModel,
    imageCapabilityProfileEntry,
} from "./api-relay-config-models";

const MIN_RELAY_TIMEOUT_MS = 30_000;
const MAX_RELAY_TIMEOUT_MS = 900_000;

function normalizeRelayTimeoutMs(value: unknown, fallback = defaultApiRelayAdvanced.defaultTimeoutMs) {
    const numeric = Math.floor(Number(value));
    const fallbackNumeric = Math.floor(Number(fallback));
    const safeValue = Number.isFinite(numeric) && numeric > 0
        ? numeric
        : Number.isFinite(fallbackNumeric) && fallbackNumeric > 0
            ? fallbackNumeric
            : defaultApiRelayAdvanced.defaultTimeoutMs;
    return Math.max(MIN_RELAY_TIMEOUT_MS, Math.min(MAX_RELAY_TIMEOUT_MS, safeValue));
}

export function resolveApiRelayTimeoutMs(
    provider: Pick<ApiRelayProvider, "timeoutMs" | "timeoutOverrideMs">,
    defaultTimeoutMs: number,
) {
    return normalizeRelayTimeoutMs(provider.timeoutOverrideMs, defaultTimeoutMs);
}

export function createApiRelayProvider(input: Partial<ApiRelayProvider> = {}): ApiRelayProvider {
    const now = input.createdAt || new Date().toISOString();
    const allModels = normalizeModelList(input.models || [...(input.textModels || []), ...(input.imageModels || []), ...(input.videoModels || []), ...(input.audioModels || [])]);
    const credentials = normalizeProviderCredentials(input.apiKey || "", input.apiKeys);
    const apiKeyIds = credentials.apiKeys
        ? reconcileProviderCredentialIds(credentials.apiKeys, input.apiKeys, input.apiKeyIds)
        : undefined;

    return normalizeApiRelayProvider({
        id: input.id || `relay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: input.name || "中转 API",
        baseUrl: input.baseUrl || "",
        apiKey: credentials.apiKey,
        ...(typeof input.hasApiKey === "boolean" || credentials.apiKey || credentials.apiKeys?.length
          ? { hasApiKey: Boolean(input.hasApiKey || credentials.apiKey || credentials.apiKeys?.length) }
          : {}),
        ...(credentials.apiKey ? { apiKeyId: input.apiKeyId?.trim() || createProviderCredentialId() } : {}),
        ...(credentials.apiKeys ? { apiKeys: [...credentials.apiKeys] } : {}),
        ...(apiKeyIds ? { apiKeyIds } : {}),
        ...(input.adapterType ? { adapterType: input.adapterType } : {}),
        proxyMode: input.proxyMode === "custom" ? "custom" : "direct",
        proxyUrl: String(input.proxyUrl || "").trim(),
        ...(Array.isArray(input.runnableCapabilities) ? { runnableCapabilities: normalizeCapabilities(input.runnableCapabilities) } : {}),
        ...(input.videoCapabilityProfiles ? { videoCapabilityProfiles: normalizeVideoCapabilityProfiles(input.videoCapabilityProfiles) } : {}),
        ...(input.audioCapabilityProfiles ? { audioCapabilityProfiles: normalizeAudioCapabilityProfiles(input.audioCapabilityProfiles) } : {}),
        ...(input.imageCapabilityProfiles ? { imageCapabilityProfiles: normalizeImageCapabilityProfiles(input.imageCapabilityProfiles) } : {}),
        ...(input.modelCatalogMetadata ? { modelCatalogMetadata: normalizeModelsDevMetadataRecord(input.modelCatalogMetadata, allModels) } : {}),
        allowMatureContent: civitaiAllowsMatureContent({
            adapterType: input.adapterType,
            allowMatureContent: input.allowMatureContent,
        }),
        ...(isCivitaiAdapterType(input.adapterType) ? { civitaiMaturePolicyVersion: CIVITAI_MATURE_POLICY_VERSION } : {}),
        ...(input.timeoutOverrideMs !== undefined ? { timeoutOverrideMs: input.timeoutOverrideMs } : {}),
        enabled: input.enabled === true,
        capabilities: normalizeCapabilities(input.capabilities || inferCapabilitiesFromModels(allModels)),
        models: allModels,
        textModels: input.textModels || filterModelsByCapability(allModels, "text"),
        imageModels: input.imageModels || filterModelsByCapability(allModels, "image"),
        videoModels: input.videoModels || filterModelsByCapability(allModels, "video"),
        audioModels: input.audioModels || filterModelsByCapability(allModels, "audio"),
        timeoutMs: input.timeoutMs || defaultApiRelayAdvanced.defaultTimeoutMs,
        remark: input.remark || "",
        createdAt: now,
        updatedAt: input.updatedAt || now,
        ...(input.endpoints ? { endpoints: input.endpoints } : {}),
        ...(input.authScheme ? { authScheme: input.authScheme } : {}),
        ...(input.protocol ? { protocol: input.protocol } : {}),
    });
}

function resolvePersistedCivitaiMatureContent(provider: ApiRelayProvider) {
    if (!isCivitaiAdapterType(provider.adapterType)) return provider.allowMatureContent === true;
    const persistedVersion = Number(provider.civitaiMaturePolicyVersion);
    if (Number.isFinite(persistedVersion) && persistedVersion >= CIVITAI_MATURE_POLICY_VERSION) {
        return provider.allowMatureContent !== false;
    }
    return true;
}

export function normalizeApiRelayProvider(provider: ApiRelayProvider): ApiRelayProvider {
    provider = (provider && typeof provider === "object" ? provider : {}) as ApiRelayProvider;
    const persistedStringList = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const persistedModels = persistedStringList(provider.models);
    const persistedTextModels = persistedStringList(provider.textModels);
    const persistedImageModels = persistedStringList(provider.imageModels);
    const persistedVideoModels = persistedStringList(provider.videoModels);
    const persistedAudioModels = persistedStringList(provider.audioModels);
    const models = Array.isArray(provider.models)
        ? normalizeModelList(persistedModels)
        : mergeModelLists(persistedTextModels, persistedImageModels, persistedVideoModels, persistedAudioModels);
    const pickAssigned = (assigned: unknown, capability: ApiCapability) =>
        normalizeModelList(Array.isArray(assigned) ? persistedStringList(assigned) : filterModelsByCapability(models, capability));
    const legacyGrokTextModels = models.filter(isLegacyGrokTextModelName);
    const legacyHappyHorseVideoModels = models.filter(isHappyHorseVideoModelName);
    const textModels = mergeModelLists(pickAssigned(provider.textModels, "text"), legacyGrokTextModels)
        .filter((model) => !legacyHappyHorseVideoModels.includes(model));
    const imageModels = pickAssigned(provider.imageModels, "image");
    const videoModels = mergeModelLists(
        pickAssigned(provider.videoModels, "video").filter((model) => !legacyGrokTextModels.includes(model)),
        legacyHappyHorseVideoModels,
    );
    const audioModels = pickAssigned(provider.audioModels, "audio");
    const persistedCapabilities = Array.isArray(provider.capabilities) ? provider.capabilities : [];
    const runnableCapabilities = Array.isArray(provider.runnableCapabilities)
        ? normalizeCapabilities(provider.runnableCapabilities)
        : undefined;
    const persistedApiKeys = Array.isArray(provider.apiKeys) ? provider.apiKeys : undefined;
    const persistedApiKeyIds = Array.isArray(provider.apiKeyIds) ? provider.apiKeyIds : undefined;
    const providerName = typeof provider.name === "string" ? provider.name.trim() : "";
    const providerBaseUrl = typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : "";
    const providerApiKeyId = typeof provider.apiKeyId === "string" ? provider.apiKeyId.trim() : "";
    const providerRemark = typeof provider.remark === "string" ? provider.remark : "";
    const legacyTimeoutMs = Number(provider.timeoutMs);
    const timeoutOverrideMs = provider.timeoutOverrideMs !== undefined
        ? normalizeRelayTimeoutMs(provider.timeoutOverrideMs)
        : Number.isFinite(legacyTimeoutMs) && legacyTimeoutMs > 0 && legacyTimeoutMs !== defaultApiRelayAdvanced.defaultTimeoutMs
            ? normalizeRelayTimeoutMs(legacyTimeoutMs)
            : undefined;
    const credentials = normalizeProviderCredentials(
        typeof provider.apiKey === "string" ? provider.apiKey : "",
        persistedApiKeys,
    );
    const identityIds = Array.from(new Set([
        providerApiKeyId,
        ...(persistedApiKeyIds || []).map((id) => String(id || "").trim()),
    ].filter(Boolean)));
    const apiKeyIds = credentials.apiKeys
        ? reconcileProviderCredentialIds(credentials.apiKeys, persistedApiKeys, persistedApiKeyIds)
        : identityIds.length > 1
            ? identityIds.slice(1)
            : undefined;
    return {
        ...provider,
        name: providerName || "中转 API",
        baseUrl: providerBaseUrl,
        apiKey: credentials.apiKey,
        ...(typeof provider.hasApiKey === "boolean" ? { hasApiKey: provider.hasApiKey || Boolean(credentials.apiKey || credentials.apiKeys?.length || identityIds.length) } : {}),
        apiKeyId: credentials.apiKey ? providerApiKeyId || createProviderCredentialId() : identityIds[0] || undefined,
        apiKeys: credentials.apiKeys ? [...credentials.apiKeys] : undefined,
        apiKeyIds,
        proxyMode: provider.proxyMode === "custom" ? "custom" : "direct",
        proxyUrl: String(provider.proxyUrl || "").trim(),
        ...(runnableCapabilities !== undefined ? { runnableCapabilities } : {}),
        videoCapabilityProfiles: normalizeVideoCapabilityProfiles(provider.videoCapabilityProfiles),
        audioCapabilityProfiles: normalizeAudioCapabilityProfiles(provider.audioCapabilityProfiles),
        imageCapabilityProfiles: normalizeImageCapabilityProfiles(provider.imageCapabilityProfiles),
        modelCatalogMetadata: normalizeModelsDevMetadataRecord(provider.modelCatalogMetadata, models),
        allowMatureContent: resolvePersistedCivitaiMatureContent(provider),
        ...(isCivitaiAdapterType(provider.adapterType) ? { civitaiMaturePolicyVersion: CIVITAI_MATURE_POLICY_VERSION } : {}),
        enabled: provider.enabled !== false,
        capabilities: normalizeCapabilities([
            ...persistedCapabilities,
            ...(textModels.length ? (["text"] as ApiCapability[]) : []),
            ...(imageModels.length ? (["image"] as ApiCapability[]) : []),
            ...(videoModels.length ? (["video"] as ApiCapability[]) : []),
            ...(audioModels.length ? (["audio"] as ApiCapability[]) : []),
            ...(legacyHappyHorseVideoModels.length ? (["video"] as ApiCapability[]) : []),
        ]),
        models,
        textModels,
        imageModels,
        videoModels,
        audioModels,
        ...(timeoutOverrideMs !== undefined ? { timeoutOverrideMs } : {}),
        timeoutMs: normalizeRelayTimeoutMs(timeoutOverrideMs ?? provider.timeoutMs),
        remark: providerRemark,
    };
}

export function imageCapabilityProfileOverrideForOperation(
    profiles: ApiRelayProvider["imageCapabilityProfiles"],
    model: string,
    operation: ImageOperation,
): ImageCapabilityProfileId | "" {
    const normalized = normalizeImageCapabilityProfiles(profiles);
    if (!normalized) return "";
    const entry = imageCapabilityProfileEntry(normalized, model)?.selection;
    if (!entry) return "";
    if (typeof entry === "string") {
        return IMAGE_CAPABILITY_PROFILES[entry].operation === operation ? entry : "";
    }
    return entry[operation] || "";
}

export function setImageCapabilityProfileOverride(
    profiles: ApiRelayProvider["imageCapabilityProfiles"],
    modelValue: string,
    operation: ImageOperation,
    profileValue: ImageCapabilityProfileId | "",
): ApiRelayProvider["imageCapabilityProfiles"] {
    const model = String(modelValue || "").trim();
    const normalized = normalizeImageCapabilityProfiles(profiles) || {};
    if (!model) return normalizeImageCapabilityProfiles(normalized);

    const existing = imageCapabilityProfileEntry(normalized, model);
    const modelKey = existing?.key || model;
    const nextSelection: Partial<Record<ImageOperation, ImageCapabilityProfileId>> = {};
    if (existing?.selection) {
        if (typeof existing.selection === "string") {
            const existingProfile = IMAGE_CAPABILITY_PROFILES[existing.selection];
            nextSelection[existingProfile.operation] = existing.selection;
        } else {
            Object.assign(nextSelection, existing.selection);
        }
    }

    if (!profileValue) {
        delete nextSelection[operation];
    } else if (
        isImageCapabilityProfileId(profileValue) &&
        IMAGE_CAPABILITY_PROFILES[profileValue].operation === operation
    ) {
        nextSelection[operation] = profileValue;
    } else {
        return normalizeImageCapabilityProfiles(normalized);
    }

    const nextProfiles: Record<string, ImageCapabilityProfileSelection> = { ...normalized };
    if (Object.keys(nextSelection).length) nextProfiles[modelKey] = nextSelection;
    else delete nextProfiles[modelKey];
    return normalizeImageCapabilityProfiles(nextProfiles);
}

export function ensureApiRelaySettings<T extends RelayCompatibleConfig>(config: T): T & { apiRelays: ApiRelayProvider[]; apiRouting: ApiRelayRouting; apiBoardRouting: ApiBoardModelRouting; apiPlatformBoardRouting: ApiPlatformBoardModelRouting; apiRelayAdvanced: ApiRelayAdvanced } {
    const hasApiRelays = Object.prototype.hasOwnProperty.call(config, "apiRelays");
    const relays = Array.isArray(config.apiRelays)
        ? config.apiRelays
              .filter((provider): provider is ApiRelayProvider => Boolean(provider && typeof provider === "object" && !Array.isArray(provider)))
              .map(normalizeApiRelayProvider)
        : [];
    const apiRelays = (hasApiRelays ? relays : legacyProviderFromConfig(config)).map((provider) => normalizeApiRelayProvider(provider));

    return {
        ...config,
        apiRelays,
        apiRouting: ensureRouting(config, apiRelays),
        apiBoardRouting: ensureBoardRouting(config),
        apiPlatformBoardRouting: ensurePlatformBoardRouting(config),
        apiRelayAdvanced: {
            ...defaultApiRelayAdvanced,
            ...(config.apiRelayAdvanced || {}),
        },
    };
}
export function encodeProviderModelSelection(selection: ProviderModelSelection) {
    const providerId = String(selection.providerId || "").trim();
    const model = String(selection.model || "").trim();
    return `provider-model:${encodeURIComponent(JSON.stringify([providerId, model]))}`;
}

export function decodeProviderModelSelection(value: string): ProviderModelSelection | null {
    const raw = String(value || "");
    if (!raw.startsWith("provider-model:")) return null;
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(raw.slice("provider-model:".length)));
        if (!Array.isArray(parsed) || parsed.length !== 2) return null;
        const providerId = typeof parsed[0] === "string" ? parsed[0].trim() : "";
        const model = typeof parsed[1] === "string" ? parsed[1].trim() : "";
        return providerId && model ? { providerId, model } : null;
    } catch {
        return null;
    }
}

export function providerDisplayName(provider: ApiRelayProvider, providers: readonly ApiRelayProvider[]) {
    const visibleName = safeProviderDisplayLabel(provider.name, provider.id, providerCredentialDisplayValues(provider));
    const duplicateKey = normalizedProviderDisplayName(provider);
    const duplicates = providers.filter((candidate) => normalizedProviderDisplayName(candidate) === duplicateKey);
    if (duplicates.length <= 1) return visibleName;

    const duplicateIndex = duplicates.findIndex((candidate) => candidate.id === provider.id);
    if (duplicateIndex < 0) return visibleName;
    return `${visibleName}（中转 ${duplicateIndex + 1}/${duplicates.length}）`;
}

const MACHINE_GENERATED_PROVIDER_ID_PATTERNS = [
    /^internal-/iu,
    /^relay-\d{6,}-[a-z\d]+$/iu,
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu,
] as const;

function isMachineGeneratedProviderId(providerId: string) {
    return MACHINE_GENERATED_PROVIDER_ID_PATTERNS.some((pattern) => pattern.test(providerId));
}

export function safeProviderDisplayLabel(
    providerLabel: unknown,
    providerId?: unknown,
    configuredCredentials: readonly unknown[] = [],
) {
    const label = typeof providerLabel === "string" ? providerLabel.trim() : "";
    const id = typeof providerId === "string" ? providerId.trim() : "";
    if (!label || label === "中转 API") return "未命名中转";
    if (id && label.toLowerCase() === id.toLowerCase() && isMachineGeneratedProviderId(id)) return "未命名中转";
    if (configuredCredentials.some((credential) => containsConfiguredCredential(label, credential))) return "未命名中转";
    if (isPrivateLocatorDisplayValue(label) && !isBareProviderHostname(label)) return "未命名中转";
    return label;
}

function normalizedProviderDisplayName(provider: ApiRelayProvider) {
    return safeProviderDisplayLabel(provider.name, provider.id, providerCredentialDisplayValues(provider)).toLowerCase();
}

function providerCredentialDisplayValues(provider: Pick<ApiRelayProvider, "apiKey" | "apiKeys">) {
    return [provider.apiKey, ...(provider.apiKeys || [])];
}

export function isPrivateLocatorDisplayValue(value: unknown) {
    if (typeof value !== "string") return false;
    const candidate = value.trim();
    if (!candidate) return false;
    if (/^(?:data|blob|file|image|video|audio|storage):/iu.test(candidate)) return true;
    if (/^(?:[a-z][a-z\d+.-]*:\/\/|www\.)/iu.test(candidate)) return true;
    if (isCredentialLikeDisplayValue(candidate)) return true;
    return /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/iu.test(candidate);
}

function isBareProviderHostname(value: string) {
    return /^(?:[\p{L}\d](?:[\p{L}\d-]{0,61}[\p{L}\d])?\.)+[\p{L}]{2,63}$/iu.test(value);
}

export function isCredentialLikeDisplayValue(value: unknown) {
    return typeof value === "string" && value.trim().length >= 32 && /\s/.test(value) === false && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function containsConfiguredCredential(label: string, credential: unknown) {
    const configuredValue = typeof credential === "string" ? credential.trim() : "";
    if (!configuredValue) return false;
    return label.includes(configuredValue);
}

export function providerHasUsableCredential(provider: Pick<ApiRelayProvider, "apiKey" | "apiKeys" | "hasApiKey" | "baseUrl">) {
    return hasProviderCredential({
        ...normalizeProviderCredentials(provider.apiKey, provider.apiKeys),
        hasApiKey: provider.hasApiKey,
    });
}

export function providerCanRunCapability(provider: ApiRelayProvider, capability: ApiCapability) {
    return provider.enabled
        && provider.capabilities.includes(capability)
        && providerCapabilityIsRunnable(provider, capability)
        && Boolean(provider.baseUrl.trim())
        && providerHasUsableCredential(provider);
}

export function canonicalProviderModel(provider: ApiRelayProvider, capability: ApiCapability, model: string) {
    return resolveConfiguredModel(model, providerModelsForCapability(provider, capability));
}

export function listedRelayModelOptionsForCapability(
    providers: readonly ApiRelayProvider[],
    capability: ApiCapability,
): ProviderModelOption[] {
    const options: ProviderModelOption[] = [];
    for (const provider of providers || []) {
        if (!provider?.id) continue;
        if (!provider.capabilities?.includes(capability)) continue;
        const providerName = providerDisplayName(provider, providers);
        for (const model of providerModelsForCapability(provider, capability)) {
            const selection = { providerId: provider.id, model };
            options.push({
                ...selection,
                providerName,
                value: encodeProviderModelSelection(selection),
                label: `${providerName} · ${model}`,
            });
        }
    }
    return options;
}
function ensureRouting(config: RelayCompatibleConfig, providers: ApiRelayProvider[]): ApiRelayRouting {
    const input = config.apiRouting || {};
    const fallbackModels: Record<ApiCapability, string> = {
        text: config.textModel || config.model || "",
        image: config.imageModel || config.model || "",
        video: config.videoModel || "",
        audio: config.audioModel || "",
    };

    return API_CAPABILITIES.reduce((routing, capability) => {
        const existing = input[capability] || defaultApiRelayRouting[capability];
        const savedProviderId = String(existing.providerId || "").trim();
        const savedModel = String(existing.model || "").trim();
        const savedProvider = providers.find((item) => item.id === savedProviderId);

        if (savedProviderId && !savedProvider) {
            const matchingProviders = savedModel
                ? providers.filter(
                      (item) => providerCanRunCapability(item, capability) && modelBelongsToProvider(item, capability, savedModel),
                  )
                : [];
            const reboundProvider = matchingProviders[0];
            routing[capability] = reboundProvider
                ? { source: "relay", providerId: reboundProvider.id, model: savedModel }
                : { source: "relay", providerId: savedProviderId, model: savedModel };
            return routing;
        }

        if (savedProvider && !savedProvider.capabilities.includes(capability)) {
            routing[capability] = { source: "relay", providerId: savedProviderId, model: savedModel };
            return routing;
        }

        if (savedProvider && savedModel) {
            routing[capability] = { source: "relay", providerId: savedProviderId, model: savedModel };
            return routing;
        }

        const provider = savedProvider;
        if (!provider) {
            routing[capability] = { source: "relay", providerId: "", model: "" };
            return routing;
        }
        const fallback = fallbackModels[capability];
        const model = modelBelongsToProvider(provider, capability, fallback) ? fallback : "";
        routing[capability] = {
            source: "relay",
            providerId: provider.id,
            model,
        };
        return routing;
    }, { ...defaultApiRelayRouting } as ApiRelayRouting);
}

function ensureBoardRouting(config: RelayCompatibleConfig): ApiBoardModelRouting {
    const input = config.apiBoardRouting || {};
    return API_BOARD_ROUTE_DEFINITIONS.reduce((routing, definition) => {
        const existing = input[definition.key] || defaultApiBoardModelRouting[definition.key];
        const mode = existing.mode === "custom" ? "custom" : "inherit";
        routing[definition.key] = {
            mode,
            providerId: mode === "custom" ? String(existing.providerId || "") : "",
            model: mode === "custom" ? String(existing.model || "").trim() : "",
        };
        return routing;
    }, { ...defaultApiBoardModelRouting } as ApiBoardModelRouting);
}

function ensurePlatformBoardRouting(config: RelayCompatibleConfig): ApiPlatformBoardModelRouting {
    const input = config.apiPlatformBoardRouting || {};
    return API_BOARD_ROUTE_DEFINITIONS.reduce((routing, definition) => {
        const existing = input[definition.key] || defaultApiPlatformBoardModelRouting[definition.key];
        const mode = existing.mode === "custom" ? "custom" : "inherit";
        routing[definition.key] = {
            mode,
            model: mode === "custom" ? String(existing.model || "").trim() : "",
        };
        return routing;
    }, { ...defaultApiPlatformBoardModelRouting } as ApiPlatformBoardModelRouting);
}

function legacyProviderFromConfig(config: RelayCompatibleConfig) {
    const baseUrl = String(config.baseUrl || "").trim();
    const apiKey = String(config.apiKey || "").trim();
    const hasCustomApi = Boolean(apiKey || (baseUrl && baseUrl !== "https://api.openai.com"));
    if (!hasCustomApi) return [];

    const models = mergeModelLists(config.models || [], config.textModels || [], config.imageModels || [], config.videoModels || [], config.audioModels || [], [config.textModel || "", config.imageModel || "", config.videoModel || "", config.audioModel || ""]);
    return [
        createApiRelayProvider({
            id: "legacy-default-relay",
            name: "默认中转",
            baseUrl,
            apiKey,
            enabled: true,
            capabilities: ["text", "image", "video", "audio"],
            models,
        }),
    ];
}
