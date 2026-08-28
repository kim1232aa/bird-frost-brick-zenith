import {
    createApiRelayProvider,
    type ApiBoardModelRouting,
    type ApiRelayAdvanced,
    type ApiRelayProvider,
    type ApiRelayRouting,
} from "@/stores/api-relay-config";
import { PRESET_RELAY_ENDPOINTS } from "@/stores/api-relay-presets";
import {
    parseProviderKeyText,
    providerCredentialPool,
    reconcileProviderCredentialPool,
} from "@/stores/provider-credentials";

export const RELAY_CONFIG_TRANSFER_KIND = "boundless-studio.relay-config";
export const RELAY_CONFIG_TRANSFER_VERSION = 1;

export type RelayKeyGroup = {
    baseUrl: string;
    keys: string[];
};

export type RelayConfigTransferEnvelope = {
    kind: typeof RELAY_CONFIG_TRANSFER_KIND;
    version: number;
    exportedAt: string;
    relays: ApiRelayProvider[];
    apiRouting?: ApiRelayRouting;
    apiBoardRouting?: ApiBoardModelRouting;
    apiRelayAdvanced?: Partial<ApiRelayAdvanced>;
};

export type ParsedRelayTransfer = {
    format: "bundle" | "envelope" | "config-store";
    groups: RelayKeyGroup[];
    envelope?: RelayConfigTransferEnvelope;
};

export type ApplyRelayTransferResult = {
    relays: ApiRelayProvider[];
    apiRouting?: ApiRelayRouting;
    apiBoardRouting?: ApiBoardModelRouting;
    apiRelayAdvanced?: Partial<ApiRelayAdvanced>;
    summary: {
        providersUpdated: number;
        providersCreated: number;
        keysAdded: number;
        unmatchedUrls: string[];
    };
};

const URL_RE = /https?:\/\/[^\s,，]+/giu;
const KEY_RE = /(?:sk-[A-Za-z0-9_-]{16,}|hf_[A-Za-z0-9]{16,}|ms-[A-Za-z0-9_-]{16,})/gu;

export function normalizeRelayBaseUrl(value: string) {
    return String(value || "")
        .trim()
        .replace(/\/+$/u, "");
}

export function parseRelayTransferText(text: string): ParsedRelayTransfer {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("粘贴内容是空的");

    if (raw.startsWith("{") || raw.startsWith("[")) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error("JSON 无法解析，请检查是否完整复制");
        }
        const envelope = readTransferEnvelope(parsed);
        if (envelope) {
            return {
                format: envelope.kind === RELAY_CONFIG_TRANSFER_KIND ? "envelope" : "config-store",
                groups: envelope.relays.map((relay) => ({
                    baseUrl: relay.baseUrl,
                    keys: providerCredentialPool(relay).keys,
                })),
                envelope,
            };
        }
        throw new Error("JSON 不是本应用的中转配置或密钥包");
    }

    return { format: "bundle", groups: parseKeyBundle(raw) };
}

export function applyParsedRelayTransfer(
    currentRelays: readonly ApiRelayProvider[],
    parsed: ParsedRelayTransfer,
    options: { enableOnImport?: boolean } = {},
): ApplyRelayTransferResult {
    const enableOnImport = options.enableOnImport !== false;
    let relays = currentRelays.map((relay) => ({ ...relay }));
    let providersUpdated = 0;
    let providersCreated = 0;
    let keysAdded = 0;
    const unmatchedUrls: string[] = [];

    if (parsed.envelope?.relays?.length) {
        for (const incoming of parsed.envelope.relays) {
            const applied = upsertRelay(relays, incoming, enableOnImport);
            relays = applied.relays;
            providersUpdated += applied.updated;
            providersCreated += applied.created;
            keysAdded += applied.keysAdded;
        }
    } else {
        for (const group of parsed.groups) {
            if (!group.keys.length) {
                unmatchedUrls.push(group.baseUrl);
                continue;
            }
            const incoming = relayDraftFromGroup(group);
            const applied = upsertRelay(relays, incoming, enableOnImport);
            relays = applied.relays;
            providersUpdated += applied.updated;
            providersCreated += applied.created;
            keysAdded += applied.keysAdded;
            if (!applied.updated && !applied.created) unmatchedUrls.push(group.baseUrl);
        }
    }

    return {
        relays,
        apiRouting: parsed.envelope?.apiRouting,
        apiBoardRouting: parsed.envelope?.apiBoardRouting,
        apiRelayAdvanced: parsed.envelope?.apiRelayAdvanced,
        summary: { providersUpdated, providersCreated, keysAdded, unmatchedUrls },
    };
}

