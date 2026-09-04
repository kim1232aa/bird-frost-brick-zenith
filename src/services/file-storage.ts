"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

import { deleteDesktopMedia, getDesktopMediaBlob, listDesktopMedia, uploadDesktopMedia } from "@/services/desktop-storage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const legacyStore = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const MEDIA_METADATA_TIMEOUT_MS = 10_000;
const objectUrls = new Map<string, string>();
const pendingObjectUrls = new Map<string, Promise<string | null>>();
const objectUrlEpochs = new Map<string, number>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const meta = await readUploadedMediaMeta(blob, prefix);
    const storageKey = `${prefix}:${nanoid()}`;
    try {
        await uploadDesktopMedia(storageKey, blob);
    } catch {
        await legacyStore.setItem(storageKey, blob);
    }
    const url = replaceObjectURL(storageKey, blob);
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "", ...meta };
}

async function readUploadedMediaMeta(blob: Blob, prefix: string) {
    const mediaType = blob.type.startsWith("video/")
        ? "video"
        : blob.type.startsWith("audio/")
          ? "audio"
          : prefix === "video" || prefix === "audio"
            ? prefix
            : "";
    if (!mediaType) return {};
    const metadataUrl = URL.createObjectURL(blob);
    try {
        return mediaType === "video" ? await readVideoMeta(metadataUrl) : await readAudioMeta(metadataUrl);
    } finally {
        URL.revokeObjectURL(metadataUrl);
    }
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;

    // A project can hydrate the same video or audio through canvas state,
    // history and assets at once. Sharing the load keeps one completion from
    // revoking the blob URL another media element has just received.
    let pending = pendingObjectUrls.get(storageKey);
    if (!pending) {
        const epoch = objectUrlEpochs.get(storageKey) || 0;
        const load = getMediaBlob(storageKey).then((blob) => {
            if (!blob) return null;
            if ((objectUrlEpochs.get(storageKey) || 0) !== epoch) return objectUrls.get(storageKey) || null;
            return objectUrls.get(storageKey) || replaceObjectURL(storageKey, blob);
        });
        pending = load.finally(() => {
            if (pendingObjectUrls.get(storageKey) === pending) pendingObjectUrls.delete(storageKey);
        });
        pendingObjectUrls.set(storageKey, pending);
    }
    return (await pending) || fallback;
}

export async function getMediaBlob(storageKey: string) {
    try {
        const blob = await getDesktopMediaBlob(storageKey);
        if (blob) return blob;
        const legacy = await legacyStore.getItem<Blob>(storageKey);
        if (!legacy) return null;
        await uploadDesktopMedia(storageKey, legacy);
        await legacyStore.removeItem(storageKey);
        return legacy;
    } catch {
        return legacyStore.getItem<Blob>(storageKey);
    }
}

export async function getAllStoredMediaKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    try {
        const categories: Array<"videos" | "audio" | "files"> = ["videos", "audio", "files"];
        for (const category of categories) {
            const records = await listDesktopMedia(category);
            records.forEach((r) => keys.add(r.storageKey));
        }
    } catch {
        // Desktop API unavailable, check legacy store
    }
    try {
        const legacyKeys = await legacyStore.keys();
        legacyKeys.forEach((k) => keys.add(k));
    } catch {
        // Legacy store unavailable
    }
    return keys;
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    try {
        await uploadDesktopMedia(storageKey, blob);
        await legacyStore.removeItem(storageKey).catch(() => undefined);
    } catch {
        await legacyStore.setItem(storageKey, blob);
    }
    return replaceObjectURL(storageKey, blob);
}

/**
 * Releases in-memory blob URLs without deleting persisted media. Call this
 * only after every media element using the supplied key has unmounted.
 */
export function releaseMediaObjectUrls(keys: Iterable<string>) {
    for (const key of new Set(keys)) {
        objectUrlEpochs.set(key, (objectUrlEpochs.get(key) || 0) + 1);
        pendingObjectUrls.delete(key);
        revokeObjectURL(key);
    }
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    const uniqueKeys = [...new Set(keys)];
    releaseMediaObjectUrls(uniqueKeys);
    await Promise.all(
        uniqueKeys.map(async (key) => {
            try {
                await deleteDesktopMedia(key);
            } catch {
                // Standalone development may not have the Go API.
            }
            await legacyStore.removeItem(key).catch(() => undefined);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused = new Set<string>();
    try {
        (await listDesktopMedia()).forEach((record) => {
            if (!record.storageKey.startsWith("image:") && !usedKeys.has(record.storageKey)) unused.add(record.storageKey);
        });
    } catch {
        // Fall through to legacy IndexedDB enumeration.
    }
    await legacyStore.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.add(key);
    });
    await deleteStoredMedia(unused);
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function replaceObjectURL(storageKey: string, blob: Blob) {
    revokeObjectURL(storageKey);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

function revokeObjectURL(storageKey: string) {
    const existing = objectUrls.get(storageKey);
    if (existing) URL.revokeObjectURL(existing);
    objectUrls.delete(storageKey);
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve, reject) => {
        const video = document.createElement("video");
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            video.onloadedmetadata = null;
            video.onerror = null;
            video.onabort = null;
        };
        const done = (meta: { width: number; height: number; durationMs?: number }) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(meta);
        };
        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(message));
        };
        video.onloadedmetadata = () => {
            if (video.videoWidth <= 0 || video.videoHeight <= 0) {
                fail("视频元数据读取失败：未取得有效尺寸");
                return;
            }
            done({
                width: video.videoWidth,
                height: video.videoHeight,
                ...(Number.isFinite(video.duration) ? { durationMs: Math.round(video.duration * 1000) } : {}),
            });
        };
        video.onerror = () => fail("视频元数据读取失败，请确认视频内容有效后重试");
        video.onabort = () => fail("视频元数据读取已中止，请重试");
        const timer = setTimeout(() => fail("视频元数据读取超时，请确认视频内容有效后重试"), MEDIA_METADATA_TIMEOUT_MS);
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs: number }>((resolve, reject) => {
        const audio = document.createElement("audio");
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            audio.onloadedmetadata = null;
            audio.onerror = null;
            audio.onabort = null;
        };
        const done = () => {
            if (settled) return;
            if (!Number.isFinite(audio.duration) || audio.duration < 0) {
                fail("音频元数据读取失败：未取得有效时长");
                return;
            }
            settled = true;
            cleanup();
            resolve({ durationMs: Math.round(audio.duration * 1000) });
        };
        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(message));
        };
        audio.onloadedmetadata = done;
        audio.onerror = () => fail("音频元数据读取失败，请确认音频内容有效后重试");
        audio.onabort = () => fail("音频元数据读取已中止，请重试");
        const timer = setTimeout(() => fail("音频元数据读取超时，请确认音频内容有效后重试"), MEDIA_METADATA_TIMEOUT_MS);
        audio.src = url;
    });
}
