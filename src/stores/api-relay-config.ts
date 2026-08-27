import { normalizeAudioCapabilityProfiles, type AudioCapabilityProfileId } from "@/services/api/audio-model-capabilities";
import {
    IMAGE_CAPABILITY_PROFILES,
    isImageCapabilityProfileId,
    normalizeImageCapabilityProfiles,
    type ImageCapabilityProfileId,
    type ImageCapabilityProfileSelection,
    type ImageOperation,
} from "@/services/api/image-model-capabilities";
import { normalizeVideoCapabilityProfiles, type VideoCapabilityProfileId } from "@/services/api/video-model-capabilities";
import {
    normalizeModelsDevMetadataRecord,
    type RelayModelCatalogMetadataRecord,
} from "@/services/api/models-dev-catalog";
import { CIVITAI_MATURE_POLICY_VERSION, civitaiAllowsMatureContent, isCivitaiAdapterType } from "@/services/api/civitai-orchestration";
import { createProviderCredentialId, hasProviderCredential, normalizeProviderCredentials, normalizeProviderKeyInput, reconcileProviderCredentialIds } from "@/stores/provider-credentials";

export type ApiCapability = "text" | "image" | "video" | "audio";

export type ApiRouteSource = "platform" | "localPool" | "relay";

export type ApiCapabilityRoute = {
    source?: ApiRouteSource;
    providerId: string;
    model: string;
};

export type ApiRelayRouting = Record<ApiCapability, ApiCapabilityRoute>;

export type ApiBoardRouteKey =
    | "storyDirector"
    | "videoWorkflowText"
    | "imagePrompt"
    | "videoPrompt"
    | "imageGeneration"
    | "videoGeneration";

export type ApiBoardModelRoute = {
    mode: "inherit" | "custom";
    providerId: string;
    model: string;
};

export type ApiBoardModelRouting = Record<ApiBoardRouteKey, ApiBoardModelRoute>;

export type ApiPlatformBoardModelRoute = {
    mode: "inherit" | "custom";
    model: string;
};

export type ApiPlatformBoardModelRouting = Record<ApiBoardRouteKey, ApiPlatformBoardModelRoute>;

export type ApiRelayAdvanced = {
    allowCustomModel: boolean;
    defaultTimeoutMs: number;
    showDisabledProviders: boolean;
};

export type ApiRelayProxyMode = "direct" | "custom";

export type ApiRelayProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiKeyId?: string;
    /** 多 Key 轮询池；为空时回退 apiKey。 */
    apiKeys?: string[];
    apiKeyIds?: string[];
    /** 协议适配类型：agnes / dashscope / ark / sensenova / civitai-orchestration 等；空则按 OpenAI 兼容直通。 */
    adapterType?: string;
    /** 每个 provider 独立控制；默认 direct，绝不隐式继承系统或环境代理。 */
    proxyMode: ApiRelayProxyMode;
    /** 仅 proxyMode=custom 时随本地 loopback 控制头发送，支持 HTTP(S) 代理。 */
    proxyUrl: string;
    /** Endpoint ID 可不透明；按模型显式绑定视频参考图协议能力。 */
    videoCapabilityProfiles?: Record<string, VideoCapabilityProfileId>;
    /** 音频分类不等于可提交；按模型显式绑定当前 text-to-speech wire 协议。 */
    audioCapabilityProfiles?: Record<string, AudioCapabilityProfileId>;
    /** 自定义 Endpoint 的图片能力按模型、operation 显式绑定；未配置时由 registry 自动识别或标为未验证。 */
    imageCapabilityProfiles?: Record<string, ImageCapabilityProfileSelection>;
    enabled: boolean;
    capabilities: ApiCapability[];
    models: string[];
    textModels: string[];
    imageModels: string[];
    videoModels: string[];
    audioModels: string[];
    /** models.dev 仅用于辅助分类/展示；不表示该中转端点实际支持对应生成参数。 */
    modelCatalogMetadata?: RelayModelCatalogMetadataRecord;
    /** Civitai 成人内容。缺省为开启，与产品约定和 Yellow Buzz 权限一致；显式 false 才关闭。 */
    allowMatureContent?: boolean;
    /** 记录上次应用的 Civitai mature 默认策略版本，用于把旧的默认 false 迁回 true。 */
    civitaiMaturePolicyVersion?: number;
    /** 仅在用户明确开启中转专属超时时存在；否则继承 apiRelayAdvanced.defaultTimeoutMs。 */
    timeoutOverrideMs?: number;
    /** 兼容旧持久化字段。新的路由只通过 timeoutOverrideMs 读取中转专属超时。 */
    timeoutMs: number;
    remark: string;
    createdAt: string;
    updatedAt: string;
    endpoints?: {
        chat?: string;
        images?: string;
        videosCreate?: string;
        videosPoll?: string;
        models?: string;
        test?: string;
    };
    authScheme?: "Bearer" | "Key" | "x-api-key";
    protocol?: string;
};

