import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { rotateRelayApiKey } from "@/services/api/relay-proxy";
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

export async function studioProxyJson<T = unknown>(input: {
  provider: Pick<ApiRelayProvider, "baseUrl" | "apiKey" | "apiKeys"> & { id?: string };
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  authScheme?: "Bearer" | "Key" | "x-api-key";
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
}): Promise<T> {
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
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
        Accept: "application/json",
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
    const bytes = new Uint8Array(buffer);
    let i = 0;
    while (i < bytes.length && bytes[i] <= 32) i += 1;
    const start = bytes[i];
    const looksJson = start === 0x7b || start === 0x5b || start === 0x22;
    const contentType = response.headers.get("content-type") || "";
    const sniffed = sniffMedia(bytes);
    if (response.ok && !looksJson && bytes.length > 32 && sniffed) {
      const blob = new Blob([bytes.slice()], { type: sniffed });
      const url = URL.createObjectURL(blob);
      return { url, status: "done", video: sniffed.startsWith("video/") ? { url } : undefined } as T;
    }
    if (response.ok && !looksJson && bytes.length > 256) {
      const blob = new Blob([bytes.slice()], { type: contentType.includes("video") ? contentType : "video/mp4" });
      const url = URL.createObjectURL(blob);
      return { url, status: "done", video: { url } } as T;
    }
    const raw = new TextDecoder("utf-8").decode(buffer);
    if (/cloudflare|attention required|access denied/i.test(raw) && !raw.trim().startsWith("{")) {
      throw new Error("中转被 Cloudflare 拦截（403）。换浏览器网络或换 Provider 再试。");
    }
    const trimmed = raw.trim();
    let data = {} as T & { error?: { message?: string; code?: string } | string; message?: string };
    try {
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith('"')) {
        throw new Error("not-json");
      }
      data = JSON.parse(trimmed) as typeof data;
    } catch {
      if (response.ok && bytes.length > 256) {
        const blob = new Blob([bytes.slice()], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        return { url, status: "done", video: { url } } as T;
      }
      throw new Error(
        response.ok
          ? `上游返回无法解析（HTTP ${response.status}，${bytes.length} 字节）：${trimmed.slice(0, 180)}`
          : `中转返回 ${response.status}${trimmed ? `：${trimmed.slice(0, 80)}` : "，没有错误详情。请再试一次。"}`,
      );
    }
    if (!response.ok) {
      const err = data?.error;
      let message =
        (typeof err === "string" ? err : err && typeof err === "object" ? err.message : "") ||
        data?.message ||
        (typeof data === "string" ? data : "") ||
        "";
      if (!message.trim() || (data as { unhandled?: boolean }).unhandled) {
        message =
          response.status >= 500
            ? `中转返回 ${response.status}。请再试一次，或换 grok-imagine-image-quality 再出一张。`
            : `请求失败 ${response.status}`;
      }
      if (/insufficientBuzz/i.test(message) || /insufficientBuzz/i.test(raw)) {
        message = "Civitai Yellow Buzz 不足。充值后再试，或换 SuperXihe / 火山已接线模型。";
      }
      throw new Error(message);
    }
    return data;
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
  const found = relays.find((item) => item.id === id && (item.enabled || Boolean(item.apiKey)));
  if (!found) throw new Error(`没有启用的中转：${id}。到接线页填密钥并打开开关。`);
  return found;
}

function sniffMedia(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
  return "";
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
