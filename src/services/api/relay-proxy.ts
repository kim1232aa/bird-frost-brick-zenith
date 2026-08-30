import { desktopApiUrl } from "@/services/desktop-api-url";
import type { RelayModelCatalogMetadataRecord } from "@/services/api/models-dev-catalog";
import {
    API_CAPABILITIES,
    normalizeModelList,
    reconcileApiRelayModelAssignments,
    type ApiRelayProvider,
} from "@/stores/api-relay-config";
import {
    buildAuthHeaders,
    rejectUnsupportedCustomRelayProxy,
} from "@/stores/api-relay-model-inference";

export { buildAuthHeaders } from "@/stores/api-relay-model-inference";

export const LOCAL_RELAY_PROXY_PREFIX = "/local-relay-proxy";
export const LOCAL_RELAY_BASE_URL_HEADER = "x-local-relay-base-url";
export const LOCAL_RELAY_PROXY_URL_HEADER = "x-local-relay-proxy-url";

// 多 Key 轮询游标：同一 providerId 的请求依次轮换 Key，避免单 Key 限流。
const relayKeyCursor = new Map<string, number>();

type RelayModelConfiguration = Pick<
    ApiRelayProvider,
    "models" | "textModels" | "imageModels" | "videoModels" | "audioModels" | "capabilities" | "modelCatalogMetadata"
>;

type RelayModelDiscoveryOptions = {
    /**
     * Legacy compatibility only. Model discovery is an additive observation:
     * callers must never use a transient or incomplete /models response to
     * remove a user's configured models or capability classifications.
     */
    replaceExisting?: boolean;
};

export function rotateRelayApiKey(provider: { id?: string; baseUrl: string; apiKey: string; apiKeys?: string[] }) {
    const keys = Array.from(
        new Set([provider.apiKey, ...(provider.apiKeys || [])].map((key) => String(key || "").trim()).filter(Boolean)),
    );
    if (!keys.length) return "";
    if (keys.length === 1) return keys[0];
    const cursorKey = provider.id || provider.baseUrl;
    const index = relayKeyCursor.get(cursorKey) ?? 0;
    relayKeyCursor.set(cursorKey, (index + 1) % keys.length);
    return keys[index % keys.length];
}

export function mergeDiscoveredRelayModels(
    provider: RelayModelConfiguration,
    discoveredModels: string[],
    catalogMetadata: RelayModelCatalogMetadataRecord = {},
    options: RelayModelDiscoveryOptions = {},
): RelayModelConfiguration {
    const normalizedDiscoveredModels = normalizeModelList(discoveredModels);
    if (!normalizedDiscoveredModels.length) {
        return {
            models: [...provider.models],
            textModels: [...provider.textModels],
            imageModels: [...provider.imageModels],
            videoModels: [...provider.videoModels],
            audioModels: [...provider.audioModels],
            capabilities: [...provider.capabilities],
            ...(provider.modelCatalogMetadata ? { modelCatalogMetadata: provider.modelCatalogMetadata } : {}),
        };
    }

    // `/models` is not an authoritative deletion feed. It may be partial,
    // filtered by a transient key entitlement, or omit manually configured
    // endpoint IDs. Keep every existing model and its explicit assignment;
    // removal remains an explicit user action in the settings UI.
    //
    // `replaceExisting` was shipped briefly and is deliberately ignored for
    // persisted callers so refreshing cannot silently discard working routes.
    void options.replaceExisting;
    const existingModels = normalizeModelList([
        ...provider.models,
        ...provider.textModels,
        ...provider.imageModels,
        ...provider.videoModels,
        ...provider.audioModels,
    ]);
    // Catalog metadata supplements every returned model without removing any
    // user assignment. A trusted model may report multiple output modalities.
    // IDs absent from models.dev intentionally remain unclassified: /models
    // names are not evidence that a media route is supported.
    const metadataAssignments = classifyDiscoveredModelsFromCatalog(normalizedDiscoveredModels, catalogMetadata);
    const assignments = reconcileApiRelayModelAssignments(
        normalizeModelList([...existingModels, ...normalizedDiscoveredModels]),
        {
            textModels: normalizeModelList([...provider.textModels, ...metadataAssignments.textModels]),
            imageModels: normalizeModelList([...provider.imageModels, ...metadataAssignments.imageModels]),
            videoModels: normalizeModelList([...provider.videoModels, ...metadataAssignments.videoModels]),
            audioModels: normalizeModelList([...provider.audioModels, ...metadataAssignments.audioModels]),
        },
    );

    const mergedMetadata = normalizeCatalogMetadataForModels(
        normalizeModelList([...existingModels, ...normalizedDiscoveredModels]),
        { ...(provider.modelCatalogMetadata || {}), ...catalogMetadata },
    );

    return {
        ...assignments,
        capabilities: API_CAPABILITIES.filter((capability) =>
            provider.capabilities.includes(capability) || assignments[`${capability}Models`].length > 0,
        ),
        ...(Object.keys(mergedMetadata).length ? { modelCatalogMetadata: mergedMetadata } : {}),
    };
}