export type ResolvedCapabilityRoute = {
    provider: ApiRelayProvider;
    capability: ApiCapability;
    model: string;
};

/**
 * A model ID is only meaningful together with the provider that owns it.
 * Keep this pair as the persisted/request identity for global selectors;
 * provider-local settings may continue to use a bare model string.
 */
export type ProviderModelSelection = {
    providerId: string;
    model: string;
};

export type ProviderModelOption = ProviderModelSelection & {
    providerName: string;
    /** Stable opaque value suitable for a Select item. */
    value: string;
    /** Human-readable global picker label. */
    label: string;
};

export type ProviderModelResolution =
    | {
          status: "resolved";
          selection: ProviderModelSelection;
          provider: ApiRelayProvider;
      }
    | {
          status: "ambiguous";
          selection: null;
          model: string;
          owners: ApiRelayProvider[];
      }
    | {
          status: "unavailable";
          selection: null;
          model: string;
          owners: ApiRelayProvider[];
      }
    | {
          status: "empty";
          selection: null;
          model: "";
          owners: [];
      };

export type RelayCompatibleConfig = {
    channelMode?: "remote" | "local";
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    textModel?: string;
    imageModel?: string;
    videoModel?: string;
    audioModel?: string;
    models?: string[];
    textModels?: string[];
    imageModels?: string[];
    videoModels?: string[];
    audioModels?: string[];
    apiRelays?: ApiRelayProvider[];
    apiRouting?: Partial<ApiRelayRouting>;
    apiBoardRouting?: Partial<ApiBoardModelRouting>;
    apiPlatformBoardRouting?: Partial<ApiPlatformBoardModelRouting>;
    apiRelayAdvanced?: Partial<ApiRelayAdvanced>;
};

export const API_CAPABILITIES: ApiCapability[] = ["text", "image", "video", "audio"];

export const API_CAPABILITY_LABELS: Record<ApiCapability, string> = {
    text: "文本",
    image: "图片",
    video: "视频",
    audio: "音频",
};

export const API_BOARD_ROUTE_DEFINITIONS: readonly { key: ApiBoardRouteKey; label: string; capability: ApiCapability }[] = [
    { key: "storyDirector", label: "故事导演", capability: "text" },
    { key: "videoWorkflowText", label: "视频工作流文本", capability: "text" },
    { key: "imagePrompt", label: "图片提示词", capability: "text" },
    { key: "videoPrompt", label: "视频提示词", capability: "text" },
    { key: "imageGeneration", label: "图片生成", capability: "image" },
    { key: "videoGeneration", label: "视频生成", capability: "video" },
];

export const defaultApiRelayRouting: ApiRelayRouting = {
    text: { source: "relay", providerId: "", model: "" },
    image: { source: "relay", providerId: "", model: "" },
    video: { source: "relay", providerId: "", model: "" },
    audio: { source: "relay", providerId: "", model: "" },
};

export const defaultApiBoardModelRouting: ApiBoardModelRouting = {
    storyDirector: { mode: "inherit", providerId: "", model: "" },
    videoWorkflowText: { mode: "inherit", providerId: "", model: "" },
    imagePrompt: { mode: "inherit", providerId: "", model: "" },
    videoPrompt: { mode: "inherit", providerId: "", model: "" },
    imageGeneration: { mode: "inherit", providerId: "", model: "" },
    videoGeneration: { mode: "inherit", providerId: "", model: "" },
};

export const defaultApiPlatformBoardModelRouting: ApiPlatformBoardModelRouting = {
    storyDirector: { mode: "inherit", model: "" },
    videoWorkflowText: { mode: "inherit", model: "" },
    imagePrompt: { mode: "inherit", model: "" },
    videoPrompt: { mode: "inherit", model: "" },
    imageGeneration: { mode: "inherit", model: "" },
    videoGeneration: { mode: "inherit", model: "" },
};

