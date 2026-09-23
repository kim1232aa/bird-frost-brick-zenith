"use client";

import localforage from "localforage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const legacyStore = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const MEDIA_METADATA_TIMEOUT_MS = 10_000;
const objectUrls = new Map<string, string>();
const pendingObjectUrls = new Map<string, Promise<string | null>>();
const objectUrlEpochs = new Map<string, number>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    if (typeof input === "string" && /^https?:\/\//i.test(input)) {
        const kind = prefix === "audio" || input.includes(".mp3") || input.includes(".wav") ? "audio" : "video";
        if (typeof window !== "undefined" && typeof fetch === "function") {
            try {
                const res = await fetch("/client-api/upload-work-media", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ remoteUrl: input, kind }),
                });
                if (res.ok) {
                    const payload = await res.json();
                    if (payload.ok && payload.url) {
                        return {
                            url: payload.url,
                            storageKey: payload.url,
                            bytes: Number(payload.bytes || 0),
                            mimeType: kind === "audio" ? "audio/mpeg" : "video/mp4",
                        };
                    }
                }
            } catch (err) {
                console.warn("[FileStorage] 服务端直接抓取失败，降级客户端同源代理:", err);
            }
        }
    }

    let blob: Blob;
    if (typeof input === "string") {
        const isExternalHttp = /^https?:\/\//i.test(input) && typeof window !== "undefined" && !input.startsWith(window.location.origin);
        const targetUrl = isExternalHttp ? `/client-api/fetch-url?url=${encodeURIComponent(input)}` : input;
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`获取媒体文件失败 HTTP ${res.status}`);
        blob = await res.blob();
    } else {
        blob = input;
    }

    const meta = await readUploadedMediaMeta(blob, prefix);
    const kind = blob.type.startsWith("video/") ? "video" : blob.type.startsWith("audio/") ? "audio" : "image";

    if (typeof window === "undefined" || typeof fetch !== "function") {
        throw new Error("当前环境无法调用媒体上传服务");
    }

    const res = await fetch("/client-api/upload-work-media", {
        method: "POST",
        headers: {
            "content-type": blob.type || "application/octet-stream",
            "x-work-kind": kind,
            "x-work-index": "0",
        },
        body: blob,
    });

    if (!res.ok) {
        const errorPayload = (await res.json().catch(() => ({}))) as { error?: string };
        const errorMsg = errorPayload.error || `媒体文件持久化上传失败 HTTP ${res.status}`;
        console.error("[FileStorage] 媒体文件上传失败:", errorMsg);
        throw new Error(errorMsg);
    }

    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!payload.ok || !payload.url) {
        const errorMsg = payload.error || "服务端未返回有效媒体地址";
        console.error("[FileStorage] 媒体文件上传失败:", errorMsg);
        throw new Error(errorMsg);
    }

    const url = payload.url;
    // The server path IS the storage key: it survives reloads, new browsers and
    // new devices, which a per-tab `video:<id>` handle never did.
    return { url, storageKey: url, bytes: blob.size, mimeType: blob.type || "", ...meta };
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
    if (storageKey.startsWith("/works/") || storageKey.startsWith("http://") || storageKey.startsWith("https://")) {
        return storageKey;
    }
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;

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
        return await legacyStore.getItem<Blob>(storageKey);
    } catch {
        return null;
    }
}

export async function getAllStoredMediaKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    try {
        const legacyKeys = await legacyStore.keys();
        legacyKeys.forEach((k) => keys.add(k));
    } catch {
        // Legacy store unavailable
    }
    return keys;
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    await legacyStore.setItem(storageKey, blob);
    return replaceObjectURL(storageKey, blob);
}

export function releaseMediaObjectUrls(keys: Iterable<string>) {
    for (const key of new Set(keys)) {
        objectUrlEpochs.set(key, (objectUrlEpochs.get(key) || 0) + 1);
        pendingObjectUrls.delete(key);
        revokeObjectURL(key);
    }
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    const uniqueKeys = [...new Set(keys)].filter(isBrowserCacheKey);
    releaseMediaObjectUrls(uniqueKeys);
    await Promise.all(
        uniqueKeys.map(async (key) => {
            await legacyStore.removeItem(key).catch(() => undefined);
        }),
    );
}

/** Server-hosted `/works/` media is owned by the server; only browser-cached keys are collectable. */
function isBrowserCacheKey(key: string) {
    return !key.startsWith("/works/") && !key.startsWith("/gallery/") && !/^https?:\/\//i.test(key);
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused = new Set<string>();
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
    if (existing && existing.startsWith("blob:")) URL.revokeObjectURL(existing);
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
        video.onerror = () => done({ width: 1088, height: 832 });
        video.onabort = () => done({ width: 1088, height: 832 });
        const timer = setTimeout(() => done({ width: 1088, height: 832 }), 30_000);
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
