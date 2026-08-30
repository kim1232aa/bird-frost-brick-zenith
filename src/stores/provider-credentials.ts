export type ProviderCredentials = {
    readonly apiKey: string;
    readonly apiKeys?: readonly string[];
    readonly hasApiKey?: boolean;
};

export type ProviderCredentialPoolSource = ProviderCredentials & {
    readonly apiKeyId?: string;
    readonly apiKeyIds?: readonly string[];
};

export type ReconciledProviderCredentialPool = {
    readonly apiKey: string;
    readonly apiKeyId?: string;
    readonly apiKeys?: string[];
    readonly apiKeyIds?: string[];
};

export function createProviderCredentialId() {
    const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
    return randomUUID
        ? `credential-${randomUUID()}`
        : `credential-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function reconcileProviderCredentialIds(
    keys: readonly string[],
    previousKeys: readonly string[] = [],
    previousIds: readonly string[] = [],
) {
    const previousByKey = new Map<string, string>();
    previousKeys.forEach((key, index) => {
        const normalizedKey = normalizeProviderKeyInput(key);
        const id = String(previousIds[index] || "").trim();
        if (normalizedKey && id && !previousByKey.has(normalizedKey)) previousByKey.set(normalizedKey, id);
    });
    return deduplicateKeys(keys).map((key) => previousByKey.get(key) || createProviderCredentialId());
}

/**
 * Presents legacy `apiKey` plus `apiKeys` as one ordered credential list.
 * The primary key wins when older data happens to contain the same value twice.
 */
export function providerCredentialPool(source: ProviderCredentialPoolSource) {
    const keys: string[] = [];
    const ids: string[] = [];
    const append = (value: string, id?: string) => {
        const key = normalizeProviderKeyInput(value);
        if (!key || keys.includes(key)) return;
        keys.push(key);
        ids.push(String(id || "").trim());
    };

    append(source.apiKey, source.apiKeyId);
    (source.apiKeys || []).forEach((key, index) => append(key, source.apiKeyIds?.[index]));
    return { keys, ids };
}

/**
 * Splits one ordered editor value back into the legacy-compatible primary key
 * plus rotation pool representation, retaining identifiers for unchanged keys.
 */
export function reconcileProviderCredentialPool(
    keys: readonly string[],
    previous: ProviderCredentialPoolSource,
): ReconciledProviderCredentialPool {
    const normalizedKeys = deduplicateKeys(keys);
    const previousPool = providerCredentialPool(previous);
    const ids = reconcileProviderCredentialIds(normalizedKeys, previousPool.keys, previousPool.ids);
    const [apiKey = "", ...apiKeys] = normalizedKeys;
    const [apiKeyId, ...apiKeyIds] = ids;

    return {
        apiKey,
        apiKeyId: apiKey ? apiKeyId : undefined,
        apiKeys: apiKeys.length ? apiKeys : undefined,
        apiKeyIds: apiKeyIds.length ? apiKeyIds : undefined,
    };
}

export function normalizeProviderKeyInput(value: string) {
    const input = String(value || "").trim();
    if (!input) return "";
    if (/^bearer\s+/i.test(input)) return input.replace(/^bearer\s+/i, "").trim();
    if (input.startsWith("{") && input.endsWith("}")) {
        try {
            const parsed: unknown = JSON.parse(input);
            if (isRecord(parsed)) {
                const key = parsed.OPENAI_API_KEY || parsed.apiKey || parsed.api_key || parsed.key;
                if (typeof key === "string" && key.trim()) return normalizeProviderKeyInput(key);
            }
        } catch {
            return input;
        }
    }
    return input;
}

export function parseProviderKeyText(value: string) {
    return deduplicateKeys(String(value || "").split(/[\n,，]+/));
}

export function normalizeProviderCredentials(apiKey: string, apiKeys?: readonly string[]): ProviderCredentials {
    const normalizedApiKey = normalizeProviderKeyInput(apiKey);
    const normalizedPool = deduplicateKeys(apiKeys || []);
    return {
        apiKey: normalizedApiKey,
        ...(normalizedPool.length ? { apiKeys: normalizedPool } : {}),
    };
}

export function hasProviderCredential(credentials: ProviderCredentials) {
    return Boolean(credentials.apiKey || credentials.apiKeys?.length || credentials.hasApiKey);
}

function deduplicateKeys(values: readonly string[]) {
    return [...new Set(values.map((value) => normalizeProviderKeyInput(value)).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
