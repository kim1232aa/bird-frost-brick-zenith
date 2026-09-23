import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { worksStorageDirs } from "./works-path.ts";

export const MAX_WORK_MEDIA_BYTES = 512 * 1024 * 1024;

const WORK_KINDS = new Set(["image", "video", "story", "ecommerce"]);
const MEDIA_TYPES = /^(?:image|video|audio)\/[a-z0-9.+-]+$/i;

type UploadOptions = {
  storageDirs?: readonly string[];
  idFactory?: () => string;
  maxBytes?: number;
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return Response.json(payload, { status });
}

function parseIndex(value: string | null) {
  const trimmed = String(value || "").trim();
  if (!/^[0-7]$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export function extensionForMime(mimeType: string, kind = ""): string {
  const cleanMime = String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
  switch (cleanMime) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    case "image/bmp":
      return "bmp";
    case "image/x-icon":
      return "ico";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/x-msvideo":
      return "avi";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/webm":
      return "weba";
    case "audio/aac":
      return "aac";
    case "audio/flac":
      return "flac";
    case "application/json":
      return "json";
    default: {
      if (cleanMime.startsWith("image/")) {
        const sub = cleanMime.split("/")[1];
        if (sub && /^[a-z0-9]+$/.test(sub)) return sub;
        return "png";
      }
      if (cleanMime.startsWith("video/")) {
        return cleanMime.includes("webm") ? "webm" : "mp4";
      }
      if (cleanMime.startsWith("audio/")) {
        return cleanMime.includes("wav") ? "wav" : cleanMime.includes("ogg") ? "ogg" : "mp3";
      }
      if (kind === "video") return "mp4";
      if (kind === "audio") return "mp3";
      return "bin";
    }
  }
}

function extensionFor(kind: string, mimeType: string) {
  return extensionForMime(mimeType, kind);
}

async function readRequestBytes(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") || "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`作品媒体超过 ${maxBytes} 字节上限`);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`作品媒体超过 ${maxBytes} 字节上限`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function uploadStudioWorkMedia(
  request: Request,
  options: UploadOptions = {},
) {
  if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "不支持的请求方法" });

  const kind = String(request.headers.get("x-work-kind") || "").trim().toLowerCase();
  const index = parseIndex(request.headers.get("x-work-index"));
  const mimeType = String(request.headers.get("content-type") || "application/octet-stream")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (mimeType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { remoteUrl?: string; kind?: string; index?: number };
    const remoteUrl = String(body.remoteUrl || "").trim();
    if (!remoteUrl || (!remoteUrl.startsWith("http://") && !remoteUrl.startsWith("https://"))) {
      return jsonResponse(400, { ok: false, error: "无效的 remoteUrl" });
    }
    let remoteResp: Response | null = null;
    let fetchError: unknown = null;
    try {
      remoteResp = await fetch(remoteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "Accept": "image/*,video/*,*/*",
        },
      });
    } catch (err) {
      fetchError = err;
      console.warn("下载远程媒体网络异常：", err);
    }
    if (!remoteResp) {
      return jsonResponse(502, {
        ok: false,
        error: `下载远程媒体失败：网络连接异常 (${fetchError instanceof Error ? fetchError.message : String(fetchError)})`,
      });
    }
    if (!remoteResp.ok) {
      const status = remoteResp.status >= 400 && remoteResp.status < 500 ? remoteResp.status : 502;
      return jsonResponse(status, {
        ok: false,
        error: `下载远程媒体失败：上游服务返回 HTTP ${remoteResp.status}`,
      });
    }
    const remoteMime = remoteResp.headers.get("content-type") || "image/jpeg";
    const bytes = new Uint8Array(await remoteResp.arrayBuffer());
    const ext = extensionFor(kind || "image", remoteMime);
    const idFactory = options.idFactory || randomUUID;
    const filename = `media-${idFactory()}.${ext}`;
    const directories = options.storageDirs || worksStorageDirs();
    let written = 0;
    for (const dir of directories) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, filename), bytes);
        written++;
      } catch (err) {
        console.warn(`写入作品目录 ${dir} 失败:`, err);
      }
    }
    if (written === 0) {
      return jsonResponse(500, {
        ok: false,
        error: "远程媒体未能成功写入任何存储目录",
      });
    }
    return jsonResponse(200, {
      ok: true,
      url: `/works/${filename}`,
      filename,
      bytes: bytes.byteLength,
      mimeType: remoteMime,
    });
  }
  if (!WORK_KINDS.has(kind) || index === undefined || (!MEDIA_TYPES.test(mimeType) && mimeType !== "application/octet-stream")) {
    return jsonResponse(400, { ok: false, error: "作品媒体类型或序号无效" });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readRequestBytes(request, options.maxBytes ?? MAX_WORK_MEDIA_BYTES);
  } catch (error) {
    return jsonResponse(413, {
      ok: false,
      error: error instanceof Error ? error.message : "作品媒体超过大小上限",
    });
  }
  if (!bytes.byteLength) return jsonResponse(400, { ok: false, error: "作品媒体为空" });

  const id = String(options.idFactory?.() || randomUUID()).trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) {
    return jsonResponse(500, { ok: false, error: "作品媒体内部标识无效" });
  }
  const filename = `${id}-${index}.${extensionFor(kind, mimeType)}`;
  const directories = options.storageDirs || worksStorageDirs();
  let written = false;
  let lastError: unknown;
  for (const directory of directories) {
    const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, join(directory, filename));
      written = true;
    } catch (error) {
      lastError = error;
      await unlink(temporary).catch(() => undefined);
    }
  }
  if (!written) {
    return jsonResponse(500, {
      ok: false,
      error: lastError instanceof Error ? `作品媒体写入失败：${lastError.message}` : "作品媒体写入失败",
    });
  }

  return jsonResponse(200, {
    ok: true,
    url: `/works/${filename}`,
    bytes: bytes.byteLength,
    mimeType,
  });
}
