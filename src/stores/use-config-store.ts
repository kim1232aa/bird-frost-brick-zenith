"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { browserSafeConfigEnvelope } from "@/lib/config-secret-redaction";
import { flushRecoverableConfig, recoverableConfigStorage } from "@/lib/config-state-storage";
import { apiGet } from "@/services/api/request";
import { buildApiUrl } from "@/services/api/url";
import type { AdminPublicSettings } from "@/services/api/admin";
import {
    API_CAPABILITIES,
    defaultApiBoardModelRouting,
    defaultApiPlatformBoardModelRouting,
    defaultApiRelayAdvanced,
    defaultApiRelayRouting,
    ensureApiRelaySettings,
    filterModelsByCapability,
    inferCapabilityFromModel,
    mergeModelLists,
    modelMatchesCapability,
    normalizeModelList,
    resolveCapabilityRoute,
    enabledRelayModelOptionsForCapability,
    providerCanRunCapability,
    resolveConfiguredModel,
    type ApiBoardModelRouting,
    type ApiPlatformBoardModelRouting,
    type ApiCapability,
    type ApiRelayAdvanced,
    type ApiRelayProvider,
    type ApiRelayRouting,
    type ProviderModelOption,
    type ProviderModelSelection,
} from "@/stores/api-relay-config";
import { mergePersistedRelays, mergeRelaySources } from "@/studio/relay-merge";
import { mergeRelayProviderLists, publishRelayProviders, subscribeRelayProviders } from "@/stores/relay-bridge";
import { shouldReplaceManagedRelays, studioRelays, studioRouting } from "@/studio/wiring";
import { useStudioSession } from "@/studio/session";
import { loadImageHostCredential, saveImageHostCredential, saveRelayVault } from "@/studio/server/relay-vault";
import {
    migrateLegacyImageGenerationSettings,
    normalizeImageAdvancedSettingsByScope,
    type ImageGenerationLegacyMigration,
    type ImageAdvancedSettings,
    type ImageAdvancedSettingsByScope,
} from "@/stores/image-advanced-settings";
import {
    migrateLegacyVideoGenerationSettings,
    normalizeVideoGenerationSettingsByScope,
    resolveVideoGenerationSettingsScope,
    type VideoGenerationLegacyMigration,
    type VideoGenerationSettingsByScope,
} from "@/stores/video-generation-settings";
import { resolveVideoModelCapability } from "@/services/api/video-model-capabilities";

