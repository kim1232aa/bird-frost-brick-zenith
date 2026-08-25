export const MODELS_DEV_CATALOG_URL = "https://models.dev/api.json";

export type ModelsDevReasoningOption = {
    type: string;
    values?: string[];
    min?: number;
    max?: number;
};

export type RelayModelCatalogMetadata = {
    source: "models.dev";
    matchedBy: "exact" | "normalized";
    catalogId: string;
    outputModalities: string[];
    reasoning?: boolean;
    reasoningOptions?: ModelsDevReasoningOption[];
    status?: string;
    lastUpdated?: string;
};

export type RelayModelCatalogMetadataRecord = Record<string, RelayModelCatalogMetadata>;

type CatalogCandidate = Omit<RelayModelCatalogMetadata, "source" | "matchedBy">;
type CatalogIndex = {
    exact: Map<string, CatalogCandidate[]>;
    normalized: Map<string, CatalogCandidate[]>;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1_000;
let cachedCatalog: { expiresAt: number; index: CatalogIndex } | undefined;
let inFlightCatalog: Promise<CatalogIndex> | undefined;

export async function fetchModelsDevMetadataForModels(
    modelIds: readonly string[],
    options: {
        fetchImpl?: typeof fetch;
        timeoutMs?: number;
        ttlMs?: number;
        now?: () => number;
    } = {},
): Promise<RelayModelCatalogMetadataRecord> {
    const index = await fetchModelsDevCatalogIndex(options);
    return joinModelsDevMetadata(modelIds, index);
}

export function joinModelsDevMetadata(modelIds: readonly string[], catalog: unknown): RelayModelCatalogMetadataRecord {
    const index = isCatalogIndex(catalog) ? catalog : buildModelsDevCatalogIndex(catalog);
    const result: RelayModelCatalogMetadataRecord = {};
    for (const rawModelId of modelIds) {
        const modelId = String(rawModelId || "").trim();
        if (!modelId) continue;

        const exact = resolveExactCandidates(index.exact.get(modelId) || []);
        if (exact) {
            result[modelId] = { source: "models.dev", matchedBy: "exact", ...exact };
            continue;
        }

        const normalized = resolveNormalizedCandidates(index.normalized.get(normalizeCatalogModelId(modelId)) || []);
        if (normalized) result[modelId] = { source: "models.dev", matchedBy: "normalized", ...normalized };
    }
    return result;
}

export function normalizeModelsDevMetadataRecord(
    value: unknown,
    allowedModelIds?: readonly string[],
): RelayModelCatalogMetadataRecord | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const allowed = allowedModelIds ? new Set(allowedModelIds.map((model) => String(model || "").trim()).filter(Boolean)) : undefined;
    const result: RelayModelCatalogMetadataRecord = {};
    for (const [rawModelId, rawMetadata] of Object.entries(value as Record<string, unknown>)) {
        const modelId = rawModelId.trim();
        if (!modelId || (allowed && !allowed.has(modelId))) continue;
        const metadata = sanitizePersistedMetadata(rawMetadata);
        if (metadata) result[modelId] = metadata;
    }
    return Object.keys(result).length ? result : undefined;
}

export function summarizeModelsDevMetadata(modelIds: readonly string[], metadata: RelayModelCatalogMetadataRecord | undefined) {
    const models = Array.from(new Set(modelIds.map((model) => String(model || "").trim()).filter(Boolean)));
    const matched = models.filter((model) => Boolean(metadata?.[model])).length;
    return { matched, unverified: Math.max(0, models.length - matched) };
}

export function resetModelsDevCatalogCacheForTests() {
    cachedCatalog = undefined;
    inFlightCatalog = undefined;
}

async function fetchModelsDevCatalogIndex(options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    ttlMs?: number;
    now?: () => number;
}) {
    const now = options.now || Date.now;
    if (cachedCatalog && cachedCatalog.expiresAt > now()) return cachedCatalog.index;
    if (inFlightCatalog) return inFlightCatalog;

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("当前环境不支持读取 models.dev 模型元数据");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    inFlightCatalog = (async () => {
        try {
            const response = await fetchImpl(MODELS_DEV_CATALOG_URL, {
                method: "GET",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`models.dev 返回 HTTP ${response.status}`);
            const index = buildModelsDevCatalogIndex(await response.json());
            cachedCatalog = { expiresAt: now() + Math.max(1, options.ttlMs ?? DEFAULT_TTL_MS), index };
            return index;
        } finally {
            clearTimeout(timeout);
            inFlightCatalog = undefined;
        }
    })();
    return inFlightCatalog;
}

function buildModelsDevCatalogIndex(value: unknown): CatalogIndex {
    const index: CatalogIndex = { exact: new Map(), normalized: new Map() };
    if (!value || typeof value !== "object" || Array.isArray(value)) return index;
    for (const provider of Object.values(value as Record<string, unknown>)) {
        if (!provider || typeof provider !== "object" || Array.isArray(provider)) continue;
        const models = (provider as { models?: unknown }).models;
        if (!models || typeof models !== "object" || Array.isArray(models)) continue;
        for (const [recordId, rawModel] of Object.entries(models as Record<string, unknown>)) {
            const candidate = sanitizeCatalogCandidate(rawModel, recordId);
            if (!candidate) continue;
            appendCandidate(index.exact, candidate.catalogId, candidate);
            appendCandidate(index.normalized, normalizeCatalogModelId(candidate.catalogId), candidate);
        }
    }
    return index;
}

function sanitizeCatalogCandidate(value: unknown, fallbackId: string): CatalogCandidate | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const catalogId = String(record.id || fallbackId || "").trim();
    if (!catalogId) return undefined;
    const modalities = record.modalities && typeof record.modalities === "object" && !Array.isArray(record.modalities)
        ? (record.modalities as Record<string, unknown>).output
        : undefined;
    const outputModalities = normalizeStringArray(modalities);
    const reasoningOptions = sanitizeReasoningOptions(record.reasoning_options);
    const status = stringOrUndefined(record.status);
    const lastUpdated = stringOrUndefined(record.last_updated);
    return {
        catalogId,
        outputModalities,
        ...(typeof record.reasoning === "boolean" ? { reasoning: record.reasoning } : {}),
        ...(reasoningOptions.length ? { reasoningOptions } : {}),
        ...(status ? { status } : {}),
        ...(lastUpdated ? { lastUpdated } : {}),
    };
}

