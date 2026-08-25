export type TextApiResponseErrorOptions = {
    status?: number;
    contentType?: string;
    operation?: string;
};

type AxiosTransportErrorLike = {
    code?: unknown;
    message?: unknown;
    config?: unknown;
    request?: unknown;
};

const HTML_DOCUMENT_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b)/i;
const GATEWAY_MARKER_PATTERN = /\b(?:bad[_ ]gateway|gateway timeout|service unavailable|upstream server error)\b/i;
const DIRECT_GATEWAY_PATTERN = /^\s*(?:bad_gateway|(?:502|503|504)\s+(?:bad gateway|gateway timeout|service unavailable))\b/i;
const SAFE_PROVIDER_CODES = new Set([
    "authentication_error",
    "authorization_error",
    "bad_gateway",
    "content_filter",
    "context_length_exceeded",
    "gateway_timeout",
    "insufficient_quota",
    "invalid_api_key",
    "invalid_request",
    "invalid_request_error",
    "model_not_found",
    "model_unavailable",
    "not_found",
    "permission_denied",
    "quota_exceeded",
    "rate_limit",
    "rate_limit_exceeded",
    "request_timeout",
    "server_error",
    "service_unavailable",
    "upstream_declined",
    "upstream_error",
]);

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function valueText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function errorCodeText(value: unknown) {
    if (typeof value === "string") return value.trim();
    return typeof value === "number" && Number.isInteger(value) ? String(value) : "";
}

function isLoopbackUrl(value: unknown) {
    const url = valueText(value).toLowerCase();
    return /^(?:https?:)?\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/.test(url);
}

/**
 * Produces a user-safe diagnosis for an Axios failure that has no HTTP
 * response. It intentionally uses connection metadata only for classification
 * and never includes an endpoint, request body, headers, or the raw error.
 */