export { filterModelsByCapability, modelMatchesCapability };
export { buildApiUrl };
export {
    applyCivitaiLoraResolution,
    imageAdvancedSettingsToRequest,
    imageLoraResolutionError,
    migrateLegacyImageGenerationSettings,
    normalizeImageAdvancedSettings,
    normalizeImageAdvancedSettingsByScope,
    readImageAdvancedSettings,
    readScopedImageGenerationSettings,
    resetImageLoraResolution,
    writeImageAdvancedSettings,
    validateScopedImageGenerationSettings,
    type ImageAdvancedSettings,
    type ImageAdvancedSettingsByScope,
    type ImageAdvancedSettingsScope,
    type ImageGenerationLegacyMigration,
    type ImageLoraSetting,
} from "@/stores/image-advanced-settings";
export {
    inferVideoGenerationOperation,
    migrateLegacyVideoGenerationSettings,
    normalizeVideoGenerationSettings,
    normalizeVideoGenerationSettingsByScope,
    readScopedVideoGenerationSettings,
    readVideoDimensionsDraft,
    readVideoGenerationSettings,
    replayableVideoGenerationScope,
    resolveVideoGenerationRouteModel,
    resolveVideoGenerationSettingsScope,
    snapshotVideoWireFormat,
    updateVideoDimensionsDraft,
    videoConfigToGenerationParameters,
    videoGenerationOperationFromIntent,
    videoGenerationSettingsToRequest,
    writeVideoGenerationSettings,
    type VideoGenerationOperation,
    type VideoGenerationSettings,
    type VideoGenerationSettingsByScope,
    type VideoGenerationSettingsScope,
    type VideoGenerationLegacyMigration,
    type VideoDimensionsDraft,
    type VideoDimensionsDraftUpdate,
    type VideoWireFormatSnapshot,
} from "@/stores/video-generation-settings";

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    /** 参考图公网化图床地址（POST multipart 上传，返回图片直链）。 */
    imageHostBaseUrl: string;
    /** One-time image-host Key input; cleared after the server vault confirms it. */
    imageHostApiKey: string;
    /** Browser-safe marker; the raw image-host Key never occupies this field. */
    imageHostHasApiKey?: boolean;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
    /** Provider/model/operation-isolated image settings. Unsupported fields remain stored but are not sent. */
    imageAdvancedSettingsByScope: ImageAdvancedSettingsByScope;
    /** One-time import marker for former global quality/size/count settings. */
    imageGenerationLegacyMigration?: ImageGenerationLegacyMigration;
    /**
     * Per-request Canvas basic overrides. Each present field overrides only
     * the matching provider/model/operation-scoped value. `true` is retained
     * solely for older direct callers that deliberately pass all three fields
     * in the ephemeral config object; persisted Canvas paths use the object.
     */
    imageRequestBasicSettings?: true | ImageRequestBasicSettingsOverride;
    /** Provider/model/operation-isolated video settings. Unknown provider payload fields are never accepted. */
    videoGenerationSettingsByScope: VideoGenerationSettingsByScope;
    /** One-time import marker for former global video settings. */
    videoGenerationLegacyMigration?: VideoGenerationLegacyMigration;
    apiRelays: ApiRelayProvider[];
    apiRouting: ApiRelayRouting;
    apiBoardRouting: ApiBoardModelRouting;
    apiPlatformBoardRouting: ApiPlatformBoardModelRouting;
    apiRelayAdvanced: ApiRelayAdvanced;
    /** Request-scoped Canvas selections; never populated by persisted global settings. */
    requestModelSelections?: Partial<Record<ApiCapability, ProviderModelSelection | string>>;
};

export type ImageRequestBasicSettingKey = "quality" | "size" | "count";
export type ImageRequestBasicSettingsOverride = Pick<Partial<ImageAdvancedSettings>, ImageRequestBasicSettingKey> & {
    /**
     * Explicit fields assigned after a builder returns (for example Story's
     * fixed ratio/quality/count). This remains request-local and never reads a
     * persisted global as a fallback.
     */
    fromConfig?: readonly ImageRequestBasicSettingKey[];
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = ApiCapability;

function seededRelays() {
    return studioRelays();
}
function seededRouting() {
    return studioRouting();
}

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: "https://superxihe.com/v1",
    apiKey: "",
    model: "grok-4.6",
    imageModel: "grok-imagine-image",
    videoModel: "grok-imagine-video",
    textModel: "grok-4.6",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    imageHostBaseUrl: "",
    imageHostApiKey: "",
    imageHostHasApiKey: false,
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "1k",
    size: "",
    count: "1",
    canvasImageCount: "1",
    imageAdvancedSettingsByScope: {},
    imageGenerationLegacyMigration: { version: 1, state: "migrated" },
    videoGenerationSettingsByScope: {},
    videoGenerationLegacyMigration: { version: 1, state: "migrated" },
    apiRelays: seededRelays(),
    apiRouting: seededRouting(),
    apiBoardRouting: defaultApiBoardModelRouting,
    apiPlatformBoardRouting: defaultApiPlatformBoardModelRouting,
    apiRelayAdvanced: defaultApiRelayAdvanced,
};

