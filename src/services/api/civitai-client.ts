import axios from "axios";

import { routedLocalApiUrl, type ApiRequestRoute } from "@/services/api/ai-routing";
import { buildCivitaiWorkflowQuery, civitaiAllowsMatureContent, isCivitaiAdapterType, readCivitaiWorkflowState, type CivitaiWorkflowState } from "@/services/api/civitai-orchestration";
import { resolveCivitaiVideoMediaContractForIntent } from "@/services/api/civitai-video-media-contract.mjs";
import {
    CivitaiCatalogContractError,
    CivitaiCatalogUnavailableError,
    collectCivitaiGenerationServicePages,
    loadCivitaiGenerationCatalog,
    parseCivitaiGenerationServicePage,
    requireCivitaiCatalogService,
    resolveCivitaiService,
    type CivitaiGenerationCatalog,
    type CivitaiGenerationService,
    type CivitaiGenerationServicePage,
} from "@/services/api/civitai-services";
import { buildLocalRelayProxyHeaders, buildLocalRelayProxyUrl, selectRelayCredential, resolveRelayCredentialId } from "@/services/api/relay-proxy";

type LocalApiRequestRoute = Extract<ApiRequestRoute, { readonly mode: "local" }>;

export type CreatedCivitaiWorkflow = {
    readonly state: CivitaiWorkflowState;
    /** The paid workflow ID. This must never be populated from the what-if response. */
    readonly workflowId: string;
    readonly taskId: string;
    readonly startedAt: string;
    /** Opaque server-vault identity selected for this workflow. */
    readonly credentialId: string;
    readonly preflight: CivitaiWorkflowPreflight;
};

export type CivitaiWorkflowTaskSnapshot = Pick<CreatedCivitaiWorkflow, "workflowId" | "taskId" | "startedAt" | "credentialId">;

export type CivitaiWorkflowCostEstimate = {
    readonly total: number;
    readonly breakdown: Readonly<Record<string, number>>;
};

export type CivitaiWorkflowPreflight = {
    readonly workflowId: string;
    readonly estimatedCost: CivitaiWorkflowCostEstimate;
};

export function isCivitaiRoute(route: ApiRequestRoute) {
    return route.mode === "local" && isCivitaiAdapterType(route.provider.adapterType);
}

export const CIVITAI_CATALOG_BASE_URL = "https://orchestration.civitai.com/v2";
const CIVITAI_CATALOG_CACHE_MS = 5 * 60_000;
const CIVITAI_CATALOG_PAGE_LIMIT = 200;
const CIVITAI_CATALOG_MAX_PAGES = 100;
export type CivitaiCatalogCacheScope = {
    readonly providerId?: string;
    readonly baseUrl?: string;
    readonly proxyMode?: string;
    readonly proxyUrl?: string;
    /** Opaque current credential identity; never persisted or rendered. */
    readonly credentialId?: string;
    /** Optional raw credential for desktop-only compatibility; never persisted or rendered. */
    readonly apiKey?: string;
};

type CivitaiCatalogCacheEntry = {
    readonly expiresAt: number;
    readonly catalog: CivitaiGenerationCatalog;
};

const catalogCache = new Map<string, CivitaiCatalogCacheEntry>();
const catalogRequests = new Map<string, Promise<CivitaiGenerationCatalog>>();
let latestCatalogCacheKey: string | undefined;
const latestCatalogKeyByProvider = new Map<string, string>();
const latestCatalogKeyByConnection = new Map<string, string>();

export async function fetchCivitaiGenerationServices(
    apiKey: string,
    forceRefresh = false,
    scope?: CivitaiCatalogCacheScope,
): Promise<readonly CivitaiGenerationService[]> {
    return (await fetchCivitaiGenerationCatalog(apiKey, forceRefresh, scope)).services;
}

