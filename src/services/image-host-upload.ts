import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import { persistImageHostCredential } from "@/stores/use-config-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

const MIAOHUA_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIAOHUA_MIN_DIMENSION = 256;
const MIAOHUA_MAX_DIMENSION = 6000;
const SUPPORTED_MIAOHUA_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

type ImageHostUploadResponse = {
    code?: number;
    data?: { images?: Array<{ url?: string }> };
    url?: string;
};

type ImageHostUploadOptions = {
    requirePublicResult?: boolean;
    validateBaseUrlProtocol?: boolean;
    missingConfigMessage?: string;
};

/**
 * Upload one image through the authenticated desktop bridge. The upload is
 * deliberately attempted once: callers must not replay this non-idempotent
 * multipart request automatically.
 */
export async function uploadImageToConfiguredHost(
    config: Pick<AiConfig, "imageHostBaseUrl" | "imageHostApiKey">,
    blob: Blob,
    filename = "image.png",
    options: ImageHostUploadOptions = {},
) {
    const baseUrl = normalizeImageHostBaseUrl(config.imageHostBaseUrl, options);
    const apiKey = String(config.imageHostApiKey || "").trim();
    if (apiKey) {
        // The one-time save request may carry the value to the authenticated
        // server function; the actual upload request never carries a raw Key.
        await persistImageHostCredential(baseUrl, apiKey);
    }
    const formData = new FormData();
    formData.append("file", blob, filename);
    const headers: Record<string, string> = { "x-image-host-base-url": baseUrl };

    let response;
    try {
        response = await axios.post<ImageHostUploadResponse>("/client-api/upload-image-host", formData, {
            headers,
            timeout: 60_000,
        });
    } catch (error) {
        throw new Error(readImageHostError(error));
    }

    const url = String(response.data?.data?.images?.[0]?.url || response.data?.url || "").trim();
    const accepted = options.requirePublicResult ? isPublicHttpImageUrl(url) : /^https?:\/\//i.test(url);
    if (!accepted) {
        throw new Error(options.requirePublicResult ? "图床返回的图片地址不是可供上游访问的公网 http(s) URL" : "图床返回中没有可用的图片 URL");
    }
    return options.requirePublicResult ? new URL(url).toString() : url;
}

/** Resolve and validate the exact public `img_url` required by Miaohua edit. */
export async function resolveMiaohuaPublicReference(
    config: Pick<AiConfig, "imageHostBaseUrl" | "imageHostApiKey">,
    image: ReferenceImage,
) {
    const reusableUrl = [image.url, image.dataUrl].find(isPublicHttpImageUrl);
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl?.startsWith("data:")) {
        throw new Error("秒画参考图读取失败；请重新选择原图后再试");
    }
    const file = dataUrlToFile({ ...image, dataUrl });
    await assertMiaohuaReferenceImage(file);
    if (reusableUrl) return new URL(reusableUrl).toString();
    return uploadImageToConfiguredHost(config, file, file.name, {
        requirePublicResult: true,
        validateBaseUrlProtocol: true,
        missingConfigMessage: "秒画本地参考图需要公网 URL，请先填写图床地址",
    });
}

/** Validate the documented Miaohua edit input limits before task creation. */
export async function assertMiaohuaReferenceImage(blob: Blob) {
    const declaredMime = normalizeImageMime(blob.type);
    if (!SUPPORTED_MIAOHUA_MIME_TYPES.has(declaredMime)) {
        throw new Error("秒画参考图仅支持 JPG、JPEG、PNG 或 WebP");
    }
    if (!blob.size || blob.size >= MIAOHUA_MAX_IMAGE_BYTES) {
        throw new Error("秒画参考图必须小于 8 MiB");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const metadata = readImageDimensions(bytes);
    if (!metadata || normalizeImageMime(metadata.mimeType) !== declaredMime) {
        throw new Error("秒画参考图文件内容与 MIME 类型不匹配，或图片已损坏");
    }
    if (
        metadata.width < MIAOHUA_MIN_DIMENSION || metadata.width > MIAOHUA_MAX_DIMENSION ||
        metadata.height < MIAOHUA_MIN_DIMENSION || metadata.height > MIAOHUA_MAX_DIMENSION
    ) {
        throw new Error(`秒画参考图宽高必须在 ${MIAOHUA_MIN_DIMENSION}–${MIAOHUA_MAX_DIMENSION} 像素之间；当前为 ${metadata.width}x${metadata.height}`);
    }
    return metadata;
}

export function isPublicHttpImageUrl(value: string | undefined) {
    try {
        const url = new URL(String(value || "").trim());
        if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return false;
        const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
        if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan")) return false;
        if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return false;
        return true;
    } catch {
        return false;
    }
}

function normalizeImageHostBaseUrl(value: string, options: ImageHostUploadOptions) {
    const raw = String(value || "").trim().replace(/\/+$/, "");
    if (!raw) throw new Error(options.missingConfigMessage || "参考图需要公网 URL，请先填写图床地址");
    if (!options.validateBaseUrlProtocol) return raw;
    try {
        const url = new URL(raw);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        return url.toString().replace(/\/+$/, "");
    } catch {
        throw new Error("图床地址必须是有效的 http(s) URL");
    }
}

function normalizeImageMime(value: string) {
    const mime = String(value || "").trim().toLowerCase();
    return mime === "image/jpg" ? "image/jpeg" : mime;
}

function readImageDimensions(bytes: Uint8Array): { width: number; height: number; mimeType: string } | undefined {
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[12] === 0x49 && ascii(bytes, 13, 3) === "HDR") {
        return { width: u32be(bytes, 16), height: u32be(bytes, 20), mimeType: "image/png" };
    }
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
        return readWebpDimensions(bytes);
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        return readJpegDimensions(bytes);
    }
    return undefined;
}

function readJpegDimensions(bytes: Uint8Array) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > bytes.length) return undefined;
        const length = (bytes[offset] << 8) | bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) return undefined;
        if (isJpegStartOfFrame(marker) && length >= 7) {
            return {
                width: (bytes[offset + 5] << 8) | bytes[offset + 6],
                height: (bytes[offset + 3] << 8) | bytes[offset + 4],
                mimeType: "image/jpeg",
            };
        }
        offset += length;
    }
    return undefined;
}

function isJpegStartOfFrame(marker: number) {
    return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function readWebpDimensions(bytes: Uint8Array) {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
        return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1, mimeType: "image/webp" };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
        const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
        const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
        return { width, height, mimeType: "image/webp" };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return {
            width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
            height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
            mimeType: "image/webp",
        };
    }
    return undefined;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function u24le(bytes: Uint8Array, offset: number) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32be(bytes: Uint8Array, offset: number) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function isPrivateIpv4(hostname: string) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    const parts = hostname.split(".").map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isPrivateIpv6(hostname: string) {
    if (!hostname.includes(":")) return false;
    const normalized = hostname.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (/^(?:fc|fd|ff)/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
    // IPv4-mapped IPv6 literals can be normalized to hexadecimal by URL(), so
    // reject the mapped namespace instead of relying on only dotted notation.
    return normalized.startsWith("::ffff:");
}

function readImageHostError(error: unknown) {
    if (axios.isAxiosError<{ detail?: string; message?: string; msg?: string }>(error)) {
        const payload = error.response?.data;
        return payload?.detail || payload?.message || payload?.msg || (error.response?.status ? `图床上传失败（${error.response.status}）` : "图床上传失败");
    }
    return error instanceof Error ? error.message : "图床上传失败";
}
