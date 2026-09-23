import { normalizeProviderKeyInput } from "./provider-credentials.ts";
import type { AudioCapabilityProfileId } from "../services/api/audio-model-capabilities.ts";
import type { ImageCapabilityProfileSelection } from "../services/api/image-model-capabilities.ts";
import type { VideoCapabilityProfileId } from "../services/api/video-model-capabilities.ts";
import type { RelayModelCatalogMetadataRecord } from "../services/api/models-dev-catalog.ts";
import {
    inferCapabilityFromModelName,
    isAudioModelName,
    isImageModelName,
    isTextModelName,
    isVideoModelName,
} from "./api-relay-model-inference.ts";

export {
    inferCapabilityFromModelName,
    isHappyHorseVideoModelName,
} from "./api-relay-model-inference.ts";

export type ApiCapability = "text" | "image" | "video" | "audio";
export type ApiRouteSource = "platform" | "localPool" | "relay";
export type ApiCapabilityRoute = { source?: ApiRouteSource; providerId: string; model: string };
export type ApiRelayRouting = Record<ApiCapability, ApiCapabilityRoute>;
export type ApiBoardRouteKey = "storyDirector" | "videoWorkflowText" | "imagePrompt" | "videoPrompt" | "imageGeneration" | "videoGeneration";
export type ApiBoardModelRoute = { mode: "inherit" | "custom"; providerId: string; model: string };
export type ApiBoardModelRouting = Record<ApiBoardRouteKey, ApiBoardModelRoute>;
export type ApiPlatformBoardModelRoute = { mode: "inherit" | "custom"; model: string };
export type ApiPlatformBoardModelRouting = Record<ApiBoardRouteKey, ApiPlatformBoardModelRoute>;
export type ApiRelayAdvanced = { allowCustomModel: boolean; defaultTimeoutMs: number; showDisabledProviders: boolean };
export type ApiRelayProxyMode = "direct" | "custom";
export type ApiRelayProvider = {
    id: string; name: string; baseUrl: string; apiKey: string; hasApiKey?: boolean; apiKeyId?: string;
    apiKeys?: string[]; apiKeyIds?: string[]; adapterType?: string;
    proxyMode: ApiRelayProxyMode; proxyUrl: string;
    runnableCapabilities?: ApiCapability[];
    videoCapabilityProfiles?: Record<string, VideoCapabilityProfileId>;
    audioCapabilityProfiles?: Record<string, AudioCapabilityProfileId>;
    imageCapabilityProfiles?: Record<string, ImageCapabilityProfileSelection>;
    enabled: boolean; capabilities: ApiCapability[];
    models: string[]; textModels: string[]; imageModels: string[]; videoModels: string[]; audioModels: string[];
    modelCatalogMetadata?: RelayModelCatalogMetadataRecord;
    allowMatureContent?: boolean; civitaiMaturePolicyVersion?: number;
    timeoutOverrideMs?: number; timeoutMs: number; remark: string;
    createdAt: string; updatedAt: string;
    endpoints?: { chat?: string; images?: string; videosCreate?: string; videosPoll?: string; audio?: string; models?: string; test?: string };
    authScheme?: "Bearer" | "Key" | "x-api-key"; protocol?: string;
};
export type ResolvedCapabilityRoute = { provider: ApiRelayProvider; capability: ApiCapability; model: string };
export type ProviderModelSelection = { providerId: string; model: string };
export type ProviderModelOption = ProviderModelSelection & { providerName: string; value: string; label: string };
export type ProviderModelResolution =
    | { status: "resolved"; selection: ProviderModelSelection; provider: ApiRelayProvider }
    | { status: "ambiguous"; selection: null; model: string; owners: ApiRelayProvider[] }
    | { status: "unavailable"; selection: null; model: string; owners: ApiRelayProvider[] }
    | { status: "empty"; selection: null; model: ""; owners: [] };