function migrateLegacyScopedGenerationSettings(
    config: AiConfig,
    persistedConfig: Partial<AiConfig>,
): AiConfig {
    const imageHasLegacyValues = hasOwn(persistedConfig, "quality") || hasOwn(persistedConfig, "size") || hasOwn(persistedConfig, "count");
    const videoHasLegacyValues = hasOwn(persistedConfig, "videoSeconds") || hasOwn(persistedConfig, "vquality") || hasOwn(persistedConfig, "size") || hasOwn(persistedConfig, "videoGenerateAudio") || hasOwn(persistedConfig, "videoWatermark");
    const imageMarker = persistedConfig.imageGenerationLegacyMigration;
    const videoMarker = persistedConfig.videoGenerationLegacyMigration;
    const imageNeedsMigration = imageMarker?.state === "pending" || (!imageMarker && imageHasLegacyValues);
    const videoNeedsMigration = videoMarker?.state === "pending" || (!videoMarker && videoHasLegacyValues);
    if (!imageNeedsMigration && !videoNeedsMigration) return config;

    let next: AiConfig = {
        ...config,
        ...(imageNeedsMigration ? { imageGenerationLegacyMigration: imageMarker } : {}),
        ...(videoNeedsMigration ? { videoGenerationLegacyMigration: videoMarker } : {}),
    };
    if (imageNeedsMigration) {
        const scope = activeImageGenerationScope(next);
        const migrated = migrateLegacyImageGenerationSettings(next, scope);
        next = {
            ...next,
            imageAdvancedSettingsByScope: migrated.settingsByScope,
            imageGenerationLegacyMigration: migrated.migration,
        };
    }
    if (videoNeedsMigration) {
        const scope = activeVideoGenerationScope(next);
        const provider = next.apiRelays.find((item) => item.id === scope.providerId);
        const capability = resolveVideoModelCapability({ model: scope.model, provider });
        const migrated = migrateLegacyVideoGenerationSettings(next, scope, capability);
        next = {
            ...next,
            videoGenerationSettingsByScope: migrated.settingsByScope,
            videoGenerationLegacyMigration: migrated.migration,
        };
    }
    return next;
}

function activeImageGenerationScope(config: AiConfig) {
    const board = config.apiBoardRouting.imageGeneration;
    const route = board?.mode === "custom" ? board : config.apiRouting.image;
    return {
        providerId: String(route?.providerId || (config.channelMode === "remote" ? "remote" : "")).trim(),
        model: String(route?.model || config.imageModel || "").trim(),
        operation: "generate" as const,
    };
}

function activeVideoGenerationScope(config: AiConfig) {
    const board = config.apiBoardRouting.videoGeneration;
    const route = board?.mode === "custom" ? board : config.apiRouting.video;
    return {
        providerId: String(route?.providerId || (config.channelMode === "remote" ? "remote" : "")).trim(),
        model: String(route?.model || config.videoModel || "").trim(),
        operation: "text-to-video" as const,
    };
}

function hasOwn(value: object, key: string) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function redactPersistedConfig(config: Partial<AiConfig>): Partial<AiConfig> {
    return {
        ...config,
        apiKey: "",
        imageHostApiKey: "",
        imageHostHasApiKey: Boolean(config.imageHostHasApiKey || config.imageHostApiKey),
        ...(Array.isArray(config.apiRelays)
            ? { apiRelays: config.apiRelays.map(redactRelayCredentials) }
            : {}),
    };
}

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    hydrated: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
    setHydrated: (hydrated: boolean) => void;
};

type ConfigHydrationRuntimeState = {
    error: unknown | null;
    isRetrying: boolean;
    imageHostCredentialError: string | null;
};

// This state deliberately lives outside the persisted config store. Recording a
// hydration failure through the persisted store would write its in-memory
// defaults before the saved configuration has been read.
export const useConfigHydrationRuntimeStore = create<ConfigHydrationRuntimeState>()(() => ({
    error: null,
    isRetrying: false,
    imageHostCredentialError: null,
}));

function resolveEffectiveConfig(config: AiConfig, _modelChannel: AdminPublicSettings["modelChannel"] | null) {
    return mergeLocalRelayModels({ ...config, channelMode: "local" });
}

