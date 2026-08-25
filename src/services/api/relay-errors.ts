type RelayErrorLike = {
    code?: unknown;
    kind?: unknown;
    message?: unknown;
    name?: unknown;
    safeDetail?: unknown;
    status?: unknown;
    response?: {
        status?: unknown;
        data?: unknown;
    };
};

export type RelayModelDiscoveryFailureKind =
    | "timeout"
    | "auth"
    | "not-found"
    | "rate-limit"
    | "upstream-client"
    | "network"
    | "server"
    | "invalid-response"
    | "unknown";

const RELAY_MODEL_DISCOVERY_FAILURE_KINDS = new Set<RelayModelDiscoveryFailureKind>([
    "timeout",
    "auth",
    "not-found",
    "rate-limit",
    "upstream-client",
    "network",
    "server",
    "invalid-response",
    "unknown",
]);

export class RelayModelDiscoveryError extends Error {
    readonly kind: RelayModelDiscoveryFailureKind;
    readonly status?: number;
    readonly safeDetail?: string;

    constructor(kind: RelayModelDiscoveryFailureKind, options: { status?: number; detail?: string } = {}) {
        super(relayModelDiscoveryErrorMessage(kind));
        this.name = "RelayModelDiscoveryError";
        this.kind = kind;
        if (options.status) this.status = options.status;
        const safeDetail = sanitizeRelayModelDiscoveryDetail(options.detail || "");
        if (safeDetail) this.safeDetail = safeDetail;
    }
}

export function relayModelDiscoverySafeContext(error: unknown): {
    kind: RelayModelDiscoveryFailureKind;
    status?: number;
    safeDetail?: string;
} | undefined {
    const kind = relayModelDiscoveryFailureKind(error);
    if (!kind) return undefined;
    const item = errorLike(error);
    const status = typeof item.status === "number" && item.status >= 100 && item.status <= 599
        ? item.status
        : undefined;
    const safeDetail = typeof item.safeDetail === "string"
        ? sanitizeRelayModelDiscoveryDetail(item.safeDetail)
        : "";
    return {
        kind,
        ...(status ? { status } : {}),
        ...(safeDetail ? { safeDetail } : {}),
    };
}

export function relayModelDiscoveryFailureKind(error: unknown): RelayModelDiscoveryFailureKind | undefined {
    const item = errorLike(error);
    if (item.name !== "RelayModelDiscoveryError" || typeof item.kind !== "string") return undefined;
    return RELAY_MODEL_DISCOVERY_FAILURE_KINDS.has(item.kind as RelayModelDiscoveryFailureKind)
        ? item.kind as RelayModelDiscoveryFailureKind
        : undefined;
}

export function toRelayModelDiscoveryError(error: unknown): RelayModelDiscoveryError {
    const existingKind = relayModelDiscoveryFailureKind(error);
    if (existingKind) return error as RelayModelDiscoveryError;

    const item = errorLike(error);
    const status = typeof item.response?.status === "number" ? item.response.status : undefined;
    const payloadMessage = extractRelayErrorMessage(item.response?.data);
    const errorMessage = typeof item.message === "string" ? item.message : "";
    const message = payloadMessage || errorMessage;
    const code = typeof item.code === "string" ? item.code.toUpperCase() : "";

    const upstreamDetail = status ? payloadMessage || errorMessage : "";

    if (status === 401 || status === 403) return new RelayModelDiscoveryError("auth", { status, detail: upstreamDetail });
    if (status === 404) return new RelayModelDiscoveryError("not-found", { status, detail: upstreamDetail });
    if (status === 429) return new RelayModelDiscoveryError("rate-limit", { status, detail: upstreamDetail });
    if (code === "ECONNABORTED" || code === "ETIMEDOUT" || /context deadline exceeded|timed?\s*out|timeout/i.test(message)) {
        return new RelayModelDiscoveryError("timeout");
    }
    if (isNetworkError(message) || code === "ERR_NETWORK" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
        return new RelayModelDiscoveryError("network");
    }
    if (status && status >= 500) return new RelayModelDiscoveryError("server", { status, detail: upstreamDetail });
    if (isHtmlServerPage(message)) return new RelayModelDiscoveryError("invalid-response", { status });
    if (status && status >= 400) return new RelayModelDiscoveryError("upstream-client", { status, detail: upstreamDetail });
    return new RelayModelDiscoveryError("unknown");
}