export const defaultApiRelayAdvanced: ApiRelayAdvanced = {
    allowCustomModel: false,
    defaultTimeoutMs: 360_000,
    showDisabledProviders: false,
};

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

/** Resolve a provider timeout without letting the legacy implicit 360000 mask the global setting. */
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
        ...(credentials.apiKey ? { apiKeyId: input.apiKeyId?.trim() || createProviderCredentialId() } : {}),
        ...(credentials.apiKeys ? { apiKeys: [...credentials.apiKeys] } : {}),
        ...(apiKeyIds ? { apiKeyIds } : {}),
        ...(input.adapterType ? { adapterType: input.adapterType } : {}),
        proxyMode: input.proxyMode === "custom" ? "custom" : "direct",
        proxyUrl: String(input.proxyUrl || "").trim(),
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
    // Pre-policy providers stored the old default false. Treat that as unset so the
    // current product default (allow) is restored. An explicit later false will
    // persist after this version is written.
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
    // 同样用 Array.isArray 判断：models 存在但为空说明用户清空了模型清单，
    // 不能再从各能力分类合并回来，否则清空操作会被撤销。
    const models = Array.isArray(provider.models)
        ? normalizeModelList(persistedModels)
        : mergeModelLists(persistedTextModels, persistedImageModels, persistedVideoModels, persistedAudioModels);
    // 用 Array.isArray 而不是 .length 判断：数组存在但为空表示用户显式清空了该分类，
    // 必须尊重这个选择。改用 .length 会在清空后重新按模型名推断并把条目填回去，
    // 让分类列表变成只能新增、无法删减。
    const pickAssigned = (assigned: unknown, capability: ApiCapability) =>
        normalizeModelList(Array.isArray(assigned) ? persistedStringList(assigned) : filterModelsByCapability(models, capability));
    // Older versions could cache Grok chat models in videoModels. Repair only that
    // known legacy misclassification; preserve every other explicit user assignment.
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
    const persistedApiKeys = Array.isArray(provider.apiKeys) ? provider.apiKeys : undefined;
    const persistedApiKeyIds = Array.isArray(provider.apiKeyIds) ? provider.apiKeyIds : undefined;
    const providerName = typeof provider.name === "string" ? provider.name.trim() : "";
    const providerBaseUrl = typeof provider.baseUrl === "string" ? provider.baseUrl.trim() : "";
    const providerApiKeyId = typeof provider.apiKeyId === "string" ? provider.apiKeyId.trim() : "";
    const providerRemark = typeof provider.remark === "string" ? provider.remark : "";
    // Old providers persisted timeoutMs for every provider, including the
    // default 360000 that was never an explicit user choice. Preserve legacy
    // non-default values as overrides, but let the old default inherit the UI
    // global timeout after migration.
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
    const apiKeyIds = credentials.apiKeys
        ? reconcileProviderCredentialIds(credentials.apiKeys, persistedApiKeys, persistedApiKeyIds)
        : undefined;
    return {
        ...provider,
        name: providerName || "中转 API",
        baseUrl: providerBaseUrl,
        apiKey: credentials.apiKey,
        apiKeyId: credentials.apiKey ? providerApiKeyId || createProviderCredentialId() : undefined,
        apiKeys: credentials.apiKeys ? [...credentials.apiKeys] : undefined,
        apiKeyIds,
        proxyMode: provider.proxyMode === "custom" ? "custom" : "direct",
        proxyUrl: String(provider.proxyUrl || "").trim(),
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

/**
 * 读取某个模型、operation 的显式图片能力覆盖。
 *
 * 兼容早期的单 profile 字符串写法，并与 registry 一样对模型 ID 做大小写、
 * 点号和下划线归一化。返回空值表示该 operation 继续走自动识别/未验证流程。
 */
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

/**
 * 只更新一个模型的一项 operation 覆盖，保留其它模型及 operation 的合法映射。
 * 所有写入最终都经过 registry 的严格 normalizer，错误或 operation 不匹配的
 * profile 不会进入持久化配置。
 */
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
        // A stale or tampered UI value must not destroy an already-valid mapping.
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
            allowCustomModel: false,
        },
    };
}

export function providersForCapability(providers: ApiRelayProvider[], capability: ApiCapability, includeDisabled = false) {
    return providers.filter((provider) => (includeDisabled || provider.enabled) && provider.capabilities.includes(capability));
}