function mergeLocalRelayModels(input: AiConfig) {
    const config = ensureApiRelaySettings(input);
    const relayTextModels = enabledRelayModelsForCapability(config.apiRelays, "text");
    const relayImageModels = enabledRelayModelsForCapability(config.apiRelays, "image");
    const relayVideoModels = enabledRelayModelsForCapability(config.apiRelays, "video");
    const relayAudioModels = enabledRelayModelsForCapability(config.apiRelays, "audio");
    const models = mergeModelLists(relayTextModels, relayImageModels, relayVideoModels, relayAudioModels);
    const textModels = normalizeModelList(relayTextModels);
    const imageModels = normalizeModelList(relayImageModels);
    const videoModels = normalizeModelList(relayVideoModels);
    const audioModels = normalizeModelList(relayAudioModels);
    const textModel = validRouteModel(config.apiRouting.text.model, textModels);
    const imageModel = validRouteModel(config.apiRouting.image.model, imageModels);
    const videoModel = validRouteModel(config.apiRouting.video.model, videoModels);
    const audioModel = validRouteModel(config.apiRouting.audio.model, audioModels);
    return {
        ...config,
        models,
        textModels,
        imageModels,
        videoModels,
        audioModels,
        model: validRouteModel(config.model, models) || imageModel || textModel || videoModel || audioModel,
        textModel,
        imageModel,
        videoModel,
        audioModel,
    };
}

export function enabledRelayModelsForCapability(relays: ApiRelayProvider[], capability: ApiCapability) {
    return relays
        .filter((provider) => providerCanRunCapability(provider, capability))
        .flatMap((provider) =>
            capability === "text"
                ? provider.textModels
                : capability === "image"
                  ? provider.imageModels
                  : capability === "video"
                    ? provider.videoModels
                    : provider.audioModels,
        );
}

function validRouteModel(model: string, models: string[]) {
    return resolveConfiguredModel(model, models);
}

function normalizePersistedImageQuality(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    const legacyTier = ({ auto: "1k", low: "1k", medium: "2k", high: "4k" } as Record<string, string>)[normalized] || (["1k", "2k", "4k"].includes(normalized) ? normalized : "1k");
    return ["", "auto", "low", "medium", "high", "1k", "2k", "4k"].includes(normalized)
        ? legacyTier
        : String(value || "").trim();
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!config) return [];
    if (!capability) return config.models || [];
    return config[modelListKey(capability)] || [];
}

/**
 * Global model choices retain provider identity. Keep the legacy string list
 * above for provider-local controls and old callers that have not migrated.
 */
