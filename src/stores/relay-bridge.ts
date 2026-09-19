/**
 * Bridge between the two provider lists that historically drifted apart:
 *
 *  - `useStudioSession.relays`   （接线页 / studio 目录 / liveCatalog 选择器）
 *  - `useConfigStore.config.apiRelays` （中转设置对话框 / 画布生成路由）
 *
 * Both stores keep the same `ApiRelayProvider` shape. This module lets each
 * side publish its list whenever it changes and applies the other side's
 * list as a union merge keyed by provider id. A re-entrancy flag breaks
 * update loops, and raw API keys never cross the bridge — only the
 * `hasApiKey` marker — so a pending browser-side credential in one store can
 * not be overwritten or leaked by the other.
 */
import type { ApiRelayProvider } from "./api-relay-config.ts";

export type RelayBridgeSource = "session" | "config";

type RelayBridgeListener = (relays: ApiRelayProvider[], source: RelayBridgeSource) => void;

let pushing = false;
let listeners: Set<RelayBridgeListener> | undefined;

function getListeners() {
    if (!listeners) listeners = new Set<RelayBridgeListener>();
    return listeners;
}

export function publishRelayProviders(relays: ApiRelayProvider[], source: RelayBridgeSource) {
    if (pushing) return;
    pushing = true;
    try {
        for (const listener of getListeners()) listener(relays, source);
    } finally {
        pushing = false;
    }
}

export function subscribeRelayProviders(listener: RelayBridgeListener) {
    getListeners().add(listener);
    return () => {
        getListeners().delete(listener);
    };
}

function hasStoredCredential(item: ApiRelayProvider) {
    return Boolean(
        item.hasApiKey
        || (typeof item.apiKey === "string" && item.apiKey.trim())
        || item.apiKeys?.some((key) => typeof key === "string" && key.trim())
        || item.apiKeyId
        || item.apiKeyIds?.length,
    );
}

/** Fields the bridge copies from the incoming entry. Raw keys stay local. */
function bridgedPatch(incoming: ApiRelayProvider): Partial<ApiRelayProvider> {
    const { apiKey: _apiKey, apiKeys: _apiKeys, ...rest } = incoming;
    return { ...rest, apiKey: "", apiKeys: undefined, hasApiKey: hasStoredCredential(incoming) };
}

function sameRelayList(a: ApiRelayProvider[], b: ApiRelayProvider[]) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Union-merge `incoming` into `base` by provider id. Incoming fields win for
 * entries present on both sides, except a pending raw key already in `base`
 * is preserved. Entries only in `incoming` are appended (credential markers
 * carried, raw keys stripped). Entries only in `base` are kept — the bridge
 * never deletes, removal stays an explicit per-UI action.
 */
export function mergeRelayProviderLists(
    base: ApiRelayProvider[],
    incoming: ApiRelayProvider[],
): ApiRelayProvider[] {
    if (!incoming.length) return base;
    const byId = new Map(base.map((item) => [item.id, item]));
    let changed = false;
    const merged = base.map((item) => {
        const next = incoming.find((candidate) => candidate.id === item.id);
        if (!next) return item;
        const keepRawKey = typeof item.apiKey === "string" && item.apiKey.trim() ? item.apiKey : "";
        const mergedEntry: ApiRelayProvider = {
            ...item,
            ...bridgedPatch(next),
            apiKey: keepRawKey,
            apiKeys: keepRawKey ? undefined : item.apiKeys,
            hasApiKey: hasStoredCredential(next) || hasStoredCredential(item),
        };
        if (JSON.stringify(mergedEntry) !== JSON.stringify(item)) changed = true;
        return mergedEntry;
    });
    const additions = incoming
        .filter((candidate) => !byId.has(candidate.id))
        .map((candidate) => ({ ...candidate, ...bridgedPatch(candidate) }) as ApiRelayProvider);
    if (additions.length) changed = true;
    const result = additions.length ? merged.concat(additions) : merged;
    if (!changed && sameRelayList(result, base)) return base;
    return result;
}
