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
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiKeyId?: string;
    apiKeys?: string[];
    apiKeyIds?: string[];
    adapterType?: string;
    proxyMode: ApiRelayProxyMode;
    proxyUrl: string;
    videoCapabilityProfiles?: Record<string, VideoCapabilityProfileId>;
    audioCapabilityProfiles?: Record<string, AudioCapabilityProfileId>;
    imageCapabilityProfiles?: Record<string, ImageCapabilityProfileSelection>;
    enabled: boolean;
    capabilities: ApiCapability[];
    models: string[];
    textModels: string[];
    imageModels: string[];
    videoModels: string[];
    audioModels: string[];
    modelCatalogMetadata?: RelayModelCatalogMetadataRecord;
    allowMatureContent?: boolean;
    civitaiMaturePolicyVersion?: number;
    timeoutOverrideMs?: number;
    timeoutMs: number;
    remark: string;
    createdAt: string;
    updatedAt: string;
    endpoints?: { chat?: string; images?: string; videosCreate?: string; videosPoll?: string; models?: string; test?: string };
    authScheme?: "Bearer" | "Key" | "x-api-key";
    protocol?: string;
};

export type ResolvedCapabilityRoute = { provider: ApiRelayProvider; capability: ApiCapability; model: string };
export type ProviderModelSelection = { providerId: string; model: string };
export type ProviderModelOption = ProviderModelSelection & { providerName: string; value: string; label: string };
export type ProviderModelResolution =
    | { status: "resolved"; selection: ProviderModelSelection; provider: ApiRelayProvider }
    | { status: "ambiguous"; selection: null; model: string; owners: ApiRelayProvider[] }
    | { status: "unavailable"; selection: null; model: string; owners: ApiRelayProvider[] }
    | { status: "empty"; selection: null; model: ""; owners: [] };

export function createApiRelayProvider(input: Partial<ApiRelayProvider> = {}): ApiRelayProvider {
    const now = input.createdAt || new Date().toISOString();
    return {
        id: input.id || `relay-${Date.now()}`,
        name: input.name || "中转 API",
        baseUrl: input.baseUrl || "",
        apiKey: input.apiKey || "",
        proxyMode: input.proxyMode === "custom" ? "custom" : "direct",
        proxyUrl: String(input.proxyUrl || "").trim(),
        enabled: input.enabled === true,
        capabilities: input.capabilities || ["text"],
        models: input.models || [],
        textModels: input.textModels || [],
        imageModels: input.imageModels || [],
        videoModels: input.videoModels || [],
        audioModels: input.audioModels || [],
        timeoutMs: input.timeoutMs || 360000,
        remark: input.remark || "",
        createdAt: now,
        updatedAt: input.updatedAt || now,
    };
}