export function selectableProviderModelsByCapability(config: AiConfig, capability: ModelCapability): ProviderModelOption[] {
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const relays = normalized.apiRelays?.length ? normalized.apiRelays : studioRelays();
    return enabledRelayModelOptionsForCapability(relays, capability);
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    if (!model.trim()) return false;
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const requestCapability = API_CAPABILITIES.find((candidate) => {
        const selection = config.requestModelSelections?.[candidate];
        return typeof selection === "string"
            ? selection.trim() === model.trim()
            : String(selection?.model || "").trim() === model.trim();
    });
    const capability = requestCapability || inferCapabilityFromModel(model);
    const configuredRoute = normalized.apiRouting[capability];
    if (!configuredRoute.providerId) return false;
    const requestSelection = config.requestModelSelections?.[capability];
    const requested = requestSelection && typeof requestSelection !== "string"
        ? requestSelection
        : configuredRoute.model === model.trim()
          ? { providerId: configuredRoute.providerId, model: configuredRoute.model }
          : model;
    try {
        resolveCapabilityRoute(normalized, capability, requested);
        return true;
    } catch {
        return false;
    }
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            hydrated: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                        ...(key === "imageHostBaseUrl" && value !== state.config.imageHostBaseUrl
                            ? { imageHostHasApiKey: false }
                            : {}),
                    },
                })),
            loadPublicSettings: async () => {
                // Any Zustand set before asynchronous persistence hydration
                // finishes would serialize the in-memory defaults and can
                // overwrite the saved relay/model routing configuration.
                if (!get().hydrated || get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/public-settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
            setHydrated: (hydrated) => set({ hydrated }),
        }),
        {
            name: CONFIG_STORE_KEY,
            storage: createJSONStorage(() => recoverableConfigStorage),
            partialize: (state) => ({
                config: redactPersistedConfig(state.config),
            }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const safePersistedConfig = redactPersistedConfig(persistedConfig);
                const config = { ...defaultConfig, ...safePersistedConfig };
                const persistedRelays = hasOwn(safePersistedConfig, "apiRelays") ? safePersistedConfig.apiRelays : undefined;
                const replaceManaged = shouldReplaceManagedRelays(persistedRelays as ApiRelayProvider[] | undefined);
                const apiRelays = mergePersistedRelays(persistedRelays as ApiRelayProvider[] | undefined);
                const { apiRelays: _defaultApiRelays, ...configWithoutRelays } = config;
                const normalizedConfig = ensureApiRelaySettings({
                    ...configWithoutRelays,
                    apiRelays,
                    ...(replaceManaged ? { apiRouting: defaultConfig.apiRouting } : {}),
                    channelMode: "local",
                    imageModel: replaceManaged ? defaultConfig.imageModel : config.imageModel || config.model,
                    videoModel: replaceManaged ? defaultConfig.videoModel : config.videoModel || defaultConfig.videoModel,
                    textModel: replaceManaged ? defaultConfig.textModel : config.textModel || config.model,
                    audioModel: config.audioModel || defaultConfig.audioModel,
                    audioVoice: config.audioVoice || defaultConfig.audioVoice,
                    audioFormat: config.audioFormat || defaultConfig.audioFormat,
                    audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                    audioInstructions: config.audioInstructions || "",
                    videoSeconds: config.videoSeconds || "6",
                    vquality: config.vquality || "720",
                    videoGenerateAudio: config.videoGenerateAudio || "true",
                    videoWatermark: config.videoWatermark || "false",
                    quality: normalizePersistedImageQuality(config.quality),
                    canvasImageCount: config.canvasImageCount || "1",
                    imageAdvancedSettingsByScope: normalizeImageAdvancedSettingsByScope(config.imageAdvancedSettingsByScope),
                    videoGenerationSettingsByScope: normalizeVideoGenerationSettingsByScope(config.videoGenerationSettingsByScope),
                    imageModels: Array.isArray(safePersistedConfig.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
                    videoModels: Array.isArray(safePersistedConfig.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
                    textModels: Array.isArray(safePersistedConfig.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
                    audioModels: Array.isArray(safePersistedConfig.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
                });
                const migratedConfig = migrateLegacyScopedGenerationSettings(
                    normalizedConfig,
                    safePersistedConfig,
                );
                return {
                    ...current,
                    config: migratedConfig,
                };
            },
            onRehydrateStorage: (initialState) => (state, error) => {
                if (error) {
                    // Never call a Zustand action here: every action is wrapped
                    // by persist and would write the in-memory empty defaults
                    // over the configuration that merely failed to load. Keep
                    // the UI gated and retry the native store instead.
                    console.error("Failed to restore local configuration; retrying without overwriting it.", error);
                    useConfigHydrationRuntimeStore.setState({ error, isRetrying: false });
                    scheduleConfigRehydrate();
                    return;
                }
                useConfigHydrationRuntimeStore.setState({ error: null, isRetrying: false });
                clearConfigRehydrateRetry();
                (state || initialState).setHydrated(true);
            },
        },
    ),
);


export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    const studioRelaysState = useStudioSession((state) => state.relays);
    return useMemo(() => {
        const resolved = resolveEffectiveConfig(config, modelChannel);
        const apiRelays = mergeRelaySources(resolved.apiRelays, studioRelaysState);
        return { ...resolved, apiRelays };
    }, [config, modelChannel, studioRelaysState]);
}
let configRehydrateTimer: number | null = null;

function scheduleConfigRehydrate() {
    if (typeof window === "undefined" || configRehydrateTimer !== null) return;
    configRehydrateTimer = window.setTimeout(() => {
        configRehydrateTimer = null;
        retryConfigHydration();
    }, 1_000);
}

function clearConfigRehydrateRetry() {
    if (typeof window === "undefined" || configRehydrateTimer === null) return;
    window.clearTimeout(configRehydrateTimer);
    configRehydrateTimer = null;
}

export function retryConfigHydration() {
    clearConfigRehydrateRetry();
    useConfigHydrationRuntimeStore.setState({ isRetrying: true });
    void Promise.resolve(useConfigStore.persist.rehydrate()).catch((error: unknown) => {
        useConfigHydrationRuntimeStore.setState({ error, isRetrying: false });
        scheduleConfigRehydrate();
    });
}

function relayHasPendingCredentials(provider: ApiRelayProvider) {
    return Boolean(
        String(provider.apiKey || "").trim()
        || provider.apiKeys?.some((value) => String(value || "").trim()),
    );
}

function redactRelayCredentials(provider: ApiRelayProvider): ApiRelayProvider {
    const hasApiKey = Boolean(
        provider.hasApiKey
        || relayHasPendingCredentials(provider)
        || provider.apiKeyId
        || provider.apiKeyIds?.length,
    );
    return {
        ...provider,
        apiKey: "",
        apiKeys: undefined,
        hasApiKey,
        // 密钥已入库即视为可用：不再用「未启用」拦截刚配好 key 的供应商；
        // 用户仍可保存后手动停用。
        enabled: hasApiKey ? true : provider.enabled,
    };
}

function relayCredentialsMatch(current: ApiRelayProvider, saved: ApiRelayProvider) {
    return current.apiKey === saved.apiKey
        && JSON.stringify(current.apiKeys || []) === JSON.stringify(saved.apiKeys || []);
}

async function savePendingRelayCredentials() {
    while (true) {
        const snapshot = useConfigStore.getState().config;
        const pendingRelays = snapshot.apiRelays.filter(relayHasPendingCredentials);
        if (!pendingRelays.length) return;
        const session = useStudioSession.getState();
        await saveRelayVault({
            data: {
                relays: mergeRelaySources(session.relays, snapshot.apiRelays),
                hiddenPresetIds: session.hiddenPresetIds,
            },
        });
        await fetch("/client-api/config-vault", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                relays: mergeRelaySources(session.relays, snapshot.apiRelays),
                hiddenPresetIds: session.hiddenPresetIds,
            }),
        }).catch(() => {});
        const savedById = new Map(pendingRelays.map((provider) => [provider.id, provider]));
        useConfigStore.setState((state) => ({
            config: {
                ...state.config,
                apiRelays: state.config.apiRelays.map((provider) => {
                    const saved = savedById.get(provider.id);
                    return saved && relayCredentialsMatch(provider, saved)
                        ? redactRelayCredentials(provider)
                        : provider;
                }),
            },
        }));
    }
}