async function fetchCivitaiGenerationCatalog(
    apiKey: string,
    forceRefresh = false,
    scope?: CivitaiCatalogCacheScope,
): Promise<CivitaiGenerationCatalog> {
    const cacheKey = civitaiCatalogCacheKey(apiKey, scope);
    const now = Date.now();
    const cached = catalogCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > now) return cached.catalog;
    const pending = catalogRequests.get(cacheKey);
    if (!forceRefresh && pending) return pending;
    const request = loadCivitaiGenerationCatalog(
        () => loadCivitaiGenerationServices(apiKey, scope),
        { fallbackWhen: (error) => error instanceof CivitaiCatalogUnavailableError },
    ).then((catalog) => {
        catalogCache.set(cacheKey, {
            expiresAt: Date.now() + CIVITAI_CATALOG_CACHE_MS,
            catalog,
        });
        latestCatalogCacheKey = cacheKey;
        latestCatalogKeyByConnection.set(civitaiCatalogConnectionKey(scope), cacheKey);
        latestCatalogKeyByProvider.set(civitaiCatalogProviderKey(scope), cacheKey);
        return catalog;
    });
    catalogRequests.set(cacheKey, request);
    try {
        return await request;
    } finally {
        if (catalogRequests.get(cacheKey) === request) catalogRequests.delete(cacheKey);
    }
}

export async function refreshCivitaiGenerationCatalog(
    apiKey: string,
    scope?: CivitaiCatalogCacheScope,
): Promise<CivitaiGenerationCatalog> {
    return fetchCivitaiGenerationCatalog(apiKey, true, scope);
}

/**
 * Synchronous capability lookup for settings UI. Prefer the last catalog that
 * submission/discovery actually fetched; before that exists, use the bundled
 * offline snapshot. A live catalog miss stays a miss and never falls back to a
 * stale bundled discriminator.
 */
export function readCivitaiCatalogServiceSnapshot(model: string, scope?: CivitaiCatalogCacheScope) {
    const cacheKey = scope
        ? (scope.apiKey?.trim() || scope.credentialId?.trim()
            ? civitaiCatalogCacheKey(scope.apiKey || "", scope)
            : latestCatalogKeyByConnection.get(civitaiCatalogConnectionKey(scope))
                || latestCatalogKeyByProvider.get(civitaiCatalogProviderKey(scope)))
        : latestCatalogCacheKey;
    const cached = cacheKey ? catalogCache.get(cacheKey) : undefined;
    return cached ? resolveCivitaiService(model, cached.catalog.services) : resolveCivitaiService(model);
}

export async function resolveCivitaiRouteService(
    route: LocalApiRequestRoute,
    model: string,
    pinnedApiKey?: string,
    pinnedCredentialId?: string,
    catalogModel?: string,
) {
    const suppliedApiKey = String(pinnedApiKey || "").trim();
    const suppliedCredentialId = String(pinnedCredentialId || "").trim();
    const selected = suppliedApiKey || suppliedCredentialId
        ? {
            apiKey: suppliedApiKey,
            credentialId: suppliedCredentialId || resolveRelayCredentialId(route.provider, suppliedApiKey),
        }
        : selectRelayCredential(route.provider);
    return requireCivitaiCatalogService(
        await fetchCivitaiGenerationCatalog(selected.apiKey, false, civitaiCatalogScopeFromRoute(route, selected.apiKey, selected.credentialId)),
        catalogModel || model,
    );
}

function civitaiCatalogScopeFromRoute(route: LocalApiRequestRoute, apiKey?: string, credentialId?: string): CivitaiCatalogCacheScope {
    return {
        providerId: route.provider.id,
        baseUrl: route.provider.baseUrl,
        proxyMode: route.provider.proxyMode,
        proxyUrl: route.provider.proxyUrl,
        ...(apiKey ? { apiKey } : {}),
        ...(credentialId ? { credentialId } : {}),
    };
}

function civitaiCatalogConnectionKey(scope?: CivitaiCatalogCacheScope) {
    return [
        String(scope?.providerId || "").trim(),
        String(scope?.baseUrl || "").trim(),
        String(scope?.proxyMode || "").trim(),
        String(scope?.proxyUrl || "").trim(),
    ].join("|");
}

function civitaiCatalogCacheKey(apiKey: string, scope?: CivitaiCatalogCacheScope) {
    const connection = civitaiCatalogConnectionKey(scope);
    const credentialId = String(scope?.credentialId || "").trim();
    const effectiveKey = String(apiKey || scope?.apiKey || "").trim();
    return `civitai-catalog/v2:${connection}:${credentialId || credentialFingerprint(effectiveKey)}`;
}