export function providerModelsForCapability(provider: ApiRelayProvider, capability: ApiCapability) {
    const models = capability === "text" ? provider.textModels : capability === "image" ? provider.imageModels : capability === "video" ? provider.videoModels : provider.audioModels;
    return normalizeModelList(models || []);
}

/**
 * Encode a provider/model pair for a Select value. JSON keeps the delimiter
 * opaque even when either ID contains punctuation that is meaningful to a
 * model endpoint (for example `provider:model` or a scoped model path).
 */
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

/**
 * Machine-generated provider ids are routing plumbing, not display text: an
 * auto-assigned `relay-<timestamp>-<random>` id, an `internal-`-prefixed
 * identifier, or a UUID was never user-authored, so a stored label identical
 * to such an id collapses to the neutral fallback. A readable label that
 * merely equals its id stays visible; the endpoint/credential/locator
 * redaction below applies regardless.
 */
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
    if (EMBEDDED_STORAGE_LOCATOR_PATTERN.test(candidate)) return true;
    if (isCredentialLikeDisplayValue(candidate)) return true;
    if (EMBEDDED_SCHEME_URL_PATTERN.test(candidate)) return true;
    return EMBEDDED_NETWORK_LOCATOR_PATTERN.test(candidate);
}

/**
 * Conservative presentation-only detector for values that look like bearer
 * credentials. Prefix patterns cover recognizable token families; the final
 * entropy check catches opaque legacy tokens without classifying readable
 * provider/model identifiers as secrets.
 */
export function isCredentialLikeDisplayValue(value: unknown) {
    if (typeof value !== "string") return false;
    const candidate = value.trim();
    if (!candidate) return false;
    if (EMBEDDED_BEARER_CREDENTIAL_PATTERN.test(candidate)) return true;
    if (KNOWN_CREDENTIAL_DISPLAY_PATTERNS.some((pattern) => pattern.test(candidate))) return true;
    return isUnknownHighEntropyCredential(candidate);
}

const DISPLAY_TOKEN_START = "(?:^|[^a-z\\d])";
const DISPLAY_TOKEN_END = "(?=$|[^a-z\\d])";

const KNOWN_CREDENTIAL_DISPLAY_PATTERNS = [
    new RegExp(`${DISPLAY_TOKEN_START}sk-(?:[a-z\\d]+-)*[a-z\\d_-]{20,}${DISPLAY_TOKEN_END}`, "iu"),
    new RegExp(`${DISPLAY_TOKEN_START}(?:gh[pousr]_[a-z\\d]{20,}|github_pat_[a-z\\d_]{20,})${DISPLAY_TOKEN_END}`, "iu"),
    new RegExp(`${DISPLAY_TOKEN_START}glpat-[a-z\\d_-]{16,}${DISPLAY_TOKEN_END}`, "iu"),
    new RegExp(`${DISPLAY_TOKEN_START}xox[baprs]-[a-z\\d-]{16,}${DISPLAY_TOKEN_END}`, "iu"),
    new RegExp(`${DISPLAY_TOKEN_START}AIza[a-z\\d_-]{20,}${DISPLAY_TOKEN_END}`, "iu"),
    new RegExp(`${DISPLAY_TOKEN_START}(?:AKIA|ASIA)[A-Z\\d]{16}${DISPLAY_TOKEN_END}`, "u"),
    new RegExp(`${DISPLAY_TOKEN_START}eyJ[a-z\\d_-]{7,}\\.[a-z\\d_-]{10,}\\.[a-z\\d_-]{10,}${DISPLAY_TOKEN_END}`, "iu"),
] as const;

const EMBEDDED_BEARER_CREDENTIAL_PATTERN = new RegExp(`${DISPLAY_TOKEN_START}bearer\\s+\\S+`, "iu");
const EMBEDDED_STORAGE_LOCATOR_PATTERN = new RegExp(
    `${DISPLAY_TOKEN_START}(?:data|blob|file|image|video|audio|storage):[^\\s<>"']+`,
    "iu",
);
const EMBEDDED_SCHEME_URL_PATTERN = new RegExp(
    `${DISPLAY_TOKEN_START}(?:[a-z][a-z\\d+.-]*:\\/\\/|www\\.)[^\\s<>"']+`,
    "iu",
);
const EMBEDDED_NETWORK_LOCATOR_PATTERN = new RegExp(
    `${DISPLAY_TOKEN_START}(?:localhost|\\d{1,3}(?:\\.\\d{1,3}){3}|\\[[\\da-f:]+\\]|(?:[\\p{L}\\d-]+\\.)+[\\p{L}]{2,})(?::\\d+)?(?:[/?#][^\\s<>"']*)?(?=$|[^\\p{L}\\d.-])`,
    "iu",
);
const BARE_PROVIDER_HOSTNAME_PATTERN = /^(?:[\p{L}\d](?:[\p{L}\d-]{0,61}[\p{L}\d])?\.)+[\p{L}]{2,63}$/iu;

