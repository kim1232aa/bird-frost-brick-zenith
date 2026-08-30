import {
  assertSafeOutboundUrl,
  fetchSafeRedirecting,
  readResponseWithLimit,
} from "./safe-outbound-url.server.ts";

const RELAY_TIMEOUT_MS = 10 * 60 * 1000;
const FETCH_URL_TIMEOUT_MS = 2 * 60 * 1000;
const IMAGE_HOST_TIMEOUT_MS = 60 * 1000;
const MAX_FETCH_BYTES = 2 * 1024 * 1024 * 1024;

const HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "origin",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "content-length",
  "cookie",
  "set-cookie",
  "clear-site-data",
  "forwarded",
];

const CONTROL_HEADERS = [
  "x-boundless-desktop-token",
  "x-local-relay-base-url",
  "x-local-relay-proxy-url",
  "x-boundless-builtin",
  "x-boundless-relay-id",
  "x-image-host-base-url",
  "x-image-host-key",
  "x-grok-identity",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
];

export function jsonError(status: number, message: string) {
  return Response.json({ message, error: { message } }, { status });
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string; name?: string } };
  const code = record.code || record.cause?.code || "";
  const name = record.name || record.cause?.name || "";
  const message = `${record.message || ""} ${record.cause?.message || ""}`;
  return code === "ECONNRESET" || code === "EPIPE" || code === "ABORT_ERR" || name === "AbortError" || /aborted|abort/i.test(message);
}

function abortOrProxyError(error: unknown, fallback: string) {
  if (isAbortError(error)) return new Response(null, { status: 499, statusText: "Client Closed Request" });
  return proxyErrorResponse(error, fallback);
}

function proxyErrorResponse(error: unknown, fallback: string, defaultStatus = 500) {
  const status = errorStatus(error) || defaultStatus;
  const message = error instanceof Error && error.message.trim() ? error.message : fallback;
  return jsonError(status, message);
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const status = Number((error as { status?: unknown }).status);
  if (Number.isInteger(status) && status >= 400 && status < 600) return status;
  if (error instanceof Error && /^Auth is disabled .*DATABASE_URL is set/u.test(error.message)) return 503;
  return 0;
}

function stripHeaders(headers: Headers, extra: string[] = []) {
  const next = new Headers();
  const blocked = new Set([...HOP_HEADERS, ...CONTROL_HEADERS, ...extra].map((name) => name.toLowerCase()));
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (blocked.has(lower)) return;
    if (lower.startsWith("access-control-allow-")) return;
    if (lower.startsWith("x-webdav-") || lower.startsWith("x-forwarded-") || lower.startsWith("x-boundless-")) return;
    next.append(key, value);
  });
  return next;
}

function normalizeHttpUrl(raw: string) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  return parsed.toString().replace(/\/+$/, "");
}

function isCivitaiOrchestration(url: URL) {
  return url.hostname.toLowerCase() === "orchestration.civitai.com";
}

function isOfficialAgnesHost(url: URL) {
  return url.hostname.toLowerCase() === "apihub.agnes-ai.com";
}

function isOfficialNativeRelayPath(url: URL, relayPath: string) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const path = relayPath.toLowerCase();
  return (
    ((host === "dashscope.aliyuncs.com" || host === "token-plan.cn-beijing.maas.aliyuncs.com") &&
      (path === "api/v1" || path.startsWith("api/v1/"))) ||
    (host === "fal.run" && (path === "fal-ai" || path.startsWith("fal-ai/")))
  );
}

function applyRelaySearch(target: URL, relayPath: string, search: string) {
  const queryIndex = relayPath.indexOf("?");
  const fromPath = queryIndex >= 0 ? relayPath.slice(queryIndex + 1) : "";
  const fromSearch = search.startsWith("?") ? search.slice(1) : search;
  const merged = new URLSearchParams(fromPath);
  new URLSearchParams(fromSearch).forEach((value, key) => {
    merged.set(key, value);
  });
  target.search = merged.toString();
}

