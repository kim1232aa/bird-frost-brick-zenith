"use client";

import localforage from "localforage";

import { readImageMeta } from "@/lib/image-utils";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type StoredImageRecord = { blob: Blob; createdAt: number; lastAccessedAt?: number; retained?: boolean };
type StoredImage = Blob | StoredImageRecord;
type UploadImageOptions = { retained?: boolean; signal?: AbortSignal };

const legacyStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();
const pendingObjectUrls = new Map<string, Promise<string | null>>();
export const CANVAS_IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function uploadImage(input: string | Blob, options: UploadImageOptions = {}): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await fetchImageBlob(input, options.signal) : input;
    throwIfUploadAborted(options.signal);
    assertNonEmptyImageBlob(blob);

    let serverPermanentUrl = "";
    if (typeof window !== "undefined" && typeof fetch === "function") {
        const res = await fetch("/client-api/upload-work-media", {
            method: "POST",
            headers: {
                "content-type": blob.type || "image/png",
                "x-work-kind": "image",
                "x-work-index": "0",
            },
            body: blob,
            signal: options.signal,
        });

        if (!res.ok) {
            const errorPayload = (await res.json().catch(() => ({}))) as { error?: string };
            const errorMsg = errorPayload.error || `服务端媒体上传失败 HTTP ${res.status}`;
            console.error("[ImageStorage] 上传图片到服务器失败:", errorMsg);
            throw new Error(errorMsg);
        }

        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!payload.ok || !payload.url) {
            const errorMsg = payload.error || "服务端未返回有效图片地址";
            console.error("[ImageStorage] 上传图片到服务器失败:", errorMsg);
            throw new Error(errorMsg);
        }
        serverPermanentUrl = payload.url;
    } else {
        throw new Error("当前环境无法调用媒体上传服务");
    }

    throwIfUploadAborted(options.signal);
    const url = serverPermanentUrl;
    // The server path IS the storage key: it survives reloads, new browsers and
    // new devices, which a per-tab `image:<id>` handle never did.
    const storageKey = url;
    const meta = await readImageMeta(url);
    throwIfUploadAborted(options.signal);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    if (storageKey.startsWith("/works/") || storageKey.startsWith("/gallery/") || storageKey.startsWith("http://") || storageKey.startsWith("https://")) {
        return storageKey;
    }
    const cached = objectUrls.get(storageKey);
    if (cached) {
        return cached;
    }

    let pending = pendingObjectUrls.get(storageKey);
    if (!pending) {
        const load = getImageBlob(storageKey, { touch: true }).then((blob) => {
            if (!blob) return null;
            return objectUrls.get(storageKey) || replaceObjectURL(storageKey, blob);
        });
        pending = load.finally(() => {
            if (pendingObjectUrls.get(storageKey) === pending) pendingObjectUrls.delete(storageKey);
        });
        pendingObjectUrls.set(storageKey, pending);
    }
    return (await pending) || fallback;
}

export async function getImageBlob(storageKey: string, options: { touch?: boolean } = {}) {
    try {
        const legacy = await getLegacyRecord(storageKey);
        if (!legacy?.blob.size) return null;
        if (options.touch) await legacyStore.setItem(storageKey, { ...legacy, lastAccessedAt: Date.now() });
        return legacy.blob;
    } catch {
        return null;
    }
}

export async function getAllStoredImageKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    try {
        const legacyKeys = await legacyStore.keys();
        legacyKeys.forEach((k) => keys.add(k));
    } catch {
        // Legacy store unavailable
    }
    return keys;
}

export async function setImageBlob(storageKey: string, blob: Blob, options: UploadImageOptions = {}) {
    assertNonEmptyImageBlob(blob);
    const existing = await getLegacyRecord(storageKey);
    const now = Date.now();
    await legacyStore.setItem(storageKey, {
        blob,
        createdAt: existing?.createdAt || now,
        lastAccessedAt: now,
        retained: options.retained ?? existing?.retained ?? false,
    });
    return replaceObjectURL(storageKey, blob);
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    try {
        return await blobToDataUrl(await fetchImageBlob(url));
    } catch {
        return url;
    }
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).filter(isBrowserCacheKey).map(async (key) => {
            revokeObjectURL(key);
            await legacyStore.removeItem(key).catch(() => undefined);
        }),
    );
}