export function formatRelayModelsError(error: unknown, baseUrl: string) {
    const item = errorLike(error);
    const status = typeof item.response?.status === "number" ? item.response.status : undefined;
    const payloadMessage = extractRelayErrorMessage(item.response?.data);
    const errorMessage = typeof item.message === "string" ? item.message : "";
    const message = payloadMessage || errorMessage;
    const target = formatRelayTarget(baseUrl);

    if (status === 401 || status === 403) {
        return `读取模型失败：鉴权失败 (${status})，请检查 API Key、套餐权限或模型列表权限。${target}`;
    }

    if (status === 404) {
        return `读取模型失败：模型列表接口 /models 不存在或 Base URL 填错（返回 404）。请确认中转是否兼容 OpenAI 的 /v1/models；如果不支持自动读取，就在模型列表里手动填写模型。${target}`;
    }

    if (isHtmlServerPage(message)) {
        return status
            ? `读取模型失败：中转返回了网页错误 (${status})，不是模型列表 JSON。请检查 Base URL 是否填到了正确的 API 根地址。${target}`
            : `读取模型失败：中转返回了网页错误，不是模型列表 JSON。请检查 Base URL 是否填到了正确的 API 根地址。${target}`;
    }

    if (isNetworkError(message) || item.code === "ERR_NETWORK") {
        return `读取模型失败：没有连上中转服务。请检查中转地址、网络或本地代理是否正常。${target}`;
    }

    if (status) {
        return `读取模型失败：中转返回 ${status}。${target}`;
    }

    return message ? `读取模型失败：${message}` : `读取模型失败。${target}`;
}

function errorLike(error: unknown): RelayErrorLike {
    return error && typeof error === "object" ? (error as RelayErrorLike) : {};
}

function extractRelayErrorMessage(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    for (const key of ["message", "msg", "detail", "code"]) {
        if (typeof record[key] === "string" && record[key]) return String(record[key]).trim();
    }
    return extractRelayErrorMessage(record.error);
}

function isHtmlServerPage(message: string) {
    return /<html[\s>]|<!doctype html|<h1>|openresty|nginx/i.test(message);
}

function isNetworkError(message: string) {
    return /failed to fetch|network error|fetch failed|load failed|econnrefused|etimedout|timeout/i.test(message);
}

function formatRelayTarget(baseUrl: string) {
    const target = String(baseUrl || "").trim();
    return target ? `当前地址：${target}` : "";
}

function relayModelDiscoveryErrorMessage(kind: RelayModelDiscoveryFailureKind) {
    if (kind === "timeout") return "模型列表读取超时";
    if (kind === "auth") return "模型列表读取鉴权失败";
    if (kind === "not-found") return "模型列表接口不存在";
    if (kind === "rate-limit") return "模型列表接口限流";
    if (kind === "upstream-client") return "模型列表请求被上游拒绝";
    if (kind === "network") return "无法连接模型列表服务";
    if (kind === "server") return "模型列表服务端错误";
    if (kind === "invalid-response") return "模型列表响应无效";
    return "模型列表读取失败";
}

function sanitizeRelayModelDiscoveryDetail(value: string) {
    if (!value || isHtmlServerPage(value)) return "";
    const sanitized = value
        .replace(/https?:\/\/[^\s"'<>]+/giu, "[地址已隐藏]")
        .replace(/(?:authorization\s*:\s*)?bearer\s+[^\s,;]+/giu, "[凭据已隐藏]")
        .replace(/\b(api[_-]?key|access[_-]?token|token)\s*[=:]\s*[^\s,;]+/giu, "$1=[已隐藏]")
        .replace(/\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9_]{12,}|github_pat_[a-z0-9_]{12,}|glpat-[a-z0-9_-]{12,}|xox[a-z]-[a-z0-9-]{12,}|AIza[a-z0-9_-]{20,})\b/giu, "[凭据已隐藏]")
        .replace(/\b[a-z0-9_-]{48,}\b/giu, "[标识已隐藏]")
        .replace(/[\r\n\t]+/gu, " ")
        .replace(/\s{2,}/gu, " ")
        .trim();
    return sanitized.length > 240 ? `${sanitized.slice(0, 237)}...` : sanitized;
}