async function saveImageHostCredentialAndRedact(baseUrl: string, apiKey: string) {
    const normalizedBaseUrl = String(baseUrl || "").trim();
    const normalizedApiKey = String(apiKey || "").trim();
    if (!normalizedApiKey) return { ok: true as const, baseUrl: normalizedBaseUrl, hasApiKey: false };
    let result: Awaited<ReturnType<typeof saveImageHostCredential>>;
    try {
        result = await saveImageHostCredential({
            data: { baseUrl: normalizedBaseUrl, apiKey: normalizedApiKey },
        });
    } catch (error) {
        const detail = error instanceof Error && error.message.trim() ? `：${error.message.trim()}` : "";
        useConfigHydrationRuntimeStore.setState({
            imageHostCredentialError: `图床密钥库保存失败${detail}`,
        });
        throw error;
    }
    useConfigHydrationRuntimeStore.setState({ imageHostCredentialError: null });
    useConfigStore.setState((state) => {
        const currentBaseUrl = String(state.config.imageHostBaseUrl || "").trim();
        const currentApiKey = String(state.config.imageHostApiKey || "").trim();
        if (currentBaseUrl !== normalizedBaseUrl || currentApiKey !== normalizedApiKey) return state;
        return {
            config: {
                ...state.config,
                imageHostApiKey: "",
                imageHostHasApiKey: result.hasApiKey,
            },
        };
    });
    return result;
}

