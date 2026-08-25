import { relayModelDiscoverySafeContext } from "@/services/api/relay-errors";

type ProviderDiscoveryConnection = {
    baseUrl: string;
    apiKey: string;
    apiKeys?: readonly string[];
    adapterType?: string;
    proxyMode: string;
    proxyUrl: string;
};

export type ProviderDiscoveryLoadingState = ReadonlySet<string>;

function hasSameStringList(left: readonly string[] | undefined, right: readonly string[] | undefined) {
    const leftValues = left || [];
    const rightValues = right || [];
    return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

export function isSameProviderDiscoveryConnection(
    requestedProvider: ProviderDiscoveryConnection,
    currentProvider: ProviderDiscoveryConnection,
) {
    return requestedProvider.baseUrl === currentProvider.baseUrl &&
        requestedProvider.apiKey === currentProvider.apiKey &&
        hasSameStringList(requestedProvider.apiKeys, currentProvider.apiKeys) &&
        requestedProvider.adapterType === currentProvider.adapterType &&
        requestedProvider.proxyMode === currentProvider.proxyMode &&
        requestedProvider.proxyUrl === currentProvider.proxyUrl;
}

export function classifyProviderDiscoveryConnection(
    requestedProvider: ProviderDiscoveryConnection,
    currentProvider: ProviderDiscoveryConnection | undefined,
): "missing" | "changed" | "current" {
    if (!currentProvider) return "missing";
    return isSameProviderDiscoveryConnection(requestedProvider, currentProvider) ? "current" : "changed";
}

/**
 * Discovery failures may contain a server-controlled body, request URL, or
 * headers. Never surface that untrusted text in a settings notification.
 */
export function safeProviderDiscoveryErrorMessage(error: unknown) {
    const context = relayModelDiscoverySafeContext(error);
    const kind = context?.kind;
    const upstream = context?.safeDetail ? `；上游：${context.safeDetail}` : "";
    if (kind === "timeout") return "读取模型失败：模型列表在 20 秒内未返回，读取超时并已停止等待；请检查中转状态、代理或网络后重试";
    if (kind === "auth") return `读取模型失败：鉴权失败${context?.status ? ` (HTTP ${context.status})` : ""}，请检查 API Key、套餐权限或模型列表权限${upstream}`;
    if (kind === "not-found") return `读取模型失败：模型列表接口 /models 不存在或 Base URL 不正确（404）；不支持自动读取时可手动填写模型${upstream}`;
    if (kind === "rate-limit") return `读取模型失败：上游限流 (HTTP ${context?.status || 429})，请稍后重试${upstream}`;
    if (kind === "upstream-client") return `读取模型失败：上游拒绝请求${context?.status ? ` (HTTP ${context.status})` : ""}${upstream}`;
    if (kind === "network") return "读取模型失败：没有连上中转；请检查地址、代理和网络后重试";
    if (kind === "server") return `读取模型失败：中转服务端错误${context?.status ? ` (HTTP ${context.status})` : ""}；请稍后重试或检查服务状态${upstream}`;
    if (kind === "invalid-response") return "读取模型失败：中转响应不是有效的模型列表；请检查 Base URL 和协议适配器";
    return "读取模型失败：中转连接或服务响应异常，请检查地址、凭据、代理和网络后重试";
}

export function createProviderDiscoveryLoadingState(): ProviderDiscoveryLoadingState {
    return new Set();
}

export function beginProviderDiscovery(
    loading: ProviderDiscoveryLoadingState,
    providerId: string,
): { loading: ProviderDiscoveryLoadingState; started: boolean } {
    if (loading.has(providerId)) return { loading, started: false };
    return { loading: new Set([...loading, providerId]), started: true };
}

export function finishProviderDiscovery(
    loading: ProviderDiscoveryLoadingState,
    providerId: string,
): ProviderDiscoveryLoadingState {
    if (!loading.has(providerId)) return loading;
    const next = new Set(loading);
    next.delete(providerId);
    return next;
}