function isBareProviderHostname(value: string) {
    return BARE_PROVIDER_HOSTNAME_PATTERN.test(value);
}

function isUnknownHighEntropyCredential(value: string) {
    const standardBase64Segments = (value.match(/[a-z\d+/=]{32,}/giu) || [])
        .filter((segment) => /[+/=]/u.test(segment));
    const opaqueSegments = new Set([
        ...standardBase64Segments,
        ...(value.match(/[a-z\d_-]{32,}/giu) || []),
    ]);
    return [...opaqueSegments].some(isOpaqueCredentialSegment);
}

function isOpaqueCredentialSegment(segment: string) {
    const compactValue = segment.replace(/[-_]/gu, "");
    if (compactValue.length < 32) return false;
    if (/^[a-f\d]{32,}$/iu.test(compactValue) && /[a-f]/iu.test(compactValue) && /\d/u.test(compactValue)) return true;
    if (!/[a-z]/u.test(compactValue) || !/[A-Z]/u.test(compactValue) || !/\d/u.test(compactValue)) return false;
    if (hasSemanticIdentifierPrefix(segment)) return false;
    return shannonEntropy(compactValue) >= 4.5;
}

function hasSemanticIdentifierPrefix(value: string) {
    const parts = value.split(/[-_]+/u).filter(Boolean);
    let readablePrefixParts = 0;
    let hasReadableWord = false;
    for (const part of parts) {
        const isReadableWord = /^(?=.*[a-z])[a-z\d]{2,32}$/u.test(part);
        const isNumericVersionPart = readablePrefixParts > 0 && /^\d{1,8}$/u.test(part);
        if (!isReadableWord && !isNumericVersionPart) break;
        readablePrefixParts += 1;
        hasReadableWord ||= isReadableWord;
    }
    return hasReadableWord && readablePrefixParts >= 2;
}

function containsConfiguredCredential(label: string, credential: unknown) {
    const configuredValue = typeof credential === "string" ? credential.trim() : "";
    if (!configuredValue) return false;

    let startIndex = 0;
    while (startIndex <= label.length - configuredValue.length) {
        const matchIndex = label.indexOf(configuredValue, startIndex);
        if (matchIndex < 0) return false;
        const before = matchIndex > 0 ? label[matchIndex - 1] : "";
        const afterIndex = matchIndex + configuredValue.length;
        const after = afterIndex < label.length ? label[afterIndex] : "";
        if (!isAsciiAlphaNumeric(before) && !isAsciiAlphaNumeric(after)) return true;
        startIndex = matchIndex + 1;
    }
    return false;
}

function isAsciiAlphaNumeric(value: string) {
    return Boolean(value) && /[a-z\d]/iu.test(value);
}

function shannonEntropy(value: string) {
    const frequencies = new Map<string, number>();
    for (const character of value) frequencies.set(character, (frequencies.get(character) || 0) + 1);
    let entropy = 0;
    for (const frequency of frequencies.values()) {
        const probability = frequency / value.length;
        entropy -= probability * Math.log2(probability);
    }
    return entropy;
}

function isServerInjectedRelay(provider: Pick<ApiRelayProvider, "baseUrl">) {
    try {
        return new URL(provider.baseUrl).hostname.toLowerCase() === "api.x.ai";
    } catch {
        return false;
    }
}

function providerHasUsableCredential(provider: Pick<ApiRelayProvider, "apiKey" | "apiKeys" | "baseUrl">) {
    return hasProviderCredential(normalizeProviderCredentials(provider.apiKey, provider.apiKeys))
        || isServerInjectedRelay(provider);
}

function providerCanRunCapability(provider: ApiRelayProvider, capability: ApiCapability) {
    return provider.enabled
        && provider.capabilities.includes(capability)
        && Boolean(provider.baseUrl.trim())
        && providerHasUsableCredential(provider);
}

function canonicalProviderModel(provider: ApiRelayProvider, capability: ApiCapability, model: string) {
    return resolveConfiguredModel(model, providerModelsForCapability(provider, capability));
}