async function savePendingImageHostCredential() {
    while (true) {
        const config = useConfigStore.getState().config;
        const apiKey = String(config.imageHostApiKey || "").trim();
        if (!apiKey) return;
        await saveImageHostCredentialAndRedact(config.imageHostBaseUrl, apiKey);
    }
}

let configFlushQueue: Promise<void> = Promise.resolve();

async function flushLatestConfigStore() {
    while (true) {
        await savePendingRelayCredentials();
        await savePendingImageHostCredential();
        const { config } = useConfigStore.getState();
        if (config.apiRelays.some(relayHasPendingCredentials) || config.imageHostApiKey.trim()) continue;
        await flushRecoverableConfig(
            CONFIG_STORE_KEY,
            browserSafeConfigEnvelope(
                JSON.stringify({ state: { config }, version: 0 }),
                { redactProxy: false },
            ),
        );
        const latest = useConfigStore.getState().config;
        if (!latest.apiRelays.some(relayHasPendingCredentials) && !latest.imageHostApiKey.trim()) return;
    }
}

export function flushConfigStore() {
    const result = configFlushQueue.then(flushLatestConfigStore, flushLatestConfigStore);
    configFlushQueue = result.catch(() => undefined);
    return result;
}

/** Store a transient image-host Key server-side, then erase it from browser state. */
export function persistImageHostCredential(baseUrl: string, apiKey: string) {
    return saveImageHostCredentialAndRedact(baseUrl, apiKey);
}

/** Hydrate only the public image-host marker; raw credentials never cross this boundary. */
export async function hydrateImageHostCredential() {
    try {
        const remote = await loadImageHostCredential();
        useConfigStore.setState((state) => {
            if (state.config.imageHostApiKey.trim()) return state;
            if (!remote) return {
                config: { ...state.config, imageHostHasApiKey: false },
            };
            return {
                config: {
                    ...state.config,
                    imageHostBaseUrl: remote.baseUrl,
                    imageHostApiKey: "",
                    imageHostHasApiKey: remote.hasApiKey,
                },
            };
        });
        useConfigHydrationRuntimeStore.setState({ imageHostCredentialError: null });
        return remote;
    } catch (error) {
        const detail = error instanceof Error && error.message.trim() ? `：${error.message.trim()}` : "";
        useConfigHydrationRuntimeStore.setState({
            imageHostCredentialError: `图床密钥库读取失败${detail}`,
        });
        return undefined;
    }
}

export async function persistApiSettingsBeforeClose(
    flush: () => Promise<void>,
    close: () => void,
    reportError?: (error: string) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        await flush();
        close();
        return { ok: true };
    } catch (error) {
        const detail = error instanceof Error && error.message.trim() ? `：${error.message.trim()}` : "";
        const failure = {
            ok: false as const,
            error: `设置保存失败，后端密钥库或本地配置未确认写入。弹窗已保持打开，请重试${detail}`,
        };
        reportError?.(failure.error);
        return failure;
    }
}

// Bridge: mirror the 接线页 / studio provider list (useStudioSession.relays)
// into this config's apiRelays and publish our own edits back, so a key saved
// in the 中转设置对话框 immediately appears in model selectors and vice
// versa. Raw keys never cross the bridge — see relay-bridge.ts.
useConfigStore.subscribe((state, prev) => {
    if (state.config.apiRelays !== prev.config.apiRelays) {
        publishRelayProviders(state.config.apiRelays, "config");
    }
});

subscribeRelayProviders((incoming, source) => {
    if (source !== "session") return;
    const current = useConfigStore.getState().config;
    const merged = mergeRelayProviderLists(current.apiRelays, incoming);
    if (merged === current.apiRelays) return;
    useConfigStore.setState({ config: { ...current, apiRelays: merged } });
});