export function describeTextTransportError(error: AxiosTransportErrorLike, operation: string): string {
    const fallback = String(operation || "文本生成失败").trim() || "文本生成失败";
    const code = valueText(error.code).toUpperCase();
    const message = valueText(error.message);
    const config = record(error.config);
    const request = record(error.request);
    const hasLoopbackTarget = isLoopbackUrl(config?.url) || isLoopbackUrl(config?.baseURL) || isLoopbackUrl(request?.responseURL);
    const hasProxy = Boolean(config && config.proxy && config.proxy !== false);

    if (hasLoopbackTarget) {
        return `${fallback}：无法连接本机服务，请确认本机服务正在运行，或检查代理设置后重试`;
    }
    if (hasProxy) {
        return `${fallback}：无法通过代理连接服务，请检查代理设置或网络后重试`;
    }
    if (["ECONNRESET", "EPIPE", "ERR_CONNECTION_RESET", "ERR_SOCKET_CLOSED", "UND_ERR_SOCKET"].includes(code)
        || /(?:socket hang up|connection reset|connection closed|network socket disconnected)/i.test(message)) {
        return `${fallback}：连接中断，请检查网络或代理后重试`;
    }
    if (["ERR_NETWORK", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ENOTFOUND", "ERR_INTERNET_DISCONNECTED"].includes(code)) {
        return `${fallback}：网络连接失败，请检查网络或代理后重试`;
    }
    return `${fallback}：未收到服务响应，请检查网络、代理或本机服务后重试`;
}

function responseText(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";

    const record = value as Record<string, unknown>;
    for (const key of ["message", "msg", "detail"]) {
        if (typeof record[key] === "string" && record[key].trim()) {
            return record[key].trim();
        }
    }
    return responseText(record.error);
}

function gatewayStatus(status: number | undefined, text: string) {
    if (status === 502 || status === 503 || status === 504) return status;
    const match = text.match(/\b(502|503|504)\b/);
    return match ? Number(match[1]) : undefined;
}

function isStructuredApiPayload(value: unknown, text: string) {
    if (value && typeof value === "object") return true;
    if (/(?:^|\r?\n)data:/i.test(text)) return true;
    if (!/^[{[]/.test(text)) return false;
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}

type ProviderErrorEnvelope = {
    code: string;
    message: string;
};

function providerErrorEnvelopeFromPayload(value: unknown): ProviderErrorEnvelope | null {
    const payload = record(value);
    if (!payload) return null;
    if ("error" in payload) {
        const error = record(payload.error);
        if (!error) {
            const message = valueText(payload.error);
            return message ? { code: "", message } : null;
        }
        const message = valueText(error.message) || valueText(error.msg) || valueText(error.detail);
        const code = errorCodeText(error.code) || valueText(error.type);
        return message || code ? { code, message } : null;
    }

    const code = errorCodeText(payload.code);
    if (!code || code === "0") return null;
    const message = valueText(payload.msg) || valueText(payload.message) || valueText(payload.detail);
    return { code, message };
}

function providerErrorEnvelope(value: unknown): ProviderErrorEnvelope | null {
    const direct = providerErrorEnvelopeFromPayload(value);
    if (direct) return direct;
    if (typeof value !== "string") return null;

    const text = value.trim();
    if (!text) return null;
    if (/(?:^|\r?\n)data:/i.test(text)) {
        for (const line of text.split(/\r?\n/)) {
            const data = line.match(/^data:\s?(.*)$/)?.[1];
            if (!data || data === "[DONE]") continue;
            try {
                const parsed = JSON.parse(data) as unknown;
                const envelope = providerErrorEnvelopeFromPayload(parsed);
                if (envelope) return envelope;
            } catch {
                // A malformed SSE fragment cannot safely identify a provider error.
            }
        }
        return null;
    }
    try {
        return providerErrorEnvelopeFromPayload(JSON.parse(text) as unknown);
    } catch {
        return null;
    }
}

function safeProviderCode(value: string) {
    const code = value.trim();
    if (/^\d{3}$/.test(code)) return code;
    return SAFE_PROVIDER_CODES.has(code.toLowerCase()) ? code : "";
}

function safeProviderMessage(value: string) {
    const message = value
        .replace(/\s*\((?:request\s*id|请求\s*id)\s*:[^)]*\)/giu, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!message || message.length > 300) return "";
    if (/^上游连接失败[：:]/u.test(message)) {
        return /(?:\blocalhost\b|\b127(?:\.\d{1,3}){3}\b|\b0\.0\.0\.0\b|\[::1\])(?::\d+)?/iu.test(message)
            ? "无法连接本机中转服务，请确认服务正在运行后重试"
            : "无法连接上游服务，请检查网络或代理后重试";
    }
    // Reject messages that contain credentials, full URLs, URL paths, or HTML tags.
    if (/(?:https?:\/\/|www\.|<\s*\/?\s*[a-z][^>]*>|\b(?:authorization|bearer|api[_ -]?key|access[_ -]?key|token|secret|password|credential)\b|[?&](?:key|token|secret|signature|sig)=|\b(?:get|post|put|patch|delete)\s+\/|\/(?:v\d+|api|chat|responses|images)\b)/i.test(message)) {
        return "";
    }
    return message;
}

function formatProviderError(envelope: ProviderErrorEnvelope, operation: string, status?: number) {
    const code = safeProviderCode(envelope.code);
    const message = safeProviderMessage(envelope.message);
    const safeHttpStatus = typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? `HTTP ${status}` : "";
    const reason = code && safeHttpStatus ? `${code} / ${safeHttpStatus}` : code || safeHttpStatus;
    const label = `${operation}：上游返回错误${reason ? `（${reason}）` : ""}`;
    return message ? `${label}：${message}` : `${label}，请检查请求配置后重试`;
}

/**
 * Detects raw proxy/CDN error pages returned in place of an OpenAI-compatible
 * JSON or SSE payload. It deliberately does not classify ordinary model text
 * that merely discusses HTTP errors as a failed response.
 */
export function detectTextApiResponseError(
    value: unknown,
    options: TextApiResponseErrorOptions = {},
): string | null {
    const operation = String(options.operation || "文本生成失败").trim() || "文本生成失败";
    const envelope = providerErrorEnvelope(value);
    if (envelope) return formatProviderError(envelope, operation, options.status);

    const text = responseText(value);
    const contentType = String(options.contentType || "").toLowerCase();
    const startsWithHtml = HTML_DOCUMENT_PATTERN.test(text);
    const isHtml = startsWithHtml || (contentType.includes("text/html") && !isStructuredApiPayload(value, text));
    const isDirectGatewayError = DIRECT_GATEWAY_PATTERN.test(text);
    const hasGatewayMarkers = GATEWAY_MARKER_PATTERN.test(text);
    const hasGatewayHttpStatus = options.status === 502 || options.status === 503 || options.status === 504;

    if (!isHtml && !isDirectGatewayError && !(hasGatewayMarkers && (hasGatewayHttpStatus || /unable to complete the request|protected by|proxy|upstream/i.test(text)))) {
        return null;
    }

    const status = gatewayStatus(options.status, text);
    if (status) {
        return `${operation}：上游网关异常（${status}），请稍后重试或检查中转 API`;
    }
    if (hasGatewayMarkers || isDirectGatewayError) {
        return `${operation}：上游网关异常，请稍后重试或检查中转 API`;
    }
    return `${operation}：中转返回了异常网页内容，请检查中转 API 或稍后重试`;
}
