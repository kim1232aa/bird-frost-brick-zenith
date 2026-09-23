import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

import { getStrictLocalForageItem } from "@/lib/localforage-storage";
import { browserConfigFallbackAction, browserSafeConfigEnvelope } from "@/lib/config-secret-redaction";

export const CONFIG_RECOVERY_SUFFIX = ":recovery";

let configWriteQueue: Promise<void> = Promise.resolve();
const pendingConfigSnapshots = new Map<string, string>();

function recoveryKey(name: string) {
    return `${name}${CONFIG_RECOVERY_SUFFIX}`;
}

export const recoverableConfigStorage: StateStorage = {
    async getItem(name) {
        // 优先读取本地持久化与恢复副本
        const recovered = await readRecoveryValue(name);
        const restoredRecovery = await restoreBrowserConfigCandidate(name, recovered, false);
        if (restoredRecovery) return restoredRecovery;

        let primaryError: unknown;
        try {
            const primary = await getStrictLocalForageItem(name);
            const restored = await restoreBrowserConfigCandidate(name, primary, false);
            if (restored) return restored;
        } catch (error) {
            primaryError = error;
        }

        if (primaryError) throw primaryError;
        return null;
    },

    setItem(name, value) {
        pendingConfigSnapshots.set(name, value);
        return enqueueConfigWrite(async () => {
            const browserValue = browserSafeConfigEnvelope(value);
            await writeBrowserRecovery(name, browserValue);
            await writeBrowserPrimary(name, browserValue);

            // 同步提交至真实 Web 服务端凭据库 /client-api/config-vault
            if (typeof window !== "undefined" && typeof fetch === "function") {
                try {
                    const parsed = JSON.parse(value) as { state?: { config?: any } };
                    const cfg = parsed?.state?.config;
                    if (cfg && (cfg.apiRelaySettings || cfg.apiRelayKeys || cfg.relays)) {
                        const relays = cfg.apiRelaySettings || cfg.relays || [];
                        const hiddenPresetIds = cfg.hiddenPresetIds || [];
                        const res = await fetch("/client-api/config-vault", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ relays, hiddenPresetIds, imageHost: cfg.imageHostConfig }),
                        });
                        if (!res.ok) {
                            const errData = (await res.json().catch(() => ({}))) as { error?: string };
                            const errMsg = errData.error || `服务端配置保存失败 HTTP ${res.status}`;
                            console.error("[ConfigStorage] 服务端配置保存失败:", errMsg);
                            throw new Error(errMsg);
                        }
                    }
                } catch (vaultErr) {
                    console.error("[ConfigStorage] 凭据库同步失败:", vaultErr);
                    throw vaultErr;
                }
            }

            clearPendingConfigSnapshot(name, value);
        });
    },

    removeItem(name) {
        pendingConfigSnapshots.delete(name);
        return enqueueConfigWrite(async () => {
            await Promise.allSettled([
                removeBrowserPrimary(name),
                removeBrowserRecovery(name),
            ]);
        });
    },
};

export function flushRecoverableConfig(name: string, value?: string) {
    if (value !== undefined) pendingConfigSnapshots.set(name, value);
    return enqueueConfigWrite(async () => {
        const pendingValue = pendingConfigSnapshots.get(name);
        if (pendingValue === undefined) return;
        const browserValue = browserSafeConfigEnvelope(pendingValue);
        await writeBrowserRecovery(name, browserValue);
        await writeBrowserPrimary(name, browserValue);
        clearPendingConfigSnapshot(name, pendingValue);
    });
}

function clearPendingConfigSnapshot(name: string, savedValue: string) {
    if (pendingConfigSnapshots.get(name) === savedValue) pendingConfigSnapshots.delete(name);
}

function enqueueConfigWrite(write: () => Promise<void>) {
    const result = configWriteQueue.then(write, write);
    configWriteQueue = result.catch(() => undefined);
    return result;
}

async function readRecoveryValue(name: string) {
    if (typeof window === "undefined") return null;
    const key = recoveryKey(name);
    const local = safeLocalStorageGet(key);
    try {
        const indexedDb = await localforage.getItem<string>(key);
        if (isPersistedConfigEnvelope(indexedDb)) return indexedDb;
    } catch {
        // Fall through to the synchronous localStorage copy.
    }
    return isPersistedConfigEnvelope(local) ? local : null;
}

async function readBrowserPrimaryValue(name: string) {
    if (typeof window === "undefined") return null;
    const local = safeLocalStorageGet(name);
    try {
        const indexedDb = await localforage.getItem<string>(name);
        if (isPersistedConfigEnvelope(indexedDb)) return indexedDb;
    } catch {
        // Fall through to the synchronous localStorage copy.
    }
    return isPersistedConfigEnvelope(local) ? local : null;
}

async function restoreBrowserConfigCandidate(name: string, value: string | null, desktopRequired: boolean) {
    if (!isPersistedConfigEnvelope(value)) return null;
    const action = browserConfigFallbackAction(value, desktopRequired);
    if (action === "reject") return null;
    const browserValue = browserSafeConfigEnvelope(value);
    await replaceBrowserConfigCopies(name, browserValue);
    return browserValue;
}

function replaceBrowserConfigCopies(name: string, value: string) {
    return enqueueConfigWrite(async () => {
        await writeBrowserRecovery(name, value);
        await writeBrowserPrimary(name, value);
    });
}

async function writeBrowserRecovery(name: string, value: string) {
    if (typeof window === "undefined") return;
    const key = recoveryKey(name);
    safeLocalStorageSet(key, value);
    try {
        await localforage.setItem(key, value);
    } catch {
        // localStorage remains as the synchronous recovery copy.
    }
}

async function writeBrowserPrimary(name: string, value: string) {
    if (typeof window === "undefined") return;
    safeLocalStorageSet(name, value);
    try {
        await localforage.setItem(name, value);
    } catch {
        // localStorage remains as the primary browser copy.
    }
}

async function removeBrowserPrimary(name: string) {
    if (typeof window === "undefined") return;
    safeLocalStorageRemove(name);
    try {
        await localforage.removeItem(name);
    } catch {
        // Ignore unavailable IndexedDB after removing localStorage.
    }
}

async function removeBrowserRecovery(name: string) {
    if (typeof window === "undefined") return;
    const key = recoveryKey(name);
    safeLocalStorageRemove(key);
    try {
        await localforage.removeItem(key);
    } catch {
        // Ignore unavailable IndexedDB.
    }
}

function isPersistedConfigEnvelope(value: string | null): value is string {
    if (!value) return false;
    try {
        const parsed = JSON.parse(value) as { state?: { config?: unknown } };
        return Boolean(parsed && typeof parsed === "object" && parsed.state && typeof parsed.state.config === "object" && parsed.state.config !== null);
    } catch {
        return false;
    }
}

function safeLocalStorageGet(key: string) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore unavailable localStorage.
    }
}

function safeLocalStorageRemove(key: string) {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // Ignore unavailable localStorage.
    }
}