export function serializeRelayKeyBundle(relays: readonly ApiRelayProvider[]) {
    const blocks: string[] = [];
    for (const relay of relays) {
        const keys = providerCredentialPool(relay).keys;
        const baseUrl = String(relay.baseUrl || "").trim();
        if (!baseUrl && !keys.length) continue;
        const header = baseUrl || `# ${relay.name || relay.id}`;
        blocks.push([header, ...keys].join("\n"));
    }
    return blocks.join("\n\n");
}

export function serializeRelayConfigEnvelope(input: {
    relays: readonly ApiRelayProvider[];
    apiRouting?: ApiRelayRouting;
    apiBoardRouting?: ApiBoardModelRouting;
    apiRelayAdvanced?: Partial<ApiRelayAdvanced>;
}): string {
    const envelope: RelayConfigTransferEnvelope = {
        kind: RELAY_CONFIG_TRANSFER_KIND,
        version: RELAY_CONFIG_TRANSFER_VERSION,
        exportedAt: new Date().toISOString(),
        relays: input.relays.map((relay) => ({ ...relay })),
        ...(input.apiRouting ? { apiRouting: input.apiRouting } : {}),
        ...(input.apiBoardRouting ? { apiBoardRouting: input.apiBoardRouting } : {}),
        ...(input.apiRelayAdvanced ? { apiRelayAdvanced: input.apiRelayAdvanced } : {}),
    };
    return `${JSON.stringify(envelope, null, 2)}\n`;
}

function parseKeyBundle(text: string): RelayKeyGroup[] {
    const groups: RelayKeyGroup[] = [];
    let current: RelayKeyGroup | undefined;

    const ensureGroup = (baseUrl: string) => {
        const normalized = normalizeRelayBaseUrl(baseUrl);
        const existing = groups.find((group) => normalizeRelayBaseUrl(group.baseUrl) === normalized);
        if (existing) {
            current = existing;
            return existing;
        }
        const created = { baseUrl: normalized, keys: [] as string[] };
        groups.push(created);
        current = created;
        return created;
    };

    for (const rawLine of text.split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const urls = line.match(URL_RE) || [];
        const keys = collectKeys(line);
        if (!urls.length && !keys.length) continue;

        if (urls.length) {
            const lastUrl = urls[urls.length - 1];
            // Keys that appear before the URL on the same line still belong to
            // the previous endpoint (user paste: "sk-xxx   https://next").
            if (keys.length && current) appendKeys(current, keys);
            ensureGroup(lastUrl);
            continue;
        }

        if (!current) ensureGroup("");
        if (current) appendKeys(current, keys);
    }

    return groups.filter((group) => group.baseUrl || group.keys.length);
}

function collectKeys(line: string) {
    const fromPattern = line.match(KEY_RE) || [];
    if (fromPattern.length) return fromPattern.map((value) => value.trim()).filter(Boolean);
    const stripped = line.replace(URL_RE, " ").trim();
    return parseProviderKeyText(stripped).filter((value) => looksLikeKey(value));
}

function looksLikeKey(value: string) {
    const input = String(value || "").trim();
    if (!input || URL_RE.test(input)) return false;
    URL_RE.lastIndex = 0;
    if (input.startsWith("http://") || input.startsWith("https://")) return false;
    if (/^sk-[A-Za-z0-9_-]{16,}$/u.test(input)) return true;
    if (/^hf_[A-Za-z0-9]{16,}$/u.test(input)) return true;
    return input.length >= 24 && /[A-Za-z]/u.test(input) && /\d/u.test(input);
}

function appendKeys(group: RelayKeyGroup, keys: string[]) {
    for (const key of keys) {
        if (!group.keys.includes(key)) group.keys.push(key);
    }
}

function relayDraftFromGroup(group: RelayKeyGroup): Partial<ApiRelayProvider> {
    const preset = matchPresetByBaseUrl(group.baseUrl);
    const [apiKey = "", ...apiKeys] = group.keys;
    return {
        ...(preset || {}),
        baseUrl: group.baseUrl || preset?.baseUrl || "",
        apiKey,
        ...(apiKeys.length ? { apiKeys } : {}),
        enabled: Boolean(group.keys.length),
    };
}

function matchPresetByBaseUrl(baseUrl: string) {
    const normalized = normalizeRelayBaseUrl(baseUrl);
    if (!normalized) return undefined;
    return PRESET_RELAY_ENDPOINTS.find(
        (preset) => normalizeRelayBaseUrl(String(preset.baseUrl || "")) === normalized,
    );
}