function civitaiCatalogProviderKey(scope?: CivitaiCatalogCacheScope) {
    const providerId = String(scope?.providerId || "").trim();
    if (providerId) return `provider:${providerId}`;
    return `base:${String(scope?.baseUrl || "").trim()}`;
}

/** Keep credentials out of cache diagnostics while preventing cross-key reuse. */
function credentialFingerprint(apiKey: string) {
    let hash = 2166136261;
    for (const character of String(apiKey || "").trim()) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `${(hash >>> 0).toString(16)}:${String(apiKey || "").trim().length}`;
}

export async function createCivitaiWorkflow(
    route: LocalApiRequestRoute,
    workflow: object,
    waitSeconds: number,
    pinnedApiKey?: string,
    pinnedCredentialId?: string,
): Promise<CreatedCivitaiWorkflow> {
    const suppliedApiKey = String(pinnedApiKey || "").trim();
    const suppliedCredentialId = String(pinnedCredentialId || "").trim();
    const selected = suppliedApiKey || suppliedCredentialId
        ? {
            apiKey: suppliedApiKey,
            credentialId: suppliedCredentialId || resolveRelayCredentialId(route.provider, suppliedApiKey),
        }
        : selectRelayCredential(route.provider);
    if (!selected.credentialId) throw new Error("Civitai 工作流凭据缺少稳定标识，未发送付费请求");
    const request = {
        headers: buildLocalRelayProxyHeaders(route.provider, "application/json", selected.apiKey, selected.credentialId),
        timeout: route.timeoutMs,
    } as const;
    let preflight: CivitaiWorkflowPreflight;
    try {
        const response = await axios.post<unknown>(routedLocalApiUrl(route, "/workflows"), workflow, {
            ...request,
            params: buildCivitaiWorkflowQuery(waitSeconds, true, civitaiAllowsMatureContent(route.provider)),
        });
        preflight = readCivitaiWorkflowPreflight(response.data);
    } catch (error) {
        throw civitaiWorkflowRequestError(error);
    }
    const allowMatureContent = civitaiAllowsMatureContent(route.provider);
    try {
        const startedAt = new Date().toISOString();
        const response = await axios.post<unknown>(routedLocalApiUrl(route, "/workflows"), workflow, {
            ...request,
            params: buildCivitaiWorkflowQuery(waitSeconds, false, allowMatureContent),
        });
        const state = readCivitaiWorkflowState(response.data);
        if (!state.workflowId) throw new Error("Civitai 付费工作流响应缺少 workflowId");
        return {
            state,
            workflowId: state.workflowId,
            taskId: state.workflowId,
            startedAt,
            credentialId: selected.credentialId,
            preflight,
        };
    } catch (error) {
        throw civitaiWorkflowRequestError(error);
    }
}

export async function pollCivitaiWorkflow(
    route: LocalApiRequestRoute,
    workflowId: string,
    apiKey: string,
    timeoutMs = route.timeoutMs,
    credentialId?: string,
) {
    const response = await axios.get<unknown>(routedLocalApiUrl(route, `/workflows/${encodeURIComponent(workflowId)}`), {
        headers: buildLocalRelayProxyHeaders(route.provider, undefined, apiKey, credentialId),
        params: { hideMatureContent: !civitaiAllowsMatureContent(route.provider) },
        timeout: timeoutMs,
    });
    return readCivitaiWorkflowState(response.data);
}

