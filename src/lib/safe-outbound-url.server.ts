import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

type LookupAddress = { address: string; family: number };
export type SafeOutboundLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>;
export type SafeOutboundFetch = (
  input: URL,
  init?: RequestInit,
) => Promise<Response>;

/** Optional seams keep security tests deterministic and off the real network. */
export type SafeOutboundDependencies = {
  lookup?: SafeOutboundLookup;
  resolve?: SafeOutboundLookup;
  fetch?: SafeOutboundFetch;
  fetchImpl?: SafeOutboundFetch;
  validateRedirect?: (url: URL) => Promise<URL> | URL;
  dependencies?: SafeOutboundDependencies;
};

export class UnsafeOutboundUrlError extends Error {
  readonly status = 400;

  constructor() {
    super("资源地址无效或指向受保护的网络");
    this.name = "UnsafeOutboundUrlError";
  }
}

export class ResponseTooLargeError extends Error {
  readonly status = 413;
  readonly statusCode = 413;

  constructor(maxBytes: number) {
    super(`响应超过 ${maxBytes} 字节安全上限（413）`);
    this.name = "ResponseTooLargeError";
  }
}

function unsafeUrl(): never {
  throw new UnsafeOutboundUrlError();
}

function defaultLookup(hostname: string, options: { all: true; verbatim: true }) {
  return dnsLookup(hostname, options) as Promise<LookupAddress[]>;
}

function normalizeDependencies(
  dependencies: SafeOutboundDependencies | SafeOutboundLookup | undefined,
): SafeOutboundDependencies {
  if (typeof dependencies === "function") return { lookup: dependencies };
  const value = dependencies || {};
  return value.dependencies
    ? { ...normalizeDependencies(value.dependencies), ...value }
    : value;
}

/**
 * Parse and resolve an outbound URL, requiring every DNS answer to be public.
 * The returned URL is a fresh object so callers cannot mutate the checked value.
 */
export async function assertSafeOutboundUrl(
  raw: string | URL,
  dependencies?: SafeOutboundDependencies | SafeOutboundLookup,
): Promise<URL> {
  const deps = normalizeDependencies(dependencies);
  let url: URL;
  try {
    url = new URL(raw instanceof URL ? raw.href : String(raw).trim());
  } catch {
    return unsafeUrl();
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return unsafeUrl();
  if (url.username || url.password) return unsafeUrl();

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isBlockedHostname(hostname)) return unsafeUrl();

  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (isDisallowedIp(hostname, literalFamily)) return unsafeUrl();
    return url;
  }

  const lookup = deps.lookup || deps.resolve || defaultLookup;
  let answers: LookupAddress[];
  try {
    answers = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return unsafeUrl();
  }
  if (!Array.isArray(answers) || answers.length === 0) return unsafeUrl();

  for (const answer of answers) {
    const address = typeof answer?.address === "string" ? answer.address.trim() : "";
    const family = isIP(address);
    if (!family || isDisallowedIp(address, family)) return unsafeUrl();
  }
  return url;
}

/**
 * Fetch with redirects disabled at the platform layer. Each Location is parsed,
 * DNS-checked, and optionally passed through a caller-specific hostname policy.
 */
export async function fetchSafeRedirecting(
  input: URL,
  init: RequestInit,
  options: { maxRedirects: number } & SafeOutboundDependencies,
  dependencies?: SafeOutboundDependencies,
): Promise<Response> {
  const deps = normalizeDependencies({ ...options, ...(dependencies || {}) });
  const maxRedirects = normalizeMaxRedirects(options.maxRedirects);
  const fetchImpl = deps.fetch || deps.fetchImpl || defaultFetch;
  let current = await assertSafeOutboundUrl(input, deps);
  let redirects = 0;
  let requestInit: RequestInit = { ...init, redirect: "manual" };

  while (true) {
    const response = await fetchImpl(current, requestInit);
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    await cancelResponseBody(response);

    if (redirects >= maxRedirects) {
      throw new Error("上游重定向超过安全上限");
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return unsafeUrl();
    }
    const previous = current;
    current = await assertSafeOutboundUrl(next, deps);
    if (deps.validateRedirect) current = await deps.validateRedirect(current);
    requestInit = prepareRedirectRequest(requestInit, previous, current);
    redirects += 1;
  }
}

