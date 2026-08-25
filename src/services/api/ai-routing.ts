import { ensureApiRelaySettings, modelMatchesCapability, providerModelsForCapability, resolveApiRelayTimeoutMs, resolveBoardCapabilityRoute, resolveCapabilityRoute, type ApiBoardRouteKey, type ApiCapability, type ProviderModelSelection, type ResolvedCapabilityRoute } from "@/stores/api-relay-config";
import { buildLocalRelayProxyHeaders, buildLocalRelayProxyUrl } from "@/services/api/relay-proxy";
import { routedLocalPoolHeaders } from "@/services/api/local-pool";
import { type AiConfig, type ModelCapability } from "@/stores/use-config-store";

const localPoolBackendBaseUrl = "";

export type ApiRequestRoute =
    | { mode: "remote"; capability: ApiCapability; model: string; timeoutMs: number }
    | { mode: "localPool"; capability: ApiCapability; model: string; timeoutMs: number }
    | { mode: "local"; capability: ApiCapability; model: string; provider: ResolvedCapabilityRoute["provider"]; timeoutMs: number };

export function explicitTextRequestModel(
    config: AiConfig,
    _boardRouteKey?: ApiBoardRouteKey,
): string | ProviderModelSelection {
    const requestSelection = config.requestModelSelections?.text;
    if (typeof requestSelection === "string" && requestSelection.trim()) return requestSelection.trim();
    if (requestSelection && typeof requestSelection !== "string") {
        const providerId = String(requestSelection.providerId || "").trim();
        const model = String(requestSelection.model || "").trim();
        if (providerId && model) return { providerId, model };
    }
    const candidate = String(config.model || "").trim();
    const configuredTextModel = String(config.textModel || "").trim();
    return candidate && candidate !== configuredTextModel ? candidate : "";
}

/**
 * Canvas request configs historically carry a per-node media model in the
 * global `model` field. Accept it only when it is demonstrably classified for
 * the requested media capability and differs from that capability's ordinary
 * fallback. This preserves explicit node choices without letting a stale text
 * model override image/video/audio routing.
 */
export function explicitMediaRequestModel(config: AiConfig, capability: Exclude<ModelCapability, "text">) {
    const requestSelection = config.requestModelSelections?.[capability];
    if (typeof requestSelection === "string" && requestSelection.trim()) return requestSelection.trim();
    if (requestSelection && typeof requestSelection !== "string") {
        const providerId = String(requestSelection.providerId || "").trim();
        const model = String(requestSelection.model || "").trim();
        if (providerId && model) return { providerId, model };
    }
    const candidate = String(config.model || "").trim();
    if (!candidate || candidate === String(config[`${capability}Model`] || "").trim()) return "";
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const classifiedAsText = candidate === String(config.textModel || "").trim() || normalized.apiRelays.some(
        (provider) => provider.capabilities.includes("text") && providerModelsForCapability(provider, "text").includes(candidate),
    );
    // A global value known to be the text selection is legacy state, not a
    // media override. Every other differing value is an explicit per-request
    // choice and remains strict: route resolution will either find its exact
    // capability owner or reject it instead of silently falling back.
    return classifiedAsText ? "" : candidate;
}

export function resolveApiRequestRoute(config: AiConfig, capability: ModelCapability, preferredModel: string | ProviderModelSelection = "", boardRouteKey?: ApiBoardRouteKey): ApiRequestRoute {
    const legacyGlobalModel = String(config.model || "").trim();
    const verifiedLegacyFallback = capability === "text" || modelMatchesCapability(legacyGlobalModel, capability)
        ? legacyGlobalModel
        : "";
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const boardRoute = boardRouteKey ? normalized.apiBoardRouting[boardRouteKey] : undefined;
    const savedRoute = boardRoute?.mode === "custom" ? boardRoute : normalized.apiRouting[capability];
    let requested: string | ProviderModelSelection;
    if (typeof preferredModel !== "string") {
        requested = preferredModel;
    } else {
        const cleanPreferred = preferredModel.trim();
        if (cleanPreferred) {
            // A non-empty bare model is legacy explicit state. Never borrow a
            // provider from the mutable board/global route: duplicate owners
            // must remain blocked until the caller supplies an exact pair.
            requested = cleanPreferred;
        } else if (savedRoute?.providerId && savedRoute.model) {
            requested = "";
        } else {
            requested = String(config[`${capability}Model`] || verifiedLegacyFallback).trim();
        }
    }
    const route = boardRouteKey ? resolveBoardCapabilityRoute(normalized, boardRouteKey, requested) : resolveCapabilityRoute(normalized, capability, requested);
    return {
        mode: "local",
        capability: route.capability,
        model: route.model,
        provider: route.provider,
        timeoutMs: resolveApiRelayTimeoutMs(route.provider, normalized.apiRelayAdvanced.defaultTimeoutMs),
    };
}

export function routedLocalApiUrl(route: ApiRequestRoute, path: string) {
    if (route.mode === "localPool") return routedLocalPoolApiUrl(route, path);
    if (route.mode !== "local") throw new Error("本地中转路由未解析");
    return buildLocalRelayProxyUrl(path);
}

export function routedLocalPoolApiUrl(route: ApiRequestRoute, path: string) {
    if (route.mode !== "localPool") throw new Error("本地号池路由未解析");
    const normalizedPath = `/v1${path.startsWith("/") ? path : `/${path}`}`.replace(/\/+$/, "");
    return `${localPoolBackendBaseUrl}${normalizedPath}`;
}

type LocalRelayRoute = Extract<ApiRequestRoute, { mode: "local" }>;
type LocalPoolRoute = Extract<ApiRequestRoute, { mode: "localPool" }>;

export function routedLocalHeaders(route: LocalRelayRoute, contentType?: string): Record<string, string>;
export function routedLocalHeaders(route: LocalPoolRoute, contentType?: string): Promise<Record<string, string>>;
export function routedLocalHeaders(route: LocalRelayRoute | LocalPoolRoute, contentType?: string): Record<string, string> | Promise<Record<string, string>>;
export function routedLocalHeaders(route: ApiRequestRoute, contentType?: string): Record<string, string> | Promise<Record<string, string>> {
    if (route.mode === "local") return buildLocalRelayProxyHeaders(route.provider, contentType) as Record<string, string>;
    if (route.mode === "localPool") return routedLocalPoolHeaders(contentType);
    throw new Error("本地请求路由未解析");
}
