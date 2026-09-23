"use client";

import { create } from "zustand";

import { nanoid } from "nanoid";
import { cleanupUnusedImages } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import { deleteServerAsset, listServerAssets, saveServerAsset } from "@/studio/server/assets";

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
    serverPersistError: string | null;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => Promise<string>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => Promise<void>;
    removeAsset: (id: string) => Promise<void>;
    refreshMediaUrls: () => Promise<void>;
    cleanupImages: (extra?: unknown) => void;
    retryHydration: () => Promise<void>;
};

export const useAssetStore = create<AssetStore>()((set, get) => ({
    hydrated: false,
    hydrationStatus: "loading",
    hydrationError: null,
    serverPersistError: null,
    assets: [],
    addAsset: async (asset) => {
        const now = new Date().toISOString();
        const id = nanoid();
        const created = { ...asset, id, createdAt: now, updatedAt: now } as Asset;
        set((state) => ({ assets: [created, ...state.assets] }));
        await persistAsset(created);
        return id;
    },
    updateAsset: async (id, patch) => {
        const previous = get().assets;
        const current = previous.find((asset) => asset.id === id);
        if (!current) return;
        const updated = { ...current, ...patch, updatedAt: new Date().toISOString() } as Asset;
        set({ assets: previous.map((asset) => (asset.id === id ? updated : asset)) });
        await persistAsset(updated, previous);
    },
    removeAsset: async (id) => {
        const previous = get().assets;
        if (!previous.some((asset) => asset.id === id)) return;
        const assets = previous.filter((asset) => asset.id !== id);
        set({ assets });
        try {
            const result = await deleteServerAsset({ data: { id } });
            if (!result?.ok) throw new Error("服务端素材删除失败");
            set({ serverPersistError: null });
            get().cleanupImages({ assets });
        } catch (error) {
            // A failed delete must never look like a success: restore the row so
            // the library keeps matching what the server actually holds.
            set({ assets: previous, serverPersistError: assetErrorMessage(error, "服务端素材删除失败") });
            throw toAssetError(error, "服务端素材删除失败");
        }
    },
    refreshMediaUrls: async () => {
        const assets = await Promise.all(get().assets.map(async (asset) => {
            if (asset.kind !== "video" || !asset.data.storageKey) return asset;
            return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
        }));
        set({ assets });
    },
    cleanupImages: (extra) => {
        window.setTimeout(async () => {
            const { useCanvasStore } = await import("@/app/canvas/stores/use-canvas-store");
            const used = { assets: get().assets, projects: useCanvasStore.getState().projects, extra };
            await cleanupUnusedImages(used);
            await cleanupUnusedMedia(used);
        }, 0);
    },
    retryHydration: async () => {
        set({ hydrated: false, hydrationStatus: "loading", hydrationError: null });
        await hydrateAssets();
    },
}));

async function persistAsset(asset: Asset, rollbackTo?: Asset[]) {
    try {
        const result = await saveServerAsset({ data: asset });
        if (result && result.ok === false) throw new Error(result.error || "服务端素材保存失败");
        useAssetStore.setState({ serverPersistError: null });
    } catch (error) {
        // Undo the optimistic write so the library never shows an asset, or an
        // edit, that the server did not accept.
        useAssetStore.setState((state) => ({
            assets: rollbackTo ?? state.assets.filter((item) => item.id !== asset.id),
            serverPersistError: assetErrorMessage(error, "服务端素材保存失败"),
        }));
        throw toAssetError(error, "服务端素材保存失败");
    }
}

export async function hydrateAssets() {
    try {
        const assets = await listServerAssets();
        useAssetStore.setState({
            assets: Array.isArray(assets) ? (assets as Asset[]) : [],
            hydrated: true,
            hydrationStatus: "ready",
            hydrationError: null,
            serverPersistError: null,
        });
    } catch (error) {
        useAssetStore.setState({
            hydrated: false,
            hydrationStatus: "error",
            hydrationError: assetErrorMessage(error, "读取服务器素材失败"),
        });
    }
}

function assetErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message.trim() ? `${fallback}：${error.message}` : fallback;
}

function toAssetError(error: unknown, fallback: string) {
    return error instanceof Error ? error : new Error(fallback);
}

/** Re-reads the server library; the studio canvases share one server-side owner. */
export function setAssetStorageScope(_scopeId?: string | null) {
    useAssetStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null, serverPersistError: null, assets: [] });
    void hydrateAssets();
}

if (typeof window !== "undefined") {
    void hydrateAssets();
}