/** Server-hosted `/works/` media is owned by the server; only browser-cached keys are collectable. */
function isBrowserCacheKey(key: string) {
    return !key.startsWith("/works/") && !key.startsWith("/gallery/") && !/^https?:\/\//i.test(key);
}

export async function touchStoredImages(keys: Iterable<string>) {
    const now = Date.now();
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const legacy = await getLegacyRecord(key);
            if (legacy) await legacyStore.setItem(key, { ...legacy, lastAccessedAt: now }).catch(() => undefined);
        }),
    );
}

export async function setStoredImagesRetained(keys: Iterable<string>, retained = true) {
    const now = Date.now();
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const legacy = await getLegacyRecord(key);
            if (legacy) await legacyStore.setItem(key, { ...legacy, retained, lastAccessedAt: now }).catch(() => undefined);
        }),
    );
}

export async function cleanupExpiredStoredImages(maxAgeMs = CANVAS_IMAGE_RETENTION_MS, protectedKeys: Iterable<string> = []) {
    const now = Date.now();
    const protectedSet = new Set(protectedKeys);
    const expired = new Set<string>();
    await legacyStore.iterate((value: StoredImage, key) => {
        const record = unwrapStoredImage(value);
        if (!record || protectedSet.has(key) || record.retained) return;
        if (now - (record.lastAccessedAt || record.createdAt) > maxAgeMs) expired.add(key);
    });
    await deleteStoredImages(expired);
    return [...expired];
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused = new Set<string>();
    await legacyStore.iterate((_value: StoredImage, key) => {
        if (!usedKeys.has(key)) unused.add(key);
    });
    await deleteStoredImages(unused);
}

export function releaseImageObjectUrls(keys: Iterable<string>) {
    for (const key of new Set(keys)) {
        pendingObjectUrls.delete(key);
        revokeObjectURL(key);
    }
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()): Set<string> {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) {
        keys.add(value.storageKey);
    }
    Object.values(value).forEach((item) => {
        if (Array.isArray(item)) item.forEach((child) => collectImageStorageKeys(child, keys));
        else collectImageStorageKeys(item, keys);
    });
    return keys;
}

function unwrapStoredImage(value: StoredImage | null): StoredImageRecord | null {
    if (!value) return null;
    if (value instanceof Blob) return { blob: value, createdAt: 0 };
    if (typeof value === "object" && "blob" in value && value.blob instanceof Blob) {
        return {
            blob: value.blob,
            createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
            lastAccessedAt: typeof value.lastAccessedAt === "number" ? value.lastAccessedAt : undefined,
            retained: Boolean(value.retained),
        };
    }
    return null;
}

async function getLegacyRecord(storageKey: string) {
    const item = await legacyStore.getItem<StoredImage>(storageKey);
    return unwrapStoredImage(item);
}

function replaceObjectURL(storageKey: string, blob: Blob) {
    revokeObjectURL(storageKey);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

function revokeObjectURL(storageKey: string) {
    const existing = objectUrls.get(storageKey);
    if (existing && existing.startsWith("blob:")) URL.revokeObjectURL(existing);
    objectUrls.delete(storageKey);
}

async function fetchImageBlob(url: string, signal?: AbortSignal) {
    const timeoutSignal = signal || AbortSignal.timeout(60000);
    const response = await fetch(url, { signal: timeoutSignal });
    if (!response.ok) throw new Error(`获取图片失败 (${response.status})`);
    return response.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("图片转换 Base64 失败"));
        reader.readAsDataURL(blob);
    });
}

function assertNonEmptyImageBlob(blob: Blob) {
    if (!blob || blob.size === 0) throw new Error("图片内容为空");
}

function throwIfUploadAborted(signal?: AbortSignal, cause?: unknown) {
    if (signal?.aborted) {
        throw signal.reason || new Error("图片上传已中止");
    }
    if (cause instanceof Error && cause.name === "AbortError") {
        throw cause;
    }
}