export async function pollCivitaiWorkflowWithTransientRetry(
    route: LocalApiRequestRoute,
    workflowId: string,
    apiKey: string,
    options: {
        deadlineMs: number;
        maxTransientRetries?: number;
        credentialId?: string;
        wait?: (delayMs: number) => Promise<void>;
        now?: () => number;
    },
) {
    const maxRetries = Math.max(0, Math.floor(options.maxTransientRetries ?? 4));
    const wait = options.wait || ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
    const now = options.now || Date.now;
    let transientAttempt = 0;
    while (true) {
        try {
            const remainingMs = options.deadlineMs - now();
            if (remainingMs <= 0) throw new Error("Civitai 工作流轮询超时，可稍后从已保存任务继续查询");
            return await pollCivitaiWorkflow(route, workflowId, apiKey, Math.min(route.timeoutMs, remainingMs), options.credentialId);
        } catch (error) {
            if (!isTransientCivitaiPollError(error) || transientAttempt >= maxRetries) throw error;
            const waitMs = Math.min(10_000, 1_000 * (2 ** transientAttempt));
            if (now() + waitMs >= options.deadlineMs) throw error;
            await wait(waitMs);
            transientAttempt += 1;
        }
    }
}

/**
 * Wait for a paid workflow without recreating it. `startedAt` is persisted by
 * the caller and remains the authority after an app restart, so resume never
 * receives a fresh timeout window. When supplied, `onTaskSubmitted` is fully
 * awaited before the first status request; callers can therefore durably save
 * the paid workflow ID before polling can finish or fail.
 */
export async function waitCivitaiWorkflow(
    route: LocalApiRequestRoute,
    task: CivitaiWorkflowTaskSnapshot,
    options: {
        timeoutMs?: number;
        pollIntervalMs?: number;
        maxTransientRetries?: number;
        initialState?: CivitaiWorkflowState;
        onTaskSubmitted?: (task: CivitaiWorkflowTaskSnapshot) => void | Promise<void>;
        wait?: (delayMs: number) => Promise<void>;
        now?: () => number;
    } = {},
): Promise<CivitaiWorkflowState> {
    const startedAtMs = Date.parse(task.startedAt);
    if (!Number.isFinite(startedAtMs)) throw new Error("Civitai 工作流 startedAt 无效，无法安全恢复轮询");
    if (!task.workflowId.trim() || task.taskId !== task.workflowId) {
        throw new Error("Civitai 工作流任务快照缺少一致的付费 workflowId/taskId");
    }
    const timeoutMs = Math.max(0, options.timeoutMs ?? route.timeoutMs);
    const deadlineMs = startedAtMs + timeoutMs;
    const now = options.now || Date.now;
    const wait = options.wait || ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
    const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 5_000);

    await options.onTaskSubmitted?.(task);

    let state = options.initialState;
    if (state && state.workflowId !== task.workflowId) {
        throw new Error("Civitai 初始状态 workflowId 与付费任务不一致");
    }
    if (state && state.status !== "pending") return state;

    while (now() < deadlineMs) {
        state = await pollCivitaiWorkflowWithTransientRetry(route, task.workflowId, "", {
            deadlineMs,
            maxTransientRetries: options.maxTransientRetries,
            credentialId: task.credentialId,
            wait,
            now,
        });
        if (state.status !== "pending") return state;
        const remainingMs = deadlineMs - now();
        if (remainingMs <= 0) break;
        await wait(Math.min(pollIntervalMs, remainingMs));
    }
    throw new Error("Civitai 工作流轮询超时，可稍后从已保存任务继续查询");
}

function isTransientCivitaiPollError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return status === undefined || status === 429 || status === 502 || status === 503 || status === 504;
}

async function loadCivitaiGenerationServices(apiKey: string, scope?: CivitaiCatalogCacheScope) {
    return collectCivitaiGenerationServicePages(
        (offset) => loadCivitaiServicesPage(apiKey, offset, scope),
        CIVITAI_CATALOG_PAGE_LIMIT,
        CIVITAI_CATALOG_MAX_PAGES,
    );
}

async function loadCivitaiServicesPage(apiKey: string, offset: number, scope?: CivitaiCatalogCacheScope): Promise<CivitaiGenerationServicePage> {
    let payload: unknown;
    try {
        const response = await axios.get<unknown>(buildLocalRelayProxyUrl("/services"), {
            headers: buildLocalRelayProxyHeaders({
                id: String(scope?.providerId || "").trim() || "civitai-service-catalog",
                // Catalog is a sibling of /v2/consumer, not nested under the workflow base.
                baseUrl: CIVITAI_CATALOG_BASE_URL,
                apiKey,
                apiKeyId: scope?.credentialId,
                proxyMode: scope?.proxyMode,
                proxyUrl: scope?.proxyUrl,
            }, undefined, apiKey, scope?.credentialId),
            params: { limit: CIVITAI_CATALOG_PAGE_LIMIT, offset },
            timeout: 20_000,
        });
        payload = response.data;
    } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status !== undefined) assertCivitaiCatalogStatus(status);
        throw new CivitaiCatalogUnavailableError("Civitai /v2/services 网络请求失败", { cause: error });
    }
    return parseCivitaiGenerationServicePage(payload);
}

