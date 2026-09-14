import { desktopApiUrl } from "@/services/desktop-api-url";
import type { RelayModelCatalogMetadataRecord } from "@/services/api/models-dev-catalog";
import {
    API_CAPABILITIES,
    normalizeModelList,
    reconcileApiRelayModelAssignments,
    type ApiRelayProvider,
} from "@/stores/api-relay-config";
import { rejectUnsupportedCustomRelayProxy } from "@/stores/api-relay-model-inference";
import { normalizeProviderKeyInput, orderedProviderCredentialIds } from "@/stores/provider-credentials";

export { buildAuthHeaders } from "@/stores/api-relay-model-inference";

export const LOCAL_RELAY_PROXY_PREFIX = "/local-relay-proxy";
export const LOCAL_RELAY_BASE_URL_HEADER = "x-local-relay-base-url";
export const LOCAL_RELAY_PROXY_URL_HEADER = "x-local-relay-proxy-url";
// Fixed control header: selects one server-vault credential and is stripped before upstream forwarding.
export const LOCAL_RELAY_CREDENTIAL_ID_HEADER = "x-boundless-relay-credential-id";

// Legacy raw-key rotation is retained only for callers that still need a key in memory.
const relayKeyCursor = new Map<string, number>();
// Browser-safe callers rotate opaque identities, never raw credential values.
const relayCredentialCursor = new Map<string, number>();

type RelayCredentialProvider = {
    id?: string;
    baseUrl?: string;
    apiKey?: string;
    apiKeys?: readonly string[];
    apiKeyId?: string;
    apiKeyIds?: readonly string[];
    hasApiKey?: boolean;
};

type RelayCredentialSlot = { key: string; id: string };

function rawCredentialSlots(provider: RelayCredentialProvider): RelayCredentialSlot[] {
    const seen = new Set<string>();
    const slots: RelayCredentialSlot[] = [];
    const append = (value: unknown, suppliedId: unknown) => {
        const key = normalizeProviderKeyInput(String(value || ""));
        if (!key || seen.has(key)) return;
        seen.add(key);
        slots.push({ key, id: String(suppliedId || "").trim() });
    };
    append(provider.apiKey, provider.apiKeyId);
    const pool = Array.isArray(provider.apiKeys) ? provider.apiKeys : [];
    const poolIds = Array.isArray(provider.apiKeyIds) ? provider.apiKeyIds : [];
    pool.forEach((value, index) => append(value, poolIds[index]));
    return slots;
}

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

/** Returns a raw key only when a raw key is actually present. */
export function rotateRelayApiKey<T extends RelayCredentialProvider & { baseUrl: string; apiKey?: string }>(provider: T) {
    const keys = rawCredentialSlots(provider).map((slot) => slot.key);
    if (!keys.length) return "";
    if (keys.length === 1) return keys[0];
    const cursorKey = provider.id || provider.baseUrl;
    const index = relayKeyCursor.get(cursorKey) ?? 0;
    relayKeyCursor.set(cursorKey, (index + 1) % keys.length);
    return keys[index % keys.length];
}

/** Rotates only the ordered opaque IDs, including IDs from redacted state. */
export function rotateRelayCredentialId<T extends RelayCredentialProvider>(provider: T) {
    const ids = orderedProviderCredentialIds(provider);
    if (!ids.length) return "";
    if (ids.length === 1) return ids[0];
    const cursorKey = provider.id || provider.baseUrl || "relay";
    const index = relayCredentialCursor.get(cursorKey) ?? 0;
    relayCredentialCursor.set(cursorKey, (index + 1) % ids.length);
    return ids[index % ids.length];
}

/** Resolves a known opaque ID or maps a legacy raw override to its ID. */
export function resolveRelayCredentialId<T extends RelayCredentialProvider>(provider: T, requested?: string) {
    const value = String(requested || "").trim();
    const ids = orderedProviderCredentialIds(provider);
    if (!value) return rotateRelayCredentialId(provider);
    if (ids.includes(value)) return value;
    const normalizedRaw = normalizeProviderKeyInput(value);
    const slot = rawCredentialSlots(provider).find((candidate) => candidate.key === value || candidate.key === normalizedRaw);
    return slot?.id && ids.includes(slot.id) ? slot.id : "";
}

export type SelectedRelayCredential = {
    readonly apiKey: string;
    readonly credentialId: string;
};

/** Selects one relay slot exactly once; callers must reuse both values. */
export function selectRelayCredential<T extends RelayCredentialProvider & { baseUrl: string; apiKey?: string }>(provider: T): SelectedRelayCredential {
    const apiKey = rotateRelayApiKey(provider);
    return {
        apiKey,
        credentialId: apiKey ? resolveRelayCredentialId(provider, apiKey) : rotateRelayCredentialId(provider),
    };
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
    provider: RelayCredentialProvider & {
        baseUrl: string;
        apiKey?: string;
        proxyMode?: unknown;
        proxyUrl?: string;
        authScheme?: "Bearer" | "Key" | "x-api-key";
        /** Opt in to sending the base URL as a same-origin-only routing hint. */
        baseUrlHint?: boolean;
    },
    contentType?: string,
    /** Legacy callers may pass a raw key here; it is mapped to an opaque ID or ignored. */
    _overrideKey?: string,
    /** Explicit opaque credential identity for the server-vault lookup. */
    credentialId?: string,
) {
    const relayId = String(provider.id || "").trim();
    let builtin: Record<string, string> = {};
    try {
        if (new URL(provider.baseUrl).hostname.toLowerCase() === "api.x.ai") {
            builtin = { "x-boundless-builtin": "xai" };
        }
    } catch {
        /* ignore */
    }
    if (!relayId && !builtin["x-boundless-builtin"]) {
        throw new Error("普通中转请求缺少稳定 relay-id（Provider ID）");
    }

    const rawOverride = String(_overrideKey || "").trim();
    const explicitCredentialId = String(credentialId || "").trim();
    let selectedCredentialId = "";
    if (explicitCredentialId) {
        const resolved = resolveRelayCredentialId(provider, explicitCredentialId);
        // A fourth-argument value is an identity contract. Preserve an
        // unknown opaque value so the server can fail closed; never echo a
        // value that is known to be a raw credential.
        const normalizedExplicitRaw = normalizeProviderKeyInput(explicitCredentialId);
        selectedCredentialId = resolved ||
            (rawCredentialSlots(provider).some((slot) => slot.key === explicitCredentialId || slot.key === normalizedExplicitRaw) ? "" : explicitCredentialId);
    } else if (rawOverride) {
        selectedCredentialId = resolveRelayCredentialId(provider, rawOverride);
    } else {
        selectedCredentialId = rotateRelayCredentialId(provider);
    }

    return {
        // Sent for builtin channels, or when the caller explicitly opts in via
        // `baseUrlHint` (e.g. the Hugging Face router's per-provider bases).
        // The server ignores it unless it stays on the vault-configured
        // origin, so the vault key can never leak cross-host.
        ...(builtin["x-boundless-builtin"] || provider.baseUrlHint
            ? { [LOCAL_RELAY_BASE_URL_HEADER]: provider.baseUrl }
            : {}),
        ...(relayId ? { "x-boundless-relay-id": relayId } : {}),
        ...(relayId && !builtin["x-boundless-builtin"] && selectedCredentialId
            ? { [LOCAL_RELAY_CREDENTIAL_ID_HEADER]: selectedCredentialId }
            : {}),
        ...buildProviderProxyHeaders(provider),
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
    } catch {
        // Keep the original value when it is not a parseable URL.
    }
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
