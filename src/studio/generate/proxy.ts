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
  provider: Pick<ApiRelayProvider, "baseUrl" | "apiKey" | "apiKeys">;
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
  try {
    const response = await fetch(`/local-relay-proxy${path}`, {
      method,
      headers: {
        ...(method === "GET" || method === "DELETE" ? {} : { "Content-Type": "application/json" }),
        Accept: "application/json",
        ...(scheme === "x-api-key"
          ? { "x-api-key": apiKey || "" }
          : { Authorization: apiKey ? `${scheme} ${apiKey}` : "" }),
        "x-local-relay-base-url": input.baseUrl || input.provider.baseUrl,
        "Accept-Encoding": "identity",
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
    if (response.ok && !looksJson && bytes.length > 256) {
      const blob = new Blob([buffer], { type: contentType.includes("video") ? contentType : "video/mp4" });
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
        const blob = new Blob([buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        return { url, status: "done", video: { url } } as T;
      }
      throw new Error(
        response.ok
          ? `上游返回无法解析（HTTP ${response.status}，${bytes.length} 字节）：${trimmed.slice(0, 180)}`
          : `请求失败 ${response.status}：${trimmed.slice(0, 80) || "非 JSON"}`,
      );
    }
    if (!response.ok) {
      const err = data?.error;
      let message =
        (typeof err === "string" ? err : err?.message) ||
        data?.message ||
        (typeof data === "string" ? data : "") ||
        `请求失败 ${response.status}`;
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

export function firstImageUrl(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const list = Array.isArray(record.data) ? record.data : Array.isArray(record.images) ? record.images : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = String(row.url || row.image_url || "").trim();
    if (url) return url;
    const b64 = String(row.b64_json || row.b64 || "").trim();
    if (b64) return `data:image/png;base64,${b64}`;
  }
  return String(record.url || record.video_url || "").trim();
}