/**
 * Official contract evidence (2026-08-03): `whatif=true` returns the normal
 * Workflow shape and estimates cost without executing work.
 * https://github.com/civitai/civitai-developer-docs/blob/6676bd3d3e097708b98aec9fa19b6efedbf8a5ec/orchestration/guide/submitting-work.md#L45-L59
 */
export function readCivitaiWorkflowPreflight(payload: unknown): CivitaiWorkflowPreflight {
    if (!isRecord(payload)) throw new Error("Civitai whatif 没有返回有效 Workflow");
    const workflowId = nonEmptyString(payload.id) || nonEmptyString(payload.workflowId);
    if (!workflowId) throw new Error("Civitai whatif Workflow 缺少 id");
    const status = nonEmptyString(payload.status).toLowerCase();
    if (!status) throw new Error("Civitai whatif Workflow 缺少 status");
    if (!Array.isArray(payload.steps)) throw new Error("Civitai whatif Workflow 缺少 steps");
    if (["failed", "expired", "canceled", "cancelled"].includes(status)) {
        const state = readCivitaiWorkflowState(payload);
        throw new Error(state.status === "failed" ? state.error : `Civitai whatif Workflow ${status}`);
    }
    if (!isRecord(payload.cost)) throw new Error("Civitai whatif Workflow 缺少 cost");
    const total = payload.cost.total;
    if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
        throw new Error("Civitai whatif Workflow 的 cost.total 必须是非负有限数字");
    }
    const breakdown: Record<string, number> = {};
    for (const [key, value] of Object.entries(payload.cost)) {
        if (key !== "total" && typeof value === "number" && Number.isFinite(value) && value >= 0) breakdown[key] = value;
    }
    if (isRecord(payload.cost.currencies)) {
        for (const [key, value] of Object.entries(payload.cost.currencies)) {
            if (typeof value === "number" && Number.isFinite(value) && value >= 0) breakdown[key] = value;
        }
    }
    return { workflowId, estimatedCost: { total, breakdown } };
}

function assertCivitaiCatalogStatus(status: number) {
    if (status >= 200 && status < 300) return;
    // 404 means the catalog URL missed (historically /v2/consumer/services), not a schema mismatch.
    if (status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500) {
        throw new CivitaiCatalogUnavailableError(`Civitai /v2/services 暂时不可用（HTTP ${status}）`);
    }
    throw new CivitaiCatalogContractError(`Civitai /v2/services 返回非预期 HTTP ${status}`);
}

function civitaiWorkflowRequestError(error: unknown) {
    if (error instanceof Error && !axios.isAxiosError(error)) return error;
    return new Error(readCivitaiPreflightError(error), { cause: error });
}

export function readCivitaiPreflightError(error: unknown) {
    const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
    if (isRecord(payload)) {
        const parts = [
            nonEmptyString(payload.title),
            nonEmptyString(payload.detail),
            ...stringList(payload.messages),
        ];
        if (isRecord(payload.errors)) {
            for (const [path, messages] of Object.entries(payload.errors)) {
                const values = Array.isArray(messages) ? messages.map(nonEmptyString).filter(Boolean) : [nonEmptyString(messages)].filter(Boolean);
                if (!values.length) continue;
                parts.push(path ? `${path}: ${values.join("; ")}` : values.join("; "));
            }
        } else {
            parts.push(...stringList(payload.errors));
        }
        const detail = parts.filter(Boolean).join("; ");
        if (detail) return detail;
    }
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    return String(error ?? "");
}

function stringList(value: unknown) {
    return Array.isArray(value) ? value.map(nonEmptyString).filter(Boolean) : [];
}

function nonEmptyString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