/**
 * Build global picker options without collapsing equal model IDs owned by
 * different providers. Provider-local selectors should continue using their
 * existing bare-string model lists instead of this function.
 */
export function enabledRelayModelOptionsForCapability(
    providers: readonly ApiRelayProvider[],
    capability: ApiCapability,
): ProviderModelOption[] {
    const options: ProviderModelOption[] = [];
    for (const provider of providers || []) {
        if (!provider?.id) continue;
        if (!providerCanRunCapability(provider, capability)) continue;
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

function isProviderModelSelection(value: unknown): value is ProviderModelSelection {
    return Boolean(value && typeof value === "object" && "providerId" in value && "model" in value);
}

/**
 * Resolve either a provider-qualified selection or a legacy model-only value.
 * Legacy values are intentionally strict: only one runnable owner can be
 * selected automatically; duplicate owners remain ambiguous.
 */
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
    if (owners.length === 1) {
        const provider = owners[0];
        return {
            status: "resolved",
            selection: { providerId: provider.id, model: canonicalModels.get(provider.id) || model },
            provider,
        };
    }
    if (owners.length > 1) return { status: "ambiguous", selection: null, model, owners };
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
            if (!provider.baseUrl.trim()) return new Error(`请为${label}中转填写 Base URL`);
            if (!providerHasUsableCredential(provider)) return new Error(`请为${label}中转填写 API Key`);
            return new Error(`${label}模型“${resolution.model}”不在所选中转模型列表中，已阻止请求`);
        }
        return new Error(`${explicit ? `显式${label}` : label}模型“${resolution.model}”没有可用中转，已阻止请求`);
    }
    return new Error(`请为${label}选择模型`);
}

/** Resolve a provider-qualified pair into the common request route shape. */
export function resolveProviderModelRoute(
    config: RelayCompatibleConfig,
    capability: ApiCapability,
    requested: ProviderModelSelection | string,
): ResolvedCapabilityRoute {
    const resolution = resolveProviderModelSelection(config, capability, requested);
    if (resolution.status !== "resolved") throw providerModelResolutionError(resolution, API_CAPABILITY_LABELS[capability], capability);
    return { provider: resolution.provider, capability, model: resolution.selection.model };
}

/**
 * Resolve a board route selection without guessing a provider or model from
 * global array order. The model remains empty until the user selects it.
 */
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

export function resolveConfiguredModel(model: string, configuredModels: readonly string[]) {
    const requested = String(model || "").trim();
    if (!requested) return "";

    const exactMatch = configuredModels.find((configuredModel) => String(configuredModel || "").trim() === requested);
    if (exactMatch) return String(exactMatch).trim();

    const matchKey = normalizeModelMatchKey(requested);
    const aliasMatches = configuredModels
        .map((configuredModel) => String(configuredModel || "").trim())
        .filter((configuredModel) => configuredModel && normalizeModelMatchKey(configuredModel) === matchKey);
    return aliasMatches.length === 1 ? aliasMatches[0] : "";
}

export function modelMatchesAllowedModel(model: string, allowedModels: readonly string[]) {
    return Boolean(resolveConfiguredModel(model, allowedModels));
}

function normalizeModelMatchKey(model: string) {
    return String(model || "")
        .trim()
        .toLowerCase()
        .replace(/[._]+/g, "-")
        .replace(/-+/g, "-");
}