export function buildRelayTarget(baseUrl: string, relayPath: string, search: string) {
  const normalized = normalizeHttpUrl(baseUrl);
  if (!normalized) throw new Error("自定义 API Base URL 无效");
  const parsed = new URL(normalized);
  const trimmedRelay = String(relayPath || "").replace(/^\/+|\/+$/g, "");
  const lowerRelay = trimmedRelay.toLowerCase();
  const pathOnly = trimmedRelay.split("?")[0] || "";
  const relayName = (lowerRelay.split("?")[0] || "").replace(/\/+$/, "");

  if (isCivitaiOrchestration(parsed) && (lowerRelay === "services" || lowerRelay.startsWith("services?"))) {
    parsed.pathname = "/v2/services";
    parsed.search = search.startsWith("?") ? search.slice(1) : search;
    return parsed;
  }

  if (isCivitaiOrchestration(parsed) && parsed.pathname.replace(/\/+$/, "") === "") {
    parsed.pathname = "/v2/consumer";
  }

  if (isOfficialAgnesHost(parsed) && relayName === "agnesapi") {
    parsed.pathname = "/agnesapi";
    applyRelaySearch(parsed, trimmedRelay, search);
    return parsed;
  }

  const lowerPath = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  const hasApiSuffix =
    lowerPath.endsWith("/v1") ||
    lowerPath.endsWith("/api/v3") ||
    lowerPath.endsWith("/api/plan/v3") ||
    (isCivitaiOrchestration(parsed) && lowerPath.endsWith("/v2"));
  const keepsNativePath = isOfficialNativeRelayPath(parsed, pathOnly);
  if (keepsNativePath) {
    parsed.pathname = "/";
  } else if (!hasApiSuffix && !isCivitaiOrchestration(parsed)) {
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/v1`;
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${pathOnly}`.replace(/\/+$/, "") || "/";
  applyRelaySearch(parsed, trimmedRelay, search);
  return parsed;
}

function hasUsableAuth(headers: Headers) {
  const apiKey = (headers.get("x-api-key") || "").trim();
  if (apiKey) return true;
  const auth = (headers.get("Authorization") || "").trim();
  if (!auth) return false;
  return Boolean(auth.replace(/^(Bearer|Key)\s+/i, "").trim());
}

async function requireServerManagedKeyAccess() {
  const { requireUserId } = await import("./auth/verify.server.ts");
  await requireUserId();
}

async function attachVaultKey(headers: Headers, relayId: string, fallbackBaseUrl: string) {
  if (!relayId || hasUsableAuth(headers)) return fallbackBaseUrl;
  await requireServerManagedKeyAccess();
  try {
    const { readRelayVaultKey } = await import("@/studio/server/relay-vault");
    const secret = await readRelayVaultKey(relayId);
    if (!secret?.apiKey) return fallbackBaseUrl;
    if (secret.authScheme === "x-api-key") headers.set("x-api-key", secret.apiKey);
    else headers.set("Authorization", `${secret.authScheme} ${secret.apiKey}`);
    if (!secret.baseUrl) throw new Error("密钥库中转缺少有效的 Base URL");
    return secret.baseUrl;
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") throw error;
    throw new Error(`密钥库读取失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function proxyLocalRelay(request: Request, splat: string) {
  try {
    const method = (request.method || "GET").toUpperCase();
    let baseUrl = request.headers.get("x-local-relay-base-url") || "";
    const builtin = (request.headers.get("x-boundless-builtin") || "").trim().toLowerCase();
    const relayId = (request.headers.get("x-boundless-relay-id") || "").trim();
    const headers = stripHeaders(request.headers);
    if (builtin !== "xai") {
      baseUrl = await attachVaultKey(headers, relayId, baseUrl);
    }

    let target: URL;
    try {
      target = buildRelayTarget(baseUrl, splat, new URL(request.url).search);
    } catch (error) {
      return jsonError(400, error instanceof Error ? error.message : "自定义 API Base URL 无效");
    }

    if (builtin === "xai") {
      try {
        assertPinnedXaiUrl(target);
      } catch (error) {
        return proxyErrorResponse(error, "内置 xAI 通道只能转发到 api.x.ai", 400);
      }
    }
    target = await assertSafeOutboundUrl(target);

    if (builtin === "xai") {
      const key = process.env.XAI_API_KEY;
      if (!key) return jsonError(503, "当前环境未接入 xAI，请改用自定义中转并填写 API Key");
      await requireServerManagedKeyAccess();
      headers.set("Authorization", `Bearer ${key}`);
    } else if (!hasUsableAuth(headers)) {
      return jsonError(401, "中转没有密钥。打开接线确认 Key 已保存，或重新粘贴后再试。");
    }

    const body =
      method === "GET" || method === "HEAD" || method === "OPTIONS"
        ? null
        : Buffer.from(await request.arrayBuffer());
    let response = await forward(method, target, headers, RELAY_TIMEOUT_MS, body);
    if (response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      response = await forward(method, target, headers, RELAY_TIMEOUT_MS, body);
    }
    return response;
  } catch (error) {
    return abortOrProxyError(error, "中转转发失败");
  }
}

export async function proxyWebDav(request: Request) {
  const rawTarget = normalizeHttpUrl(request.headers.get("x-webdav-target") || "");
  if (!rawTarget) return jsonError(400, "WebDAV 目标地址无效");
  let targetUrl: URL;
  try {
    targetUrl = await assertSafeOutboundUrl(rawTarget);
  } catch (error) {
    return proxyErrorResponse(error, "WebDAV 目标地址无效或指向受保护的网络", 400);
  }

  const method = (request.headers.get("x-webdav-method") || request.method || "GET").toUpperCase();
  const allowed = new Set(["GET", "HEAD", "PUT", "DELETE", "MKCOL", "PROPFIND", "MOVE", "COPY"]);
  if (!allowed.has(method)) return jsonError(400, "不支持的 WebDAV 请求方法");
  const headers = stripHeaders(request.headers);
  const mappings: Record<string, string> = {
    "x-webdav-authorization": "Authorization",
    "x-webdav-depth": "Depth",
    "x-webdav-destination": "Destination",
    "x-webdav-overwrite": "Overwrite",
    "x-webdav-content-type": "Content-Type",
  };
  for (const [source, dest] of Object.entries(mappings)) {
    const value = request.headers.get(source);
    if (value) headers.set(dest, value);
  }
  const destination = headers.get("Destination");
  if (destination) {
    try {
      await assertSafeOutboundUrl(new URL(destination, targetUrl));
    } catch (error) {
      return proxyErrorResponse(error, "WebDAV 目标地址无效或指向受保护的网络", 400);
    }
  }

  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }
  try {
    const upstream = await fetchSafeRedirecting(targetUrl, init, { maxRedirects: 5 });
    return await toClientResponse(upstream);
  } catch (error) {
    return proxyErrorResponse(error, "无法连接 WebDAV 服务，请检查地址和网络后重试", 502);
  }
}

export async function proxyFetchUrl(request: Request) {
  if (request.method !== "GET") return jsonError(405, "不支持的请求方法");
  const raw = new URL(request.url).searchParams.get("url") || "";
  let parsed: URL;
  try {
    parsed = await assertSafeOutboundUrl(raw);
  } catch (error) {
    return proxyErrorResponse(error, "资源地址无效或指向受保护的网络", 400);
  }

  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  if (authorization) headers.set("Authorization", authorization);

  try {
    const upstream = await fetchSafeRedirecting(
      parsed,
      {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_URL_TIMEOUT_MS),
      },
      { maxRedirects: 5 },
    );
    if (!upstream.ok) return jsonError(upstream.status, `资源下载失败（${upstream.status}）`);
    return await toClientResponse(upstream);
  } catch (error) {
    if (errorStatus(error) === 413) return jsonError(413, "资源文件超过 2 GiB 安全上限");
    return proxyErrorResponse(error, "资源下载失败，请检查地址和网络后重试", 502);
  }
}

export async function proxyImageHostUpload(request: Request) {
  if (request.method !== "POST") return jsonError(405, "不支持的请求方法");
  const rawBaseUrl = normalizeHttpUrl(request.headers.get("x-image-host-base-url") || "");
  if (!rawBaseUrl) return jsonError(400, "图床地址无效");

  let targetUrl: URL;
  try {
    const baseUrl = await assertSafeOutboundUrl(rawBaseUrl);
    targetUrl = new URL(baseUrl.href);
    const basePath = baseUrl.pathname.replace(/\/+$/, "");
    targetUrl.pathname = `${basePath}/api/upload`;
    targetUrl.search = "";
    targetUrl.hash = "";
    targetUrl = await assertSafeOutboundUrl(targetUrl);
  } catch (error) {
    return proxyErrorResponse(error, "图床地址无效或指向受保护的网络", 400);
  }

  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  const apiKey = (request.headers.get("x-image-host-key") || "").trim();
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  try {
    const upstream = await fetchSafeRedirecting(
      targetUrl,
      {
        method: "POST",
        headers,
        body: request.body,
        duplex: "half",
        redirect: "manual",
        signal: AbortSignal.timeout(IMAGE_HOST_TIMEOUT_MS),
      } as RequestInit & { duplex?: string },
      { maxRedirects: 5 },
    );
    return await toClientResponse(upstream);
  } catch (error) {
    return proxyErrorResponse(error, "图床上传失败，请检查地址和网络后重试", 502);
  }
}

async function forward(method: string, target: URL, headers: Headers, timeoutMs: number, body?: Buffer | null) {
  if (!headers.has("user-agent")) {
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );
  }
  if (!headers.has("accept")) headers.set("Accept", "application/json, */*");
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body && body.length && method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(body);
  }
  try {
    const redirectOptions = isXaiHost(target)
      ? { maxRedirects: 5, validateRedirect: assertPinnedXaiUrl }
      : { maxRedirects: 5 };
    const upstream = await fetchSafeRedirecting(target, init, redirectOptions);
    return await toClientResponse(upstream);
  } catch (error) {
    const status = errorStatus(error);
    if (status) return proxyErrorResponse(error, "无法连接上游服务，请检查网络或代理后重试", 502);
    const host = target.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return jsonError(502, loopback ? "无法连接本机中转服务，请确认服务正在运行后重试" : "无法连接上游服务，请检查网络或代理后重试");
  }
}

function isXaiHost(url: URL) {
  return url.hostname.toLowerCase().replace(/\.$/, "") === "api.x.ai";
}

function assertPinnedXaiUrl(url: URL) {
  if (!isXaiHost(url)) {
    const error = new Error("内置 xAI 通道只能转发到 api.x.ai") as Error & { status: number };
    error.status = 400;
    throw error;
  }
  if (url.protocol !== "https:") {
    const error = new Error("内置 xAI 通道必须使用 HTTPS") as Error & { status: number };
    error.status = 400;
    throw error;
  }
  return url;
}

async function toClientResponse(upstream: Response) {
  const headers = stripHeaders(upstream.headers, [
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "set-cookie",
    "clear-site-data",
  ]);
  const buffer = Buffer.from(await readResponseWithLimit(upstream, MAX_FETCH_BYTES));
  headers.set("content-length", String(buffer.byteLength));
  headers.delete("content-encoding");
  return new Response(buffer, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export function healthPayload() {
  return {
    ok: true,
    service: "boundless-studio",
    xai: Boolean(process.env.XAI_API_KEY?.trim()),
    seeded: {
      civitai: Boolean(process.env.CIVITAI_API_KEY?.trim() || process.env.CIVITAI_TOKEN?.trim()),
      fal: Boolean(process.env.FAL_KEY?.trim()),
      grokRelay: Boolean(process.env.GROK_RELAY_API_KEY?.trim()),
      openaiCompat: Boolean(process.env.OPENAI_COMPAT_API_KEY?.trim()),
    },
  };
}
