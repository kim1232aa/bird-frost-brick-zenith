import type { ReferenceImage } from "@/types/image";
import type { StoredImage } from "@/store/image-conversations";

const ERROR_LIKE_IMAGE_URL_PATTERNS = [
    /no available image quota/i,
    /insufficient[_\s-]?quota/i,
    /quota/i,
    /error/i,
];

export function isLikelyImageDataUrl(value: string) {
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

export function isLikelyBase64Image(value: string | undefined | null) {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.length < 16) {
        return false;
    }
    return /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

/** Build a data URL without assuming every base64 response is PNG. */
export function base64ImageDataUrl(value: string | undefined | null, declaredMime?: string) {
    const base64 = String(value || "").trim();
    if (!base64) return "";
    const explicit = String(declaredMime || "").trim().toLowerCase();
    const mimeType = /^image\/[a-z0-9.+-]+$/i.test(explicit) ? explicit : inferBase64ImageMimeType(base64);
    return `data:${mimeType};base64,${base64}`;
}

export function inferBase64ImageMimeType(value: string | undefined | null) {
    const base64 = String(value || "").trim();
    if (base64.startsWith("/9j/")) return "image/jpeg";
    if (base64.startsWith("iVBORw0")) return "image/png";
    if (base64.startsWith("R0lGOD")) return "image/gif";
    if (base64.startsWith("UklGR")) return "image/webp";
    if (base64.startsWith("Qk")) return "image/bmp";
    if (base64.startsWith("AAAAIGZ0eXBhdmlm") || base64.startsWith("AAAAHGZ0eXBhdmlm")) return "image/avif";
    return "image/png";
}

export function isLikelyImageUrl(value: string | undefined | null) {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return false;
    }
    if (isLikelyImageDataUrl(normalized)) {
        return true;
    }
    const decoded = (() => {
        try {
            return decodeURIComponent(normalized);
        } catch {
            return normalized;
        }
    })();
    if (ERROR_LIKE_IMAGE_URL_PATTERNS.some((pattern) => pattern.test(decoded))) {
        return false;
    }
    if (/^blob:/i.test(normalized)) {
        return true;
    }
    if (/^https?:\/\/[^?#]+\/images\//i.test(normalized) || /^\/images\//i.test(normalized)) {
        return true;
    }
    return /\.(png|jpe?g|webp|gif|avif|bmp)(?:[?#].*)?$/i.test(normalized);
}

export function getStoredImageSrc(image: StoredImage) {
    if (isLikelyBase64Image(image.b64_json)) {
        return base64ImageDataUrl(image.b64_json);
    }
    return isLikelyImageUrl(image.url) ? String(image.url).trim() : "";
}

export function hasUsableStoredImageSource(image: StoredImage) {
    return Boolean(getStoredImageSrc(image));
}

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number) {
    const value = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
}

export function getDataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        return 0;
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });
}

export function readImageMeta(dataUrl: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve, reject) => {
        const image = new Image();
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            callback();
        };
        image.onload = () => {
            if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                finish(() => reject(new Error("图片元数据读取失败：未取得有效尺寸")));
                return;
            }
            finish(() => resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
                mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "",
            }));
        };
        image.onerror = () => finish(() => reject(new Error("图片元数据读取失败，请确认图片内容有效后重试")));
        timer = setTimeout(() => finish(() => reject(new Error("图片元数据读取超时，请确认图片内容有效后重试"))), 3000);
        image.src = dataUrl;
    });
}

export function dataUrlToFile(image: ReferenceImage) {
    const [header, content] = image.dataUrl.split(",", 2);
    const headerMime = header.match(/^data:(image\/[a-z0-9.+-]+);base64$/i)?.[1];
    const declaredMime = /^image\/[a-z0-9.+-]+$/i.test(String(image.type || "").trim()) ? String(image.type).trim() : "";
    const mimeType = headerMime || declaredMime;
    if (!mimeType) throw new Error("参考图缺少有效的图片 MIME；已停止提交");
    if (!content) throw new Error("参考图不是有效的 Base64 图片 DataURL；已停止提交");
    let binary: string;
    try {
        binary = atob(content);
    } catch {
        throw new Error("参考图不是有效的 Base64 图片 DataURL；已停止提交");
    }
    if (!binary.length) throw new Error("参考图 Base64 内容为空；已停止提交");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], image.name || `reference.${imageFileExtension(mimeType)}`, { type: mimeType });
}

function imageFileExtension(mimeType: string) {
    const subtype = mimeType.slice("image/".length).toLowerCase().split("+", 1)[0];
    return subtype === "jpeg" ? "jpg" : subtype || "img";
}