function imageCapabilityProfileEntry(
    profiles: Record<string, ImageCapabilityProfileSelection>,
    model: string,
): { key: string; selection: ImageCapabilityProfileSelection } | undefined {
    if (Object.prototype.hasOwnProperty.call(profiles, model)) {
        return { key: model, selection: profiles[model] };
    }
    const modelKey = normalizeModelMatchKey(model);
    const matchedKey = Object.keys(profiles).find(
        (candidate) => candidate !== "*" && normalizeModelMatchKey(candidate) === modelKey,
    );
    return matchedKey ? { key: matchedKey, selection: profiles[matchedKey] } : undefined;
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
    const provider = explicitRoute?.provider || configuredProvider;

    if (!provider) {
        if (route.providerId) throw new Error(`未找到${label}中转 API，请重新选择`);
        throw new Error(`未配置${label}中转 API，请到设置中添加`);
    }
    if (!provider.enabled) throw new Error(`当前选择的${label}中转已停用`);
    if (!provider.capabilities.includes(capability)) throw new Error(`当前中转不支持${label}生成`);
    if (!provider.baseUrl.trim()) throw new Error(`请为${label}中转填写 Base URL`);
    if (!providerHasUsableCredential(provider)) throw new Error(`请为${label}中转填写 API Key`);

    const models = providerModelsForCapability(provider, capability);
    const model = explicitRoute?.model || route.model.trim();

    if (!model) throw new Error(`请为${label}中转选择模型`);
    if (!normalized.apiRelayAdvanced.allowCustomModel && models.length && !models.includes(model)) throw new Error(`${label}模型不在当前中转模型列表中`);

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

    const provider = explicitRoute?.provider || configuredProvider;
    if (!provider) throw new Error(`未找到${boardLabel}板块中转 API，请重新选择`);
    if (!provider.enabled) throw new Error(`当前选择的${boardLabel}板块中转已停用`);
    if (!provider.capabilities.includes(definition.capability)) throw new Error(`当前中转不支持${boardLabel}所需的${capabilityLabel}能力`);
    if (!provider.baseUrl.trim()) throw new Error(`请为${boardLabel}板块中转填写 Base URL`);
    if (!providerHasUsableCredential(provider)) throw new Error(`请为${boardLabel}板块中转填写 API Key`);

    const models = providerModelsForCapability(provider, definition.capability);
    const model = explicitRoute?.model || route.model.trim();

    if (!model) throw new Error(`请为${boardLabel}板块中转选择模型`);
    if (!normalized.apiRelayAdvanced.allowCustomModel && models.length && !models.includes(model)) throw new Error(`${boardLabel}板块模型不在当前中转模型列表中`);

    return { provider, capability: definition.capability, model };
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
    if (owners.length === 1) {
        return {
            provider: owners[0],
            model: canonicalProviderModel(owners[0], capability, model) || model,
        };
    }
    if (!owners.length) throw new Error(`显式${routeLabel}模型“${model}”没有可用中转，已阻止请求`);
    const ownerNames = owners.map((owner) => owner.name || owner.id).slice(0, 5).join("、");
    throw new Error(`显式${routeLabel}模型“${model}”由多个可用中转提供（${ownerNames}），无法确定路由，已阻止请求；请在模型选择器中改用「中转 · 模型」精确项`);
}

export function resolvePlatformBoardModel(config: RelayCompatibleConfig, boardKey: ApiBoardRouteKey, fallbackModel = "") {
    const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === boardKey);
    if (!definition) throw new Error(`未知平台板块模型：${boardKey}`);
    const normalized = ensureApiRelaySettings(config);
    const route = normalized.apiPlatformBoardRouting[boardKey] || defaultApiPlatformBoardModelRouting[boardKey];
    const customModel = route.mode === "custom" ? route.model.trim() : "";
    return customModel || fallbackModel.trim();
}

export function modelMatchesCapability(model: string, capability?: ApiCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ApiCapability) {
    return capability ? normalizeModelList(models).filter((model) => modelMatchesCapability(model, capability)) : normalizeModelList(models);
}

export function inferCapabilityFromModel(model: string): ApiCapability {
    if (isImageModelName(model)) return "image";
    if (isVideoModelName(model)) return "video";
    if (isAudioModelName(model)) return "audio";
    return "text";
}

export function shouldUsePlatformAccountPool(capability: ApiCapability, model: string) {
    return capability === "image" && model.trim().toLowerCase() === "gpt-image-2";
}

export function resolveApiRouteSource(route: Partial<ApiCapabilityRoute> | undefined): ApiRouteSource {
    if (route?.source === "platform" || route?.source === "localPool" || route?.source === "relay") return route.source;
    return String(route?.providerId || "").trim() ? "relay" : "platform";
}

export function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => String(model || "").trim()).filter(Boolean)));
}

/**
 * 把模型清单和各能力分类对齐。
 *
 * `inferUnassigned` 控制是否为「不在任何分类里」的模型按名字推断归属。
 * /models 发现必须保持 false：未知端点 ID 只能维持未分类，不能靠名称变成
 * 可路由媒体模型。它只保留给旧配置兼容和明确的本地输入迁移路径。
 */
