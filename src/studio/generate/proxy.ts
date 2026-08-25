import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { rotateRelayApiKey } from "@/services/api/relay-proxy";

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
  try {
    const response = await fetch(`/local-relay-proxy${path}`, {
      method: input.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...(scheme === "x-api-key"
          ? { "x-api-key": apiKey || "" }
          : { Authorization: apiKey ? `${scheme} ${apiKey}` : "" }),
        "x-local-relay-base-url": input.baseUrl || input.provider.baseUrl,
        "Accept-Encoding": "identity",
        ...(input.extraHeaders || {}),
      },
      body: input.method === "GET" || input.method === "DELETE" ? undefined : JSON.stringify(input.body ?? {}),
      signal: controller.signal,
    });
    const raw = await response.text();
    const jsonStart = raw.search(/[{[]/);
    const jsonText = jsonStart >= 0 ? raw.slice(jsonStart) : raw;
    let data = {} as T & { error?: { message?: string; code?: string } | string; message?: string };
    try {
      data = (jsonText ? JSON.parse(jsonText) : {}) as typeof data;
    } catch {
      throw new Error(response.ok ? `上游返回无法解析：${raw.slice(0, 160)}` : `请求失败 ${response.status}`);
    }
    if (!response.ok) {
      const err = data?.error;
      const message =
        (typeof err === "string" ? err : err?.message) ||
        data?.message ||
        `请求失败 ${response.status}`;
      throw new Error(message);
    }
    return data;
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
