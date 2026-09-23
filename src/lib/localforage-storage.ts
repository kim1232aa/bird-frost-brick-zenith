import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

const INDEXED_DB_READ_TIMEOUT_MS = 15_000;
const INDEXED_DB_TIMEOUT = "__indexed_db_read_timeout__";

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        return readLegacyValue(name);
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            cacheLegacyLocalStorage(name, value);
            await localforage.setItem(name, value);
        } catch (err) {
            console.error(`[LocalForageStorage] 本地存储保存失败 "${name}":`, err);
            throw new Error(`本地数据保存失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await clearLegacyValue(name);
        } catch (err) {
            console.error(`[LocalForageStorage] 本地存储删除失败 "${name}":`, err);
            throw err;
        }
    },
};

export function getStrictLocalForageItem(name: string) {
    if (typeof window === "undefined") return Promise.resolve(null);
    return readLegacyValue(name);
}

export function isDesktopStateStorageRequired() {
    return false;
}

async function readLegacyValue(name: string) {
    const localValue = safeReadLocalStorage(name);
    try {
        const value = await Promise.race([
            localforage.getItem<string>(name),
            new Promise<typeof INDEXED_DB_TIMEOUT>((resolve) => window.setTimeout(() => resolve(INDEXED_DB_TIMEOUT), INDEXED_DB_READ_TIMEOUT_MS)),
        ]);
        if (value === INDEXED_DB_TIMEOUT) return localValue;
        return value || localValue || null;
    } catch {
        return localValue;
    }
}

async function clearLegacyValue(name: string) {
    try {
        window.localStorage.removeItem(name);
    } catch {
        // Ignore unavailable localStorage.
    }
    try {
        await localforage.removeItem(name);
    } catch {
        // Ignore unavailable IndexedDB.
    }
}

function safeReadLocalStorage(name: string) {
    try {
        return window.localStorage.getItem(name);
    } catch {
        return null;
    }
}

function cacheLegacyLocalStorage(name: string, value: string) {
    try {
        window.localStorage.setItem(name, value);
    } catch {
        // Ignore unavailable localStorage.
    }
}