function classifyDiscoveredModelsFromCatalog(models: string[], metadata: RelayModelCatalogMetadataRecord) {
    const assignments = { textModels: [] as string[], imageModels: [] as string[], videoModels: [] as string[], audioModels: [] as string[] };
    for (const model of models) {
        const output = new Set(metadata[model]?.outputModalities || []);
        for (const capability of API_CAPABILITIES) {
            if (output.has(capability)) assignments[`${capability}Models`].push(model);
        }
    }
    return assignments;
}

function normalizeCatalogMetadataForModels(models: string[], metadata: RelayModelCatalogMetadataRecord) {
    const available = new Set(models);
    return Object.fromEntries(Object.entries(metadata).filter(([model]) => available.has(model)));
}

export function buildLocalRelayProxyUrl(path: string) {
    return desktopApiUrl(`${LOCAL_RELAY_PROXY_PREFIX}/${path.replace(/^\/+/, "").replace(/\/+$/, "")}/`);
}

export function buildProviderProxyHeaders(provider: { proxyMode?: unknown; proxyUrl?: string }) {
    rejectUnsupportedCustomRelayProxy(provider.proxyMode);
    return {};
}

export function buildLocalRelayProxyHeaders(
    provider: {
        id?: string;
        baseUrl: string;
        apiKey: string;
        apiKeys?: string[];
        proxyMode?: unknown;
        proxyUrl?: string;
        authScheme?: "Bearer" | "Key" | "x-api-key";
    },
    contentType?: string,
    overrideKey?: string,
) {
    const effectiveKey = (overrideKey || rotateRelayApiKey(provider)).trim();
    let builtin: Record<string, string> = {};
    try {
        if (new URL(provider.baseUrl).hostname.toLowerCase() === "api.x.ai") {
            builtin = { "x-boundless-builtin": "xai" };
        }
    } catch {
        /* ignore */
    }
    return {
        [LOCAL_RELAY_BASE_URL_HEADER]: provider.baseUrl,
        ...buildProviderProxyHeaders(provider),
        ...buildAuthHeaders(effectiveKey, provider.authScheme),
        ...builtin,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export function resolveLocalRelayProxyTarget(baseUrl: string, pathParts: string[]) {
    const cleanPath = `/${pathParts.map((part) => encodeURIComponent(decodeURIComponent(part))).join("/")}`;
    return buildProxyTargetApiUrl(baseUrl, cleanPath);
}

function buildProxyTargetApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl.trim().replace(/\/+$/, ""));
    const catalogUrl = rewriteCivitaiCatalogProxyTarget(normalizedBaseUrl, path);
    if (catalogUrl) return catalogUrl;
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") || isCivitaiV2Base(normalizedBaseUrl)
        ? normalizedBaseUrl
        : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function rewriteCivitaiCatalogProxyTarget(baseUrl: string, path: string) {
    try {
        const url = new URL(baseUrl);
        const relayPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
        const lowerRelay = relayPath.toLowerCase();
        if (url.hostname.toLowerCase() !== "orchestration.civitai.com") return "";
        if (lowerRelay !== "services" && !lowerRelay.startsWith("services?")) return "";
        return "https://orchestration.civitai.com/v2/services";
    } catch {
        return "";
    }
}

function isCivitaiV2Base(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        return url.hostname.toLowerCase() === "orchestration.civitai.com" && url.pathname.replace(/\/+$/, "").toLowerCase() === "/v2";
    } catch {
        return false;
    }
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl: string) {
    const normalized = normalizeKnownSuffix(baseUrl, "/v1") || normalizeKnownSuffix(baseUrl, "/api/v3") || normalizeKnownSuffix(baseUrl, "/api/plan/v3") || baseUrl;
    // Align with Go relay.go:522-523: Civitai empty pathname defaults to /v2/consumer
    try {
        const url = new URL(normalized);
        if (url.hostname.toLowerCase() === "orchestration.civitai.com" && url.pathname.replace(/\/+$/, "") === "") {
            url.pathname = "/v2/consumer";
            return url.toString().replace(/\/+$/, "");
        }
    } catch {}
    return normalized;
}

function normalizeKnownSuffix(baseUrl: string, suffix: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        if (!lowerPath.endsWith(suffix)) return "";
        url.pathname = `${path.slice(0, path.length - suffix.length)}${suffix}`;
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return "";
    }
}
