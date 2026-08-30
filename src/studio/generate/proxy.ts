import { providerHasUsableCredential, type ApiRelayProvider } from "../../stores/api-relay-config.ts";
import { sniffMedia } from "../adapters/contracts.ts";
import { decompress as zstdDecompress } from "fzstd";

async function inflateIfNeeded(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 3 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
    try {
      const out = zstdDecompress(bytes);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    } catch {
      /* fall through */
    }
  }
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream === "function") {
    try {
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).arrayBuffer();
    } catch {
      return buffer;
    }
  }
  return buffer;
}

function mediaSubtype(contentType: string) {
  return String(contentType || "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
}

function looksLikeJsonBytes(bytes: Uint8Array) {
  let i = 0;
  while (i < bytes.length && bytes[i]! <= 32) i += 1;
  const start = bytes[i];
  return start === 0x7b || start === 0x5b || start === 0x22;
}

function isMediaMime(value: string) {
  return value.startsWith("audio/") || value.startsWith("video/") || value.startsWith("image/");
}

function classifiedMediaType(contentType: string, bytes: Uint8Array, sniff: (bytes: Uint8Array) => string) {
  const sniffed = String(sniff(bytes) || "").trim().toLowerCase();
  if (isMediaMime(sniffed)) return sniffed;
  const type = mediaSubtype(contentType);
  if (type.startsWith("audio/") || type.startsWith("video/")) return type;
  return "";
}

function wrapStudioMedia<T>(mime: string, url: string): T {
  if (mime.startsWith("video/")) return { url, status: "done", video: { url } } as T;
  return { url } as T;
}

function unrecognizedStudioProxyBody(status: number, contentType: string, trimmed: string, looksJson: boolean) {
  const type = mediaSubtype(contentType) || "unknown";
  if (looksJson) {
    return `HTTP ${status} 返回的 JSON 无法解析（content-type: ${type}）。${trimmed.slice(0, 200)}`;
  }
  const preview = trimmed.slice(0, 200);
  const hint = preview ? `：${preview}` : "";
  return `HTTP ${status} 成功响应不是 JSON，也不是可识别的音频/视频/图片（content-type: ${type}）${hint}`;
}

export function parseStudioProxyBody<T = unknown>(input: {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: Uint8Array;
  sniffMedia: (bytes: Uint8Array) => string;
  createObjectUrl: (blob: Blob) => string;
}): T {
  const bytes = input.bytes;
  const looksJson = looksLikeJsonBytes(bytes);
  const mime = looksJson ? "" : classifiedMediaType(input.contentType, bytes, input.sniffMedia);
  if (input.ok && mime && bytes.length > 32) {
    const url = input.createObjectUrl(new Blob([bytes.slice()], { type: mime }));
    return wrapStudioMedia<T>(mime, url);
  }
  const raw = new TextDecoder("utf-8").decode(bytes);
  const trimmed = raw.trim();
  let data = {} as T & { error?: { message?: string; code?: string } | string; message?: string };
  try {
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith('"')) {
      throw new Error("not-json");
    }
    data = JSON.parse(trimmed) as typeof data;
  } catch {
    if (input.ok) {
      throw new Error(unrecognizedStudioProxyBody(input.status, input.contentType, trimmed, looksJson));
    }
    throw new Error(upstreamErrorText(input.status, trimmed));
  }
  if (!input.ok) {
    throw new Error(upstreamErrorText(input.status, trimmed));
  }
  return data;
}

export async function studioProxyJson<T = unknown>(input: {
  provider: Pick<ApiRelayProvider, "baseUrl" | "apiKey" | "apiKeys"> & { id?: string };
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  authScheme?: "Bearer" | "Key" | "x-api-key";
  baseUrl?: string;
  accept?: string;
  extraHeaders?: Record<string, string>;
}): Promise<T> {
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  const { rotateRelayApiKey } = await import("../../services/api/relay-proxy.ts");
  const apiKey = rotateRelayApiKey(input.provider as ApiRelayProvider) || input.provider.apiKey;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), input.timeoutMs || 120_000);
  const scheme = input.authScheme || "Bearer";
  const method = input.method || "POST";
  const baseUrl = input.baseUrl || input.provider.baseUrl;
  let builtinHeader: Record<string, string> = {};
  try {
    if (new URL(baseUrl).hostname.toLowerCase() === "api.x.ai") {
      builtinHeader = { "x-boundless-builtin": "xai" };
    }
  } catch {
    /* ignore invalid base */
  }
  try {
    const response = await fetch(`/local-relay-proxy${path}`, {
      method,
      headers: {
        ...(method === "GET" || method === "DELETE" ? {} : { "Content-Type": "application/json" }),
        Accept: input.accept || "application/json",
        ...(scheme === "x-api-key"
          ? { "x-api-key": apiKey || "" }
          : { Authorization: apiKey ? `${scheme} ${apiKey}` : "" }),
        "x-local-relay-base-url": baseUrl,
        ...(input.provider.id ? { "x-boundless-relay-id": input.provider.id } : {}),
        "Accept-Encoding": "identity",
        ...builtinHeader,
        ...(input.extraHeaders || {}),
      },
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(input.body ?? {}),
      signal: controller.signal,
    });
    const buffer = await inflateIfNeeded(await response.arrayBuffer());
    return parseStudioProxyBody<T>({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      bytes: new Uint8Array(buffer),
      sniffMedia,
      createObjectUrl: (blob) => URL.createObjectURL(blob),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
      throw new Error("请求超时或被中断，请再试一次。");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export function providerById(id: string, relays: ApiRelayProvider[]) {
  const found = relays.find((item) => item.id === id && (item.enabled || providerHasUsableCredential(item)));
  if (!found) throw new Error(`没有启用的中转：${id}。到接线页填密钥并打开开关。`);
  return found;
}

function upstreamErrorText(status: number, raw: string) {
  const text = String(raw || "").trim();
  if (!text) return `HTTP ${status}`;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return text.slice(0, 2000);
    }
  }
  return text.slice(0, 2000);
}

function pushUrl(out: string[], value: unknown) {
  if (typeof value === "string") {
    const text = value.trim();
    if (/^https?:\/\//i.test(text) || text.startsWith("data:image/") || text.startsWith("blob:")) out.push(text);
    return;
  }
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  const url = String(row.url || row.image_url || row.image || "").trim();
  if (url) {
    out.push(url);
    return;
  }
  const b64 = String(row.b64_json || row.b64 || "").trim();
  if (b64) out.push(`data:image/png;base64,${b64}`);
}

export function allImageUrls(data: unknown): string[] {
  if (!data) return [];
  if (typeof data === "string") {
    const text = data.trim();
    return /^https?:\/\//i.test(text) || text.startsWith("data:image/") || text.startsWith("blob:") ? [text] : [];
  }
  if (typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const out: string[] = [];
  const lists = [record.data, record.images, record.output_images, record.outputImages, record.urls, record.outputs];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) pushUrl(out, item);
  }
  const output = record.output && typeof record.output === "object" ? (record.output as Record<string, unknown>) : undefined;
  if (output) out.push(...allImageUrls(output));
  const outputs = record.outputs && typeof record.outputs === "object" && !Array.isArray(record.outputs) ? (record.outputs as Record<string, unknown>) : undefined;
  if (outputs) out.push(...allImageUrls(outputs));
  pushUrl(out, record.url || record.image_url);
  return Array.from(new Set(out.filter(Boolean)));
}

export function firstImageUrl(data: unknown): string {
  return allImageUrls(data)[0] || "";
}