/** Read a response body incrementally and fail closed at the byte limit. */
export async function readResponseWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new RangeError("响应大小上限必须是非负有限数");
  }
  const limit = Math.floor(maxBytes);
  const declaredLength = Number(response.headers.get("content-length") || "");
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await cancelResponseBody(response);
    throw new ResponseTooLargeError(limit);
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value);
      total += chunk.byteLength;
      if (total > limit) {
        try {
          await reader.cancel();
        } catch {
          /* preserve the size-limit error */
        }
        throw new ResponseTooLargeError(limit);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function defaultFetch(input: URL, init?: RequestInit) {
  return globalThis.fetch(input, init);
}

function normalizeMaxRedirects(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_REDIRECTS;
  return Math.max(0, Math.floor(value));
}

function prepareRedirectRequest(init: RequestInit, previous: URL, current: URL): RequestInit {
  if (previous.origin === current.origin) return { ...init, redirect: "manual" };
  const headers = new Headers(init.headers);
  for (const name of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) {
    headers.delete(name);
  }
  return { ...init, headers, redirect: "manual" };
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    /* a redirect body is discarded either way */
  }
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "local" ||
    hostname === "internal" ||
    hostname === "lan" ||
    hostname === "home.arpa" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home.arpa")
  );
}

function isDisallowedIp(address: string, family: number) {
  if (family === 4) return isDisallowedIpv4(address);
  if (family === 6) return isDisallowedIpv6(address);
  return true;
}

function isDisallowedIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && b >= 18 && b <= 19) return true;
  if (address === "100.100.100.200" || address === "168.63.129.16") return true;
  return false;
}

function isDisallowedIpv6(address: string) {
  const words = parseIpv6(address);
  if (!words) return true;
  const first = words[0];
  const allZero = words.every((word) => word === 0);
  const loopback = allZero || (words.slice(0, 7).every((word) => word === 0) && words[7] === 1);
  if (loopback) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // IPv6 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if ((first & 0xffc0) === 0xfec0) return true; // deprecated site-local
  if (isIpv4Mapped(words) || isIpv4Compatible(words)) return true;
  const embeddedIpv4 = extractEmbeddedIpv4(words);
  if (embeddedIpv4 !== undefined && (!embeddedIpv4 || isDisallowedIpv4(embeddedIpv4))) return true;
  if (first === 0x2001 && words[1] === 0x0db8) return true; // documentation range
  if (first === 0x2001 && ((words[1] & 0xfff0) === 0x0010 || (words[1] & 0xfff0) === 0x0020)) return true; // ORCHID
  if (first === 0x3fff && (words[1] & 0xf000) === 0x0000) return true; // documentation range
  return false;
}

function isIpv4Mapped(words: number[]) {
  return words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
}

function isIpv4Compatible(words: number[]) {
  return words.slice(0, 6).every((word) => word === 0);
}

/** Decode IPv4-bearing IPv6 formats before allowing the outer address. */
function extractEmbeddedIpv4(words: number[]): string | null | undefined {
  if (isNat64Prefix(words)) return ipv4FromWords(words.slice(6, 8));
  if (words[0] === 0x2002) return ipv4FromWords(words.slice(1, 3)); // 6to4
  return undefined;
}

function isNat64Prefix(words: number[]) {
  return (
    words.length === 8 &&
    words[0] === 0x0064 &&
    words[1] === 0xff9b &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0
  );
}

function ipv4FromWords(words: number[]): string | null {
  if (words.length !== 2 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) return null;
  return `${words[0] >> 8}.${words[0] & 0xff}.${words[1] >> 8}.${words[1] & 0xff}`;
}

function parseIpv6(input: string): number[] | null {
  let value = input.toLowerCase();
  if (value.includes("%")) return null;
  if (value.includes(".")) {
    const split = value.lastIndexOf(":");
    if (split < 0) return null;
    const octets = value.slice(split + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    const prefix = value.slice(0, split);
    value = `${prefix}${prefix.endsWith(":") ? "" : ":"}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? parseIpv6Words(halves[0]) : [];
  const right = halves.length === 2 && halves[1] ? parseIpv6Words(halves[1]) : [];
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function parseIpv6Words(value: string): number[] | null {
  const words = value.split(":");
  if (words.some((word) => !/^[0-9a-f]{1,4}$/u.test(word))) return null;
  return words.map((word) => Number.parseInt(word, 16));
}
