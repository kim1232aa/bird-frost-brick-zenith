"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
    listedRelayModelOptionsForCapability,
    type ApiBoardModelRouting,
    type ApiPlatformBoardModelRouting,
    type ApiCapability,
    type ApiRelayAdvanced,
    type ApiRelayProvider,
    type ApiRelayRouting,
    type ProviderModelOption,
    type ProviderModelSelection,
} from "@/stores/api-relay-config";
import { hasProviderCredential, normalizeProviderCredentials } from "@/stores/provider-credentials";
import { mergePersistedRelays, mergeRelaySources } from "@/studio/relay-merge";
import { shouldReplaceManagedRelays, studioRelays, studioRouting } from "@/studio/wiring";
import { useStudioSession } from "@/studio/session";
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
    imageHostBaseUrl: string;
    imageHostApiKey: string;
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
    imageAdvancedSettingsByScope: ImageAdvancedSettingsByScope;
    imageGenerationLegacyMigration?: ImageGenerationLegacyMigration;
    imageRequestBasicSettings?: true | ImageRequestBasicSettingsOverride;
    videoGenerationSettingsByScope: VideoGenerationSettingsByScope;
    videoGenerationLegacyMigration?: VideoGenerationLegacyMigration;
    apiRelays: ApiRelayProvider[];
    apiRouting: ApiRelayRouting;
    apiBoardRouting: ApiBoardModelRouting;
    apiPlatformBoardRouting: ApiPlatformBoardModelRouting;
    apiRelayAdvanced: ApiRelayAdvanced;
    requestModelSelections?: Partial<Record<ApiCapability, ProviderModelSelection | string>>;
};

export type ImageRequestBasicSettingKey = "quality" | "size" | "count";
export type ImageRequestBasicSettingsOverride = Pick<Partial<ImageAdvancedSettings>, ImageRequestBasicSettingKey> & {
    fromConfig?: readonly ImageRequestBasicSettingKey[];
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
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

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
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

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    hydrated: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
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
};

export const useConfigHydrationRuntimeStore = create<ConfigHydrationRuntimeState>()(() => ({
    error: null,
    isRetrying: false,
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
        .filter(
            (provider) =>
                provider.enabled &&
                provider.capabilities.includes(capability) &&
                hasProviderCredential(normalizeProviderCredentials(provider.apiKey, provider.apiKeys)),
        )
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
    return models.includes(model) ? model : "";
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

export function selectableProviderModelsByCapability(config: AiConfig, capability: ModelCapability): ProviderModelOption[] {
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const relays = normalized.apiRelays?.length ? normalized.apiRelays : studioRelays();
    return listedRelayModelOptionsForCapability(relays, capability);
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
            webdav: defaultWebdavSyncConfig,
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
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async () => {
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
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                const persistedRelays = hasOwn(persistedConfig, "apiRelays") ? persistedConfig.apiRelays : undefined;
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
                    imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
                    videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
                    textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
                    audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
                });
                const migratedConfig = migrateLegacyScopedGenerationSettings(
                    normalizedConfig,
                    persistedConfig,
                );
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: migratedConfig,
                };
            },
            onRehydrateStorage: (initialState) => (state, error) => {
                if (error) {
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

export async function flushConfigStore() {
    const { config, webdav } = useConfigStore.getState();
    await flushRecoverableConfig(
        CONFIG_STORE_KEY,
        JSON.stringify({ state: { config, webdav }, version: 0 }),
    );
}