function sanitizePersistedMetadata(value: unknown): RelayModelCatalogMetadata | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (record.source !== "models.dev" || (record.matchedBy !== "exact" && record.matchedBy !== "normalized")) return undefined;
    const catalogId = stringOrUndefined(record.catalogId);
    if (!catalogId) return undefined;
    const reasoningOptions = sanitizeReasoningOptions(record.reasoningOptions);
    const status = stringOrUndefined(record.status);
    const lastUpdated = stringOrUndefined(record.lastUpdated);
    return {
        source: "models.dev",
        matchedBy: record.matchedBy,
        catalogId,
        outputModalities: normalizeStringArray(record.outputModalities),
        ...(typeof record.reasoning === "boolean" ? { reasoning: record.reasoning } : {}),
        ...(reasoningOptions.length ? { reasoningOptions } : {}),
        ...(status ? { status } : {}),
        ...(lastUpdated ? { lastUpdated } : {}),
    };
}

function sanitizeReasoningOptions(value: unknown): ModelsDevReasoningOption[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const type = stringOrUndefined(record.type);
        if (!type) return [];
        const values = normalizeStringArray(record.values);
        const min = finiteNumberOrUndefined(record.min);
        const max = finiteNumberOrUndefined(record.max);
        return [{ type, ...(values.length ? { values } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }];
    });
}

function resolveExactCandidates(candidates: CatalogCandidate[]) {
    if (!candidates.length) return undefined;
    const primaryOutputs = new Set(candidates.map((candidate) => primaryOutputCapability(candidate.outputModalities)));
    if (primaryOutputs.size !== 1 || primaryOutputs.has(undefined)) return undefined;

    const first = candidates[0];
    const outputModalities = Array.from(new Set(candidates.flatMap((candidate) => candidate.outputModalities)));
    const reasoning = commonValue(candidates.map((candidate) => candidate.reasoning));
    const reasoningOptions = commonJsonValue(candidates.map((candidate) => candidate.reasoningOptions));
    const status = commonValue(candidates.map((candidate) => candidate.status));
    const lastUpdated = commonValue(candidates.map((candidate) => candidate.lastUpdated));
    return {
        catalogId: first.catalogId,
        outputModalities,
        ...(typeof reasoning === "boolean" ? { reasoning } : {}),
        ...(reasoningOptions?.length ? { reasoningOptions } : {}),
        ...(typeof status === "string" ? { status } : {}),
        ...(typeof lastUpdated === "string" ? { lastUpdated } : {}),
    };
}

function resolveNormalizedCandidates(candidates: CatalogCandidate[]) {
    if (!candidates.length) return undefined;
    const catalogIds = new Set(candidates.map((candidate) => candidate.catalogId));
    if (catalogIds.size !== 1) return undefined;
    return resolveExactCandidates(candidates);
}

function primaryOutputCapability(modalities: readonly string[]) {
    const output = new Set(modalities);
    if (output.has("video")) return "video";
    if (output.has("image")) return "image";
    if (output.has("audio")) return "audio";
    if (output.has("text")) return "text";
    return undefined;
}

function commonValue<T>(values: readonly (T | undefined)[]) {
    const first = values[0];
    return values.every((value) => Object.is(value, first)) ? first : undefined;
}

function commonJsonValue<T>(values: readonly (T | undefined)[]) {
    const first = values[0];
    const signature = JSON.stringify(first);
    return values.every((value) => JSON.stringify(value) === signature) ? first : undefined;
}

function appendCandidate(map: Map<string, CatalogCandidate[]>, key: string, candidate: CatalogCandidate) {
    if (!key) return;
    const current = map.get(key);
    if (current) current.push(candidate);
    else map.set(key, [candidate]);
}

function normalizeCatalogModelId(value: string) {
    return value.trim().toLowerCase().replace(/[._]+/g, "-").replace(/-+/g, "-");
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)));
}

function stringOrUndefined(value: unknown) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized || undefined;
}

function finiteNumberOrUndefined(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isCatalogIndex(value: unknown): value is CatalogIndex {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<CatalogIndex>;
    return record.exact instanceof Map && record.normalized instanceof Map;
}
