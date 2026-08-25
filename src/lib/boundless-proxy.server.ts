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
];

const CONTROL_HEADERS = [
  "x-boundless-desktop-token",
  "x-local-relay-base-url",
  "x-local-relay-proxy-url",
  "x-boundless-builtin",
  "x-image-host-base-url",
  "x-image-host-key",
];

export function jsonError(status: number, message: string) {
  return Response.json({ message, error: { message } }, { status });
}

function stripHeaders(headers: Headers, extra: string[] = []) {
  const next = new Headers();
  const blocked = new Set([...HOP_HEADERS, ...CONTROL_HEADERS, ...extra].map((name) => name.toLowerCase()));
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (blocked.has(lower)) return;
    if (lower.startsWith("access-control-allow-")) return;
    if (lower.startsWith("x-webdav-")) return;
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

export function buildRelayTarget(baseUrl: string, relayPath: string, search: string) {
  const normalized = normalizeHttpUrl(baseUrl);
  if (!normalized) throw new Error("自定义 API Base URL 无效");
  const parsed = new URL(normalized);
  const trimmedRelay = String(relayPath || "").replace(/^\/+|\/+$/g, "");
  const lowerRelay = trimmedRelay.toLowerCase();

  if (isCivitaiOrchestration(parsed) && (lowerRelay === "services" || lowerRelay.startsWith("services?"))) {
    parsed.pathname = "/v2/services";
    parsed.search = search.startsWith("?") ? search.slice(1) : search;
    return parsed;
  }

  if (isCivitaiOrchestration(parsed) && parsed.pathname.replace(/\/+$/, "") === "") {
    parsed.pathname = "/v2/consumer";
  }

  const lowerPath = parsed.pathname.replace(/\/+$/, "").toLowerCase();
  const hasApiSuffix =
    lowerPath.endsWith("/v1") ||
    lowerPath.endsWith("/api/v3") ||
    lowerPath.endsWith("/api/plan/v3") ||
    (isCivitaiOrchestration(parsed) && lowerPath.endsWith("/v2"));
  if (!hasApiSuffix && !isCivitaiOrchestration(parsed)) {
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/v1`;
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${trimmedRelay}`.replace(/\/+$/, "") || "/";
  parsed.search = search.startsWith("?") ? search.slice(1) : search;
  return parsed;
}

export async function proxyLocalRelay(request: Request, splat: string) {
  const baseUrl = request.headers.get("x-local-relay-base-url") || "";
  const builtin = (request.headers.get("x-boundless-builtin") || "").trim().toLowerCase();
  let target: URL;
  try {
    target = buildRelayTarget(baseUrl, splat, new URL(request.url).search);
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "自定义 API Base URL 无效");
  }

  const headers = stripHeaders(request.headers);
  if (builtin === "xai") {
    if (target.hostname.toLowerCase() !== "api.x.ai") {
      return jsonError(400, "内置 xAI 通道只能转发到 api.x.ai");
    }
    const key = process.env.XAI_API_KEY;
    if (!key) return jsonError(503, "当前环境未接入 xAI，请改用自定义中转并填写 API Key");
    headers.set("Authorization", `Bearer ${key}`);
  }

  return forward(request, target, headers, RELAY_TIMEOUT_MS);
}

export async function proxyWebDav(request: Request) {
  const targetUrl = normalizeHttpUrl(request.headers.get("x-webdav-target") || "");
  if (!targetUrl) return jsonError(400, "WebDAV 目标地址无效");
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
    const upstream = await fetch(targetUrl, init);
    return toClientResponse(upstream);
  } catch {
    return jsonError(502, "无法连接 WebDAV 服务，请检查地址和网络后重试");
  }
}

export async function proxyFetchUrl(request: Request) {
  if (request.method !== "GET") return jsonError(405, "不支持的请求方法");
  const raw = new URL(request.url).searchParams.get("url") || "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return jsonError(400, "资源地址无效或指向受保护的网络");
  }
  if (!isSafeFetchUrl(parsed)) return jsonError(400, "资源地址无效或指向受保护的网络");

  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  if (authorization) headers.set("Authorization", authorization);

  try {
    const upstream = await fetch(parsed, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_URL_TIMEOUT_MS),
    });
    if (!upstream.ok) return jsonError(upstream.status, `资源下载失败（${upstream.status}）`);
    const length = Number(upstream.headers.get("content-length") || "0");
    if (length > MAX_FETCH_BYTES) return jsonError(413, "资源文件超过 2 GiB 安全上限");
    return toClientResponse(upstream);
  } catch {
    return jsonError(502, "资源下载失败，请检查地址和网络后重试");
  }
}

export async function proxyImageHostUpload(request: Request) {
  if (request.method !== "POST") return jsonError(405, "不支持的请求方法");
  const baseUrl = normalizeHttpUrl(request.headers.get("x-image-host-base-url") || "");
  if (!baseUrl) return jsonError(400, "图床地址无效");
  const target = `${baseUrl}/api/upload`;
  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  const apiKey = (request.headers.get("x-image-host-key") || "").trim();
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers,
      body: request.body,
      duplex: "half",
      signal: AbortSignal.timeout(IMAGE_HOST_TIMEOUT_MS),
    } as RequestInit);
    return toClientResponse(upstream);
  } catch {
    return jsonError(502, "图床上传失败，请检查地址和网络后重试");
  }
}

async function forward(request: Request, target: URL, headers: Headers, timeoutMs: number) {
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }
  try {
    const upstream = await fetch(target, init);
    return await toClientResponse(upstream);
  } catch {
    const host = target.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return jsonError(502, loopback ? "无法连接本机中转服务，请确认服务正在运行后重试" : "无法连接上游服务，请检查网络或代理后重试");
  }
}

async function toClientResponse(upstream: Response) {
  const headers = stripHeaders(upstream.headers, ["content-encoding", "content-length", "transfer-encoding"]);
  const buffer = Buffer.from(await upstream.arrayBuffer());
  headers.set("content-length", String(buffer.byteLength));
  headers.set("content-encoding", "identity");
  headers.set("cache-control", "no-transform");
  return new Response(buffer, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function isSafeFetchUrl(target: URL) {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  const host = target.hostname.replace(/\.$/, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  const ip = parseIp(host);
  if (ip && isDisallowedIp(ip)) return false;
  return true;
}

function parseIp(host: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  if (host.includes(":")) return host;
  return "";
}

function isDisallowedIp(ip: string) {
  if (ip === "::1" || ip === "0.0.0.0") return true;
  const v4 = ip.split(".").map((part) => Number(part));
  if (v4.length === 4 && v4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = v4;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (ip === "100.100.100.200" || ip === "168.63.129.16") return true;
  }
  return false;
}

export function healthPayload() {
  return {
    ok: true,
    service: "boundless-studio",
    xai: Boolean(process.env.XAI_API_KEY),
  };
}
