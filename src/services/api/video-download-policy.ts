export const VIDEO_RESULT_DOWNLOAD_TIMEOUT_MS = 300_000;

export class InvalidVideoResponseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidVideoResponseError";
    }
}

export async function assertVideoResponseBlob(blob: Blob) {
    if (!blob.size) throw new InvalidVideoResponseError("视频下载返回了空文件");
    const contentType = String(blob.type || "").toLowerCase().split(";", 1)[0].trim();
    if (contentType.includes("json")) {
        let payload: { code?: number; msg?: string; message?: string; error?: { message?: string } };
        try {
            payload = JSON.parse(await blob.text()) as typeof payload;
        } catch {
            throw new InvalidVideoResponseError("视频下载返回了无效 JSON，而不是视频文件");
        }
        throw new InvalidVideoResponseError(payload.error?.message || payload.message || payload.msg || "视频下载返回了 JSON，而不是视频文件");
    }
    if (contentType.startsWith("text/") || contentType.includes("html") || contentType.includes("xml")) {
        throw new InvalidVideoResponseError(`视频下载返回了 ${contentType || "文本"}，而不是视频文件`);
    }
    if (contentType.startsWith("video/")) return;
    const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (hasKnownVideoSignature(header)) return;
    throw new InvalidVideoResponseError(`视频下载返回了不支持的文件类型${contentType ? `（${contentType}）` : ""}`);
}

function hasKnownVideoSignature(bytes: Uint8Array) {
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
    if (bytes.length >= 8 && ascii(4, 4) === "ftyp") return true;
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true;
    if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "AVI ") return true;
    if (bytes.length >= 3 && ascii(0, 3) === "FLV") return true;
    if (bytes.length >= 4 && ascii(0, 4) === "OggS") return true;
    return bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && (bytes[3] === 0xba || bytes[3] === 0xb3);
}