export type RelayCompatibleConfig = {
    channelMode?: "remote" | "local"; baseUrl?: string; apiKey?: string;
    model?: string; textModel?: string; imageModel?: string; videoModel?: string; audioModel?: string;
    models?: string[]; textModels?: string[]; imageModels?: string[]; videoModels?: string[]; audioModels?: string[];
    apiRelays?: ApiRelayProvider[];
    apiRouting?: Partial<ApiRelayRouting>;
    apiBoardRouting?: Partial<ApiBoardModelRouting>;
    apiPlatformBoardRouting?: Partial<ApiPlatformBoardModelRouting>;
    apiRelayAdvanced?: Partial<ApiRelayAdvanced>;
};
export const API_CAPABILITIES: ApiCapability[] = ["text", "image", "video", "audio"];
export const API_CAPABILITY_LABELS: Record<ApiCapability, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };
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
export const defaultApiRelayAdvanced: ApiRelayAdvanced = { allowCustomModel: false, defaultTimeoutMs: 360000, showDisabledProviders: false };
export function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => String(model || "").trim()).filter(Boolean)));
}
export function mergeModelLists(...lists: string[][]) { return normalizeModelList(lists.flat()); }
export function normalizeApiKeyInput(value: string) { return normalizeProviderKeyInput(value); }
export function isLegacyGrokTextModelName(model: string) {
    const value = model.trim().toLowerCase();
    return value.startsWith("grok-") && !isVideoModelName(value) && !isImageModelName(value) && !isAudioModelName(value);
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
    return inferCapabilityFromModelName(model);
}
export function inferCapabilitiesFromModels(models: string[]): ApiCapability[] {
    const inferred = new Set<ApiCapability>();
    for (const model of models) inferred.add(inferCapabilityFromModel(model));
    return inferred.size ? API_CAPABILITIES.filter((capability) => inferred.has(capability)) : ["text"];
}
export function normalizeCapabilities(capabilities: ApiCapability[]) {
    const values = new Set(capabilities.filter((capability): capability is ApiCapability => API_CAPABILITIES.includes(capability)));
    return API_CAPABILITIES.filter((capability) => values.has(capability));
}
export function providerCapabilityIsRunnable(
    provider: Pick<ApiRelayProvider, "runnableCapabilities">,
    capability: ApiCapability,
) {
    return !Array.isArray(provider.runnableCapabilities) || provider.runnableCapabilities.includes(capability);
}
export function shouldUsePlatformAccountPool(capability: ApiCapability, model: string) {
    return capability === "image" && model.trim().toLowerCase() === "gpt-image-2";
}
export function resolveApiRouteSource(route: Partial<ApiCapabilityRoute> | undefined): ApiRouteSource {
    if (route?.source === "platform" || route?.source === "localPool" || route?.source === "relay") return route.source;
    return String(route?.providerId || "").trim() ? "relay" : "platform";
}
export function providerModelsForCapability(provider: ApiRelayProvider, capability: ApiCapability) {
    const models = capability === "text" ? provider.textModels : capability === "image" ? provider.imageModels : capability === "video" ? provider.videoModels : provider.audioModels;
    return normalizeModelList(models || []);
}
export function providersForCapability(providers: ApiRelayProvider[], capability: ApiCapability, includeDisabled = false) {
    return providers.filter((provider) => (includeDisabled || provider.enabled) && provider.capabilities.includes(capability));
}
export function modelBelongsToProvider(provider: ApiRelayProvider, capability: ApiCapability, model?: string) {
    const cleanModel = String(model || "").trim();
    if (!cleanModel) return false;
    return modelMatchesAllowedModel(cleanModel, providerModelsForCapability(provider, capability));
}
function normalizeModelMatchKey(model: string) {
    return String(model || "").trim().toLowerCase().replace(/[._]+/g, "-").replace(/-+/g, "-");
}
export function resolveConfiguredModel(model: string, configuredModels: readonly string[]) {
    const requested = String(model || "").trim();
    if (!requested) return "";
    const exactMatch = configuredModels.find((configuredModel) => String(configuredModel || "").trim() === requested);
    if (exactMatch) return String(exactMatch).trim();
    const matchKey = normalizeModelMatchKey(requested);
    const aliasMatches = configuredModels.map((configuredModel) => String(configuredModel || "").trim()).filter((configuredModel) => configuredModel && normalizeModelMatchKey(configuredModel) === matchKey);
    return aliasMatches.length === 1 ? aliasMatches[0] : "";
}
export function modelMatchesAllowedModel(model: string, allowedModels: readonly string[]) {
    return Boolean(resolveConfiguredModel(model, allowedModels));
}
export function imageCapabilityProfileEntry(profiles: Record<string, ImageCapabilityProfileSelection>, model: string): { key: string; selection: ImageCapabilityProfileSelection } | undefined {
    if (Object.prototype.hasOwnProperty.call(profiles, model)) return { key: model, selection: profiles[model] };
    const modelKey = normalizeModelMatchKey(model);
    const matchedKey = Object.keys(profiles).find((candidate) => candidate !== "*" && normalizeModelMatchKey(candidate) === modelKey);
    return matchedKey ? { key: matchedKey, selection: profiles[matchedKey] } : undefined;
}
