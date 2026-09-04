import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

import { getDesktopState, removeDesktopState, setDesktopState } from "@/services/desktop-storage";
import { getStrictLocalForageItem, isDesktopStateStorageRequired } from "@/lib/localforage-storage";
import { browserConfigFallbackAction, browserSafeConfigEnvelope } from "@/lib/config-secret-redaction";
import { assertNativeConfigReadable, writeConfigCopies } from "@/lib/config-copy-storage";

export const CONFIG_RECOVERY_SUFFIX = ":recovery";

let configWriteQueue: Promise<void> = Promise.resolve();
const pendingConfigSnapshots = new Map<string, string>();

function recoveryKey(name: string) {
    return `${name}${CONFIG_RECOVERY_SUFFIX}`;
}

/**
 * Configuration gets a second durable copy because an application update can
 * restart the WebView while Zustand is still restoring its asynchronous
 * storage. A missing/temporarily unavailable primary must never be interpreted
 * as permission to persist the in-memory defaults over the user's API routes.
 */
export const recoverableConfigStorage: StateStorage = {
    async getItem(name) {
        const desktopRequired = isDesktopStateStorageRequired();
        // SQLite (desktop state) takes priority over IndexedDB.
        // Read the direct state key first (external repair scripts write to this).
        // Then fall back to the recovery copy (:recovery suffix).
        let primaryNativeError: unknown;
        try {
            const direct = await getDesktopState(name);
            if (isPersistedConfigEnvelope(direct)) {
                const browserValue = browserSafeConfigEnvelope(direct);
                await replaceBrowserConfigCopies(name, browserValue);
                return browserValue;
            }
        } catch (error) {
            primaryNativeError = error;
        }

        let recoveryNativeError: unknown;
        try {
            const nativeRecovery = await getDesktopState(recoveryKey(name));
            if (isPersistedConfigEnvelope(nativeRecovery)) {
                const browserValue = browserSafeConfigEnvelope(nativeRecovery);
                await replaceBrowserConfigCopies(name, browserValue);
                return browserValue;
            }
        } catch (error) {
            recoveryNativeError = error;
        }

        assertNativeConfigReadable(desktopRequired, primaryNativeError, recoveryNativeError);

        const recovered = await readRecoveryValue(name);
        const restoredRecovery = await restoreBrowserConfigCandidate(name, recovered, desktopRequired);
        if (restoredRecovery) return restoredRecovery;

        let primaryError: unknown;
        try {
            const primary = desktopRequired
                ? await readBrowserPrimaryValue(name)
                : await getStrictLocalForageItem(name);
            const restored = await restoreBrowserConfigCandidate(name, primary, desktopRequired);
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
            const desktopRequired = isDesktopStateStorageRequired();
            const browserValue = browserSafeConfigEnvelope(value);
            await writeConfigCopies(
                name,
                recoveryKey(name),
                value,
                browserValue,
                {
                    setNative: setDesktopState,
                    setBrowser: async (key, nextValue) => {
                        if (key === recoveryKey(name)) await writeBrowserRecovery(name, nextValue);
                        else await writeBrowserPrimary(name, nextValue);
                    },
                },
                desktopRequired,
            );
            clearPendingConfigSnapshot(name, value);
        });
    },

    removeItem(name) {
        pendingConfigSnapshots.delete(name);
        return enqueueConfigWrite(async () => {
            await Promise.allSettled([
                removeDesktopState(name),
                removeDesktopState(recoveryKey(name)),
                removeBrowserPrimary(name),
                removeBrowserRecovery(name),
            ]);
        });
    },
};

export function flushRecoverableConfig(name: string, value?: string) {
    if (value !== undefined) pendingConfigSnapshots.set(name, value);
    // Queue behind earlier Zustand writes, then commit the latest snapshot to
    // native desktop storage and redacted browser primary/recovery copies.
    return enqueueConfigWrite(async () => {
        const pendingValue = pendingConfigSnapshots.get(name);
        if (pendingValue === undefined) return;
        const desktopRequired = isDesktopStateStorageRequired();
        const browserValue = browserSafeConfigEnvelope(pendingValue);
        if (desktopRequired) {
            await setDesktopState(name, pendingValue);
            await setDesktopState(recoveryKey(name), pendingValue);
        }
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
    if (action === "migrate") {
        await migrateBrowserConfigToNative(name, value);
    } else {
        await replaceBrowserConfigCopies(name, browserValue);
    }
    return browserValue;
}

function replaceBrowserConfigCopies(name: string, value: string) {
    return enqueueConfigWrite(async () => {
        await writeBrowserRecovery(name, value);
        await writeBrowserPrimary(name, value);
    });
}

function migrateBrowserConfigToNative(name: string, value: string) {
    return enqueueConfigWrite(async () => {
        await writeConfigCopies(
            name,
            recoveryKey(name),
            value,
            browserSafeConfigEnvelope(value),
            {
                setNative: setDesktopState,
                setBrowser: async (key, nextValue) => {
                    if (key === recoveryKey(name)) await writeBrowserRecovery(name, nextValue);
                    else await writeBrowserPrimary(name, nextValue);
                },
            },
            true,
        );
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