export function reconcileApiRelayModelAssignments(
    models: string[],
    assignments: Partial<Pick<ApiRelayProvider, "textModels" | "imageModels" | "videoModels" | "audioModels">> = {},
    { inferUnassigned = false }: { inferUnassigned?: boolean } = {},
): Pick<ApiRelayProvider, "models" | "textModels" | "imageModels" | "videoModels" | "audioModels"> {
    const discoveredModels = normalizeModelList(models);
    const available = new Set(discoveredModels);
    const takeAssigned = (values: string[] | undefined) =>
        normalizeModelList(values || []).filter((model) => available.has(model));

    // Capability lists are deliberately independent: one model may be text,
    // image, video, and/or audio at the same time.
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
    const inferredTextModels = unassignedModels.filter((model) => !inferredCapabilityModels.has(model) && isTextModelName(model));

    return {
        models: discoveredModels,
        textModels: mergeModelLists(textModels, inferredTextModels),
        imageModels: mergeModelLists(imageModels, inferredImageModels),
        videoModels: mergeModelLists(videoModels, inferredVideoModels),
        audioModels: mergeModelLists(audioModels, inferredAudioModels),
    };
}

/** Apply one explicit capability classification without removing the model from other capability lists. */
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

export function normalizeApiKeyInput(value: string) {
    return normalizeProviderKeyInput(value);
}

export function mergeModelLists(...lists: string[][]) {
    return normalizeModelList(lists.flat());
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

        // A provider list can be temporarily incomplete while persisted state is
        // hydrating or being reconciled. Never destroy the saved route in that
        // state. A missing provider may be rebound only when the saved model
        // identifies exactly one runnable owner.
        if (savedProviderId && !savedProvider) {
            const matchingProviders = savedModel
                ? providers.filter(
                      (item) =>
                          item.enabled &&
                          Boolean(item.baseUrl.trim()) &&
                          hasProviderCredential(item) &&
                          item.capabilities.includes(capability) &&
                          modelBelongsToProvider(item, capability, savedModel),
                  )
                : [];
            const reboundProvider = matchingProviders.length === 1 ? matchingProviders[0] : undefined;
            routing[capability] = reboundProvider
                ? { source: "relay", providerId: reboundProvider.id, model: savedModel }
                : { source: "relay", providerId: savedProviderId, model: savedModel };
            return routing;
        }

        // Keep an explicit but incompatible route unresolved so the route
        // resolver can surface the real capability error to the UI. Clearing it
        // here would silently erase persisted user intent.
        if (savedProvider && !savedProvider.capabilities.includes(capability)) {
            routing[capability] = { source: "relay", providerId: savedProviderId, model: savedModel };
            return routing;
        }

        // A non-empty persisted model is explicit user state. Provider status
        // and catalog contents are validated by resolveCapabilityRoute; changing
        // the model here would hide the real disabled/removed-model error and
        // silently redirect the next request. Only an actually empty saved model
        // may use an exact legacy global model that still belongs to this provider.
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

function inferCapabilitiesFromModels(models: string[]): ApiCapability[] {
    const inferred = new Set<ApiCapability>();
    for (const model of models) inferred.add(inferCapabilityFromModel(model));
    return inferred.size ? API_CAPABILITIES.filter((capability) => inferred.has(capability)) : ["text"];
}

function normalizeCapabilities(capabilities: ApiCapability[]) {
    const values = new Set(capabilities.filter((capability): capability is ApiCapability => API_CAPABILITIES.includes(capability)));
    return API_CAPABILITIES.filter((capability) => values.has(capability));
}

function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("imagine") || isHappyHorseVideoModelName(value);
}

function isHappyHorseVideoModelName(model: string) {
    return model.trim().toLowerCase().includes("happyhorse");
}

function isLegacyGrokTextModelName(model: string) {
    const value = model.trim().toLowerCase();
    return value.startsWith("grok-") && !isVideoModelName(value) && !isImageModelName(value) && !isAudioModelName(value);
}

export function modelBelongsToProvider(provider: ApiRelayProvider, capability: ApiCapability, model?: string) {
    const cleanModel = String(model || "").trim();
    if (!cleanModel) return false;
    const models = providerModelsForCapability(provider, capability);
    return models.includes(cleanModel);
}

function isImageModelName(model: string) {
    const value = model.toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    if (isImageModelName(model) || isVideoModelName(model) || isAudioModelName(model)) return false;
    const value = model.trim().toLowerCase();
    return /(^|[/_.-])(gpt|chatgpt|claude|gemini|qwen|deepseek|llama|mistral|mixtral|command|grok|glm|kimi|minimax|doubao|ernie|yi|phi|o[134])([/_.-]|$)/u.test(value)
        || value.includes("chat")
        || value.includes("instruct")
        || value.includes("reasoning");
}
