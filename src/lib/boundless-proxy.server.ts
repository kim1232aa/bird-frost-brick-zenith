import { isIP } from "node:net";
import {
  assertSafeOutboundUrl,
  fetchSafeRedirecting,
  readResponseWithLimit,
} from "./safe-outbound-url.server.ts";

/**
 * Single-tenant local deployments (PGlite, no DATABASE_URL) legitimately point
 * relays at loopback/LAN model servers; hosted multi-tenant deploys keep the
 * SSRF guard strict. RELAY_ALLOW_PRIVATE_TARGETS overrides either way.
 */
function privateRelayTargetsAllowed() {
  const flag = (process.env.RELAY_ALLOW_PRIVATE_TARGETS || "").trim().toLowerCase();
  if (/^(1|true|yes|on)$/u.test(flag)) return true;
  if (/^(0|false|no|off)$/u.test(flag)) return false;
  return !process.env.DATABASE_URL?.trim();
}

/** http is acceptable only for loopback / private-network relay targets. */
function isLocalRelayHttpUrl(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  const family = isIP(hostname);
  if (family === 6) {
    return hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80");
  }
  if (family !== 4) return false;
  const [a, b] = hostname.split(".").map((part) => Number(part));
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

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

// Fixed client control header for selecting an opaque server-vault credential.
const RELAY_CREDENTIAL_ID_HEADER = "x-boundless-relay-credential-id";

const CONTROL_HEADERS = [
  "x-boundless-desktop-token",
  "x-local-relay-base-url",
  "x-local-relay-proxy-url",
  "x-boundless-builtin",
  "x-boundless-relay-id",
  RELAY_CREDENTIAL_ID_HEADER,
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
  let pathOnly = trimmedRelay.split("?")[0] || "";
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
  const joinedHasV1 = parsed.pathname.replace(/\/+$/, "").toLowerCase().endsWith("/v1");
  if (joinedHasV1 && /^v1(\/|$)/i.test(pathOnly)) {
    pathOnly = pathOnly.replace(/^v1\/?/i, "");
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

async function requireServerManagedKeyAccess(requireProductionIdentity = false) {
  const { authConfigured, requireUserId } = await import("./auth/verify.server.ts");
  if (
    requireProductionIdentity &&
    process.env.NODE_ENV === "production" &&
    process.env.DATABASE_URL?.trim()
  ) {
    const { gateIdentityEnabled } = await import("./auth/gate-identity.server.ts");
    const authEnabled = authConfigured === true && process.env.VITE_AUTH_ENABLED?.trim().toLowerCase() !== "false";
    if (!authEnabled && !gateIdentityEnabled()) {
      throw relayRequestError(503, "生产环境普通中转必须启用 auth 或 gate 身份认证");
    }
  }
  await requireUserId();
}

function relayRequestError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function configuredRelayOrigin() {
  const raw = (process.env.BETTER_AUTH_URL || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function forwardedRelayOrigin(request: Request) {
  const forwardedHost = (request.headers.get("x-forwarded-host") || "").trim();
  const forwardedProto = (request.headers.get("x-forwarded-proto") || "").trim().toLowerCase();
  // A comma-separated chain is ambiguous here: without a trusted proxy hop
  // count, accepting any element would let a caller choose the effective host.
  if (!forwardedHost || !forwardedProto || forwardedHost.includes(",") || forwardedProto.includes(",")) return "";
  if (forwardedProto !== "http" && forwardedProto !== "https") return "";
  try {
    const parsed = new URL(`${forwardedProto}://${forwardedHost}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function assertSameOriginRelayRequest(request: Request) {
  const fetchSite = (request.headers.get("sec-fetch-site") || "").trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    throw relayRequestError(403, "中转仅接受同源请求");
  }

  const rawOrigin = (request.headers.get("origin") || "").trim();
  if (!rawOrigin) return;
  try {
    const requestOrigin = new URL(request.url).origin;
    if (new URL(rawOrigin).origin === requestOrigin) return;

    // Forwarded headers alone are untrusted; only the deployer-configured
    // public origin can authorize a rewritten request origin.
    const configured = configuredRelayOrigin();
    const forwarded = forwardedRelayOrigin(request);
    if (configured && forwarded === configured && new URL(rawOrigin).origin === configured) return;
  } catch {
    /* reject malformed browser origins below */
  }
  throw relayRequestError(403, "中转仅接受同源请求");
}

async function attachVaultKey(headers: Headers, relayId: string, credentialId?: string) {
  headers.delete("Authorization");
  headers.delete("x-api-key");
  if (!relayId) throw relayRequestError(401, "普通中转请求缺少 relay-id");
  await requireServerManagedKeyAccess(true);

  let secret: Awaited<ReturnType<typeof import("@/studio/server/relay-vault")["readRelayVaultKey"]>>;
  try {
    const { readRelayVaultKey } = await import("@/studio/server/relay-vault");
    secret = credentialId
      ? await readRelayVaultKey(relayId, credentialId)
      : await readRelayVaultKey(relayId);
  } catch (error) {
    if (errorStatus(error)) throw error;
    if (error instanceof Error && error.message === "Unauthorized") {
      throw relayRequestError(401, "无权读取中转密钥库");
    }
    throw new Error(`密钥库读取失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (!secret?.apiKey) throw relayRequestError(401, "密钥库中转不存在或没有可用 Key");
  const baseUrl = normalizeHttpUrl(secret.baseUrl);
  if (!baseUrl) throw relayRequestError(400, "密钥库中转缺少有效的 Base URL");
  if (new URL(baseUrl).protocol !== "https:" && !isLocalRelayHttpUrl(baseUrl)) {
    throw relayRequestError(400, "密钥库中转 Base URL 必须使用 HTTPS（本机/局域网 http 除外）");
  }
  if (secret.authScheme === "x-api-key") headers.set("x-api-key", secret.apiKey);
  else headers.set("Authorization", `${secret.authScheme} ${secret.apiKey}`);
  return baseUrl;
}

/**
 * Allow a caller-requested base URL only when it stays on the vault-configured
 * origin (e.g. Hugging Face router per-provider paths like /fal-ai/v1 under
 * router.huggingface.co). Cross-origin overrides are ignored so a vault key can
 * never be attached to a host the vault entry did not configure.
 */
function resolveSameOriginBaseOverride(vaultBaseUrl: string, requested: string) {
  const override = normalizeHttpUrl(requested);
  if (!override) return vaultBaseUrl;
  try {
    if (new URL(override).origin === new URL(vaultBaseUrl).origin) return override;
  } catch {
    /* malformed override: fall back to the vault base URL */
  }
  return vaultBaseUrl;
}

export async function proxyLocalRelay(request: Request, splat: string) {
  try {
    assertSameOriginRelayRequest(request);
    const method = (request.method || "GET").toUpperCase();
    let baseUrl = request.headers.get("x-local-relay-base-url") || "";
    const builtin = (request.headers.get("x-boundless-builtin") || "").trim().toLowerCase();
    const relayId = (request.headers.get("x-boundless-relay-id") || "").trim();
    const credentialId = (request.headers.get(RELAY_CREDENTIAL_ID_HEADER) || "").trim();
    const headers = stripHeaders(request.headers);
    headers.delete("Authorization");
    headers.delete("x-api-key");
    if (builtin !== "xai") {
      const requestedBaseUrl = baseUrl;
      baseUrl = await attachVaultKey(headers, relayId, credentialId || undefined);
      baseUrl = resolveSameOriginBaseOverride(baseUrl, requestedBaseUrl);
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
    target = await assertSafeOutboundUrl(target, { allowPrivateNetwork: builtin !== "xai" && privateRelayTargetsAllowed() });

    if (builtin === "xai") {
      const key = process.env.XAI_API_KEY;
      if (!key) return jsonError(503, "当前环境未接入 xAI，请改用自定义中转并填写 API Key");
      await requireServerManagedKeyAccess(true);
      headers.set("Authorization", `Bearer ${key}`);
    } else if (!hasUsableAuth(headers)) {
      return jsonError(401, "中转没有密钥。打开接线确认 Key 已保存，或重新粘贴后再试。");
    }

    const body =
      method === "GET" || method === "HEAD" || method === "OPTIONS"
        ? null
        : Buffer.from(await request.arrayBuffer());
    let response = await forward(method, target, headers, RELAY_TIMEOUT_MS, body);
    if ((method === "GET" || method === "HEAD") && response.status >= 500) {
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

  // This endpoint downloads public media only. Never forward a caller's
  // Authorization header to an arbitrary URL selected by its query string.
  const headers = new Headers();

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
  if ((request.headers.get("x-image-host-key") || "").trim()) {
    return jsonError(400, "图床 Key 必须先保存到后端密钥库；浏览器明文 Key 已被拒绝");
  }
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
  try {
    const { readImageHostVaultKey } = await import("@/studio/server/relay-vault");
    const credential = await readImageHostVaultKey(rawBaseUrl);
    if (credential?.apiKey) headers.set("Authorization", `Bearer ${credential.apiKey}`);
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
    return proxyErrorResponse(error, "图床上传失败，请检查地址、后端密钥库和网络后重试", 502);
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