function upsertRelay(
    relays: ApiRelayProvider[],
    incoming: Partial<ApiRelayProvider>,
    enableOnImport: boolean,
) {
    const incomingKeys = providerCredentialPool({
        apiKey: incoming.apiKey || "",
        apiKeys: incoming.apiKeys,
    }).keys;
    const matchIndex = findRelayIndex(relays, incoming);
    if (matchIndex < 0) {
        if (!incoming.baseUrl && !incomingKeys.length) {
            return { relays, updated: 0, created: 0, keysAdded: 0 };
        }
        const created = createApiRelayProvider({
            ...incoming,
            enabled: enableOnImport && incomingKeys.length ? true : incoming.enabled === true,
        });
        return {
            relays: [...relays, created],
            updated: 0,
            created: 1,
            keysAdded: providerCredentialPool(created).keys.length,
        };
    }

    const current = relays[matchIndex];
    const mergedKeys = uniqueKeys([...providerCredentialPool(current).keys, ...incomingKeys]);
    const added = mergedKeys.length - providerCredentialPool(current).keys.length;
    const credentials = reconcileProviderCredentialPool(mergedKeys, current);
    const next: ApiRelayProvider = {
        ...current,
        ...credentials,
        updatedAt: new Date().toISOString(),
        ...(enableOnImport && mergedKeys.length ? { enabled: true } : {}),
        ...(incoming.adapterType && !current.adapterType ? { adapterType: incoming.adapterType } : {}),
        ...(incoming.baseUrl && !current.baseUrl ? { baseUrl: incoming.baseUrl } : {}),
    };
    const copy = relays.slice();
    copy[matchIndex] = next;
    return { relays: copy, updated: 1, created: 0, keysAdded: added };
}

function findRelayIndex(relays: readonly ApiRelayProvider[], incoming: Partial<ApiRelayProvider>) {
    const incomingId = String(incoming.id || "").trim();
    if (incomingId) {
        const byId = relays.findIndex((relay) => relay.id === incomingId);
        if (byId >= 0) return byId;
    }
    const incomingUrl = normalizeRelayBaseUrl(String(incoming.baseUrl || ""));
    if (!incomingUrl) return -1;
    return relays.findIndex((relay) => normalizeRelayBaseUrl(relay.baseUrl) === incomingUrl);
}

function uniqueKeys(values: readonly string[]) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function readTransferEnvelope(value: unknown): RelayConfigTransferEnvelope | undefined {
    if (!isRecord(value)) return undefined;

    if (value.kind === RELAY_CONFIG_TRANSFER_KIND && Array.isArray(value.relays)) {
        return {
            kind: RELAY_CONFIG_TRANSFER_KIND,
            version: Number(value.version) || RELAY_CONFIG_TRANSFER_VERSION,
            exportedAt: String(value.exportedAt || ""),
            relays: value.relays.filter(isRelayLike).map((relay) => createApiRelayProvider(relay)),
            ...(isRecord(value.apiRouting) ? { apiRouting: value.apiRouting as ApiRelayRouting } : {}),
            ...(isRecord(value.apiBoardRouting) ? { apiBoardRouting: value.apiBoardRouting as ApiBoardModelRouting } : {}),
            ...(isRecord(value.apiRelayAdvanced) ? { apiRelayAdvanced: value.apiRelayAdvanced as Partial<ApiRelayAdvanced> } : {}),
        };
    }

    const state = isRecord(value.state) ? value.state : value;
    const config = isRecord(state) && isRecord(state.config) ? state.config : isRecord(value.config) ? value.config : undefined;
    const relays = config && Array.isArray(config.apiRelays)
        ? config.apiRelays
        : Array.isArray(value.apiRelays)
            ? value.apiRelays
            : undefined;
    if (!relays) return undefined;
    return {
        kind: RELAY_CONFIG_TRANSFER_KIND,
        version: RELAY_CONFIG_TRANSFER_VERSION,
        exportedAt: "",
        relays: relays.filter(isRelayLike).map((relay) => createApiRelayProvider(relay)),
        ...(config && isRecord(config.apiRouting) ? { apiRouting: config.apiRouting as ApiRelayRouting } : {}),
        ...(config && isRecord(config.apiBoardRouting) ? { apiBoardRouting: config.apiBoardRouting as ApiBoardModelRouting } : {}),
        ...(config && isRecord(config.apiRelayAdvanced) ? { apiRelayAdvanced: config.apiRelayAdvanced as Partial<ApiRelayAdvanced> } : {}),
    };
}

function isRelayLike(value: unknown): value is Partial<ApiRelayProvider> {
    return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
