"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { getStrictLocalForageItem, localForageStorage } from "@/lib/localforage-storage";
import { getCachedAuthStorageScope, normalizeStorageScope, scopedStorageKey } from "@/lib/user-storage-scope";
import { cleanupUnusedImages, getImageBlob, resolveImageUrl, setStoredImagesRetained, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import { mergeSyncTombstones, type SyncTombstone } from "@/services/sync-record-merge";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    hydrationStatus: "loading" | "ready" | "error";
    hydrationError: string | null;
    assets: Asset[];
    syncDeleted: SyncTombstone[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[], syncDeleted?: SyncTombstone[]) => void;
    refreshMediaUrls: () => Promise<void>;
    cleanupImages: (extra?: unknown) => void;
    retryHydration: () => Promise<void>;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
let assetStorageScope = getCachedAuthStorageScope();
let assetMutationRevision = 0;
let assetLastHydratedMutationRevision = 0;
let assetPersistenceUnlocked = false;

function getAssetStorageKey(name: string) {
    return scopedStorageKey(name, assetStorageScope);
}

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const storageKey = getAssetStorageKey(name);
        const value = await getStrictLocalForageItem(storageKey);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        const assets = Array.isArray(parsed.state.assets) ? parsed.state.assets : [];
        parsed.state.assets = assets;
        parsed.state.syncDeleted = Array.isArray(parsed.state.syncDeleted) ? parsed.state.syncDeleted : [];
        const assetImageKeys = assets.flatMap((asset) => (asset.kind === "image" && asset.data.storageKey ? [asset.data.storageKey] : []));
        await setStoredImagesRetained(assetImageKeys, true);
        parsed.state.assets = await Promise.all(
            assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl, { retained: true });
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => {
        // Persisting empty/default state while the native snapshot is still
        // unresolved can destroy the only good copy. A successful hydration
        // triggers a fresh write of the merged current state below.
        if (!assetPersistenceUnlocked) return Promise.resolve();
        return localForageStorage.setItem(getAssetStorageKey(name), JSON.stringify(value));
    },
    removeItem: (name) => localForageStorage.removeItem(getAssetStorageKey(name)),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            hydrationStatus: "loading",
            hydrationError: null,
            assets: [],
            syncDeleted: [],
            addAsset: (asset) => {
                assetMutationRevision += 1;
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => {
                    assetMutationRevision += 1;
                    return {
                        assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                    };
                }),
            removeAsset: (id) =>
                set((state) => {
                    assetMutationRevision += 1;
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    const deleted = state.assets.some((asset) => asset.id === id) ? [{ id, deletedAt: new Date().toISOString() }] : [];
                    return { assets, syncDeleted: mergeSyncTombstones(state.syncDeleted, deleted) };
                }),
            replaceAssets: (assets, syncDeleted) => set((state) => {
                assetMutationRevision += 1;
                return { assets, syncDeleted: syncDeleted ?? state.syncDeleted };
            }),
            refreshMediaUrls: async () => {
                const assets = await Promise.all(get().assets.map(async (asset) => {
                    if (asset.kind !== "video" || !asset.data.storageKey) return asset;
                    return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                }));
                assetMutationRevision += 1;
                set({ assets });
            },
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/app/canvas/stores/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
            retryHydration: async () => {
                clearAssetRehydrateRetry();
                assetAutoRehydrateAttempts = 0;
                assetPersistenceUnlocked = false;
                useAssetStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null });
                await useAssetStore.persist.rehydrate();
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets, syncDeleted: state.syncDeleted }) as StorageValue<AssetStore>["state"],
            merge: (persistedState, currentState) => {
                const persisted = (persistedState || {}) as Partial<AssetStore>;
                if (assetMutationRevision === assetLastHydratedMutationRevision)
                    return { ...currentState, ...persisted };

                const currentDeleted = currentState.syncDeleted || [];
                const deletedIds = new Set(currentDeleted.map((entry) => entry.id));
                const currentIds = new Set(currentState.assets.map((asset) => asset.id));
                return {
                    ...currentState,
                    ...persisted,
                    // Writes made while storage was unresolved take priority;
                    // untouched persisted assets are still recovered.
                    assets: [
                        ...currentState.assets,
                        ...(Array.isArray(persisted.assets) ? persisted.assets : []).filter(
                            (asset) => !currentIds.has(asset.id) && !deletedIds.has(asset.id),
                        ),
                    ],
                    syncDeleted: mergeSyncTombstones(
                        Array.isArray(persisted.syncDeleted) ? persisted.syncDeleted : [],
                        currentDeleted,
                    ),
                };
            },
            onRehydrateStorage: () => {
                return (_state, error) => {
                if (error) {
                    assetPersistenceUnlocked = false;
                    useAssetStore.setState({
                        hydrated: false,
                        hydrationStatus: "error",
                        hydrationError: hydrationErrorMessage(error, "读取本地素材失败"),
                    });
                    scheduleAssetRehydrate();
                    return;
                }
                clearAssetRehydrateRetry();
                assetAutoRehydrateAttempts = 0;
                assetPersistenceUnlocked = true;
                assetLastHydratedMutationRevision = assetMutationRevision;
                const state = useAssetStore.getState();
                useAssetStore.setState({
                    hydrated: true,
                    hydrationStatus: "ready",
                    hydrationError: null,
                    // A new array also commits the post-merge snapshot now that
                    // persistence has been safely unlocked.
                    assets: [...state.assets],
                });
                };
            },
        },
    ),
);

let assetRehydrateTimer: number | null = null;
let assetAutoRehydrateAttempts = 0;
const ASSET_AUTO_REHYDRATE_LIMIT = 3;

function scheduleAssetRehydrate() {
    if (typeof window === "undefined" || assetRehydrateTimer !== null || assetAutoRehydrateAttempts >= ASSET_AUTO_REHYDRATE_LIMIT) return;
    assetAutoRehydrateAttempts += 1;
    assetRehydrateTimer = window.setTimeout(() => {
        assetRehydrateTimer = null;
        void useAssetStore.persist.rehydrate();
    }, 1_000);
}

function hydrationErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message.trim() ? `${fallback}：${error.message}` : fallback;
}

function clearAssetRehydrateRetry() {
    if (typeof window === "undefined" || assetRehydrateTimer === null) return;
    window.clearTimeout(assetRehydrateTimer);
    assetRehydrateTimer = null;
}

export function setAssetStorageScope(scopeId?: string | null) {
    const nextScope = normalizeStorageScope(scopeId);
    if (nextScope === assetStorageScope) return;
    assetStorageScope = nextScope;
    clearAssetRehydrateRetry();
    assetAutoRehydrateAttempts = 0;
    assetMutationRevision = 0;
    assetLastHydratedMutationRevision = 0;
    assetPersistenceUnlocked = false;
    useAssetStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null, assets: [], syncDeleted: [] });
    void useAssetStore.persist.rehydrate();
}
