import axios from "axios";
import { NativeImageTaskTerminalError } from "@/services/api/native-image-task";

import { routedLocalApiUrl, type ApiRequestRoute } from "@/services/api/ai-routing";
import { buildLocalRelayProxyHeaders, rotateRelayApiKey } from "@/services/api/relay-proxy";

/**
 * 商汤日日新 SenseNova 的生图端点本身是 OpenAI 兼容的（POST /images/generations），
 * 但 size 只接受下面这些枚举值，其它值一律返回
 * `field Size invalid, should be one of: ...`。适配器必须保留用户的精确选择，
 * 不能把不支持的尺寸静默吸附到另一个枚举值。
 */
export const SENSENOVA_IMAGE_SIZES = [
    "1664x2496",
    "2496x1664",
    "1760x2368",
    "2368x1760",
    "1824x2272",
    "2272x1824",
    "2048x2048",
    "2752x1536",
    "1536x2752",
    "3072x1376",
    "1344x3136",
] as const;

export const SENSENOVA_DEFAULT_IMAGE_SIZE = "2048x2048";

const SENSENOVA_HOST_PATTERN = /(^|\.)sensenova\.cn$/i;

export function isSenseNovaBaseUrl(baseUrl: string) {
    try {
        return SENSENOVA_HOST_PATTERN.test(new URL(baseUrl.trim()).hostname);
    } catch {
        return false;
    }
}

export function isSenseNovaRoute(route: ApiRequestRoute) {
    return route.mode === "local" && (route.provider.adapterType?.trim().toLowerCase() === "sensenova" || isSenseNovaBaseUrl(route.provider.baseUrl));
}

function parseSize(value: string) {
    const match = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(String(value || "").trim());
    if (!match) return undefined;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return undefined;
    return { width, height };
}

/** 返回精确的 SenseNova 尺寸；不支持的值会显式失败，绝不静默改写。 */
export function normalizeSenseNovaImageSize(value: string) {
    const raw = String(value || "").trim();
    if (!raw || raw.toLowerCase() === "auto") return "";
    const requested = parseSize(value);
    if (!requested) throw new Error(`SenseNova 图片尺寸格式无效：${raw}；请使用 WIDTHxHEIGHT`);
    if ((SENSENOVA_IMAGE_SIZES as readonly string[]).includes(`${requested.width}x${requested.height}`)) {
        return `${requested.width}x${requested.height}`;
    }
    throw new Error(`SenseNova 不支持图片尺寸 ${requested.width}x${requested.height}；可选值：${SENSENOVA_IMAGE_SIZES.join(", ")}`);
}

/** @deprecated 保留旧导出名，但行为已改为严格校验，不再执行吸附。 */
export const snapSenseNovaImageSize = normalizeSenseNovaImageSize;

type MiaohuaCreateResponse = {
    task_id?: string;
    message?: string;
};

type MiaohuaResultResponse = {
    state?: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
    state_message?: string;
    images?: Array<{ raw?: string; small?: string; error_code?: string }>;
};

export type MiaohuaImageTask = Readonly<{
    taskId: string;
    apiKey: string;
    startedAt: string;
    expectedOutputs: number;
}>;

export type MiaohuaImageTaskState =
    | { status: "pending" }
    | { status: "completed"; urls: string[] }
    | { status: "failed"; error: string };

type MiaohuaImageCreateOptions = {
    model: string;
    prompt: string;
    count: number;
    width?: number;
    height?: number;
    format?: "JPG" | "PNG";
    imageUrl?: string;
    timeoutMs?: number;
};

type MiaohuaImageWaitOptions = {
    /** Per-request timeout. The task's total deadline is controlled separately below. */
    timeoutMs?: number;
    taskTimeoutMs?: number;
    pollIntervalMs?: number;
    maxTransientRetries?: number;
    /** Test seam; production waits for the exact interval/backoff. */
    wait?: (delayMs: number) => Promise<void>;
};

export async function createMiaohuaImageTask(
    route: ApiRequestRoute,
    options: MiaohuaImageCreateOptions,
): Promise<MiaohuaImageTask> {
    if (route.mode !== "local") throw new Error("秒画仅支持本地中转路由");
    const apiKey = rotateRelayApiKey(route.provider);
    const startedAt = new Date().toISOString();
    const create = await axios.post<MiaohuaCreateResponse>(
        routedLocalApiUrl(route, "/imgenstd/imgen"),
        {
            model_id: options.model,
            prompt: options.prompt,
            samples: options.count,
            ...(options.width !== undefined ? { width: options.width } : {}),
            ...(options.height !== undefined ? { height: options.height } : {}),
            ...(options.format ? { format: options.format } : {}),
            ...(options.imageUrl ? { img_url: options.imageUrl } : {}),
        },
        {
            headers: buildLocalRelayProxyHeaders(route.provider, "application/json", apiKey),
            timeout: Math.min(options.timeoutMs || route.timeoutMs || 120_000, 120_000),
        },
    );
    const taskId = String(create.data?.task_id || "").trim();
    if (!taskId) throw new Error(String(create.data?.message || "秒画没有返回任务 ID"));
    return { taskId, apiKey, startedAt, expectedOutputs: options.count };
}

export async function pollMiaohuaImageTask(
    route: ApiRequestRoute,
    task: MiaohuaImageTask,
    options: { timeoutMs?: number } = {},
): Promise<MiaohuaImageTaskState> {
    if (route.mode !== "local") throw new Error("秒画仅支持本地中转路由");
    const result = await axios.get<MiaohuaResultResponse>(
        routedLocalApiUrl(route, `/imgenstd/result/${encodeURIComponent(task.taskId)}`),
        {
            headers: buildLocalRelayProxyHeaders(route.provider, undefined, task.apiKey),
            timeout: Math.min(options.timeoutMs || route.timeoutMs || 60_000, 60_000),
        },
    );
    if (result.data?.state === "FAILED") {
        return { status: "failed", error: result.data.state_message || "秒画图片生成失败" };
    }
    if (result.data?.state !== "SUCCESS") return { status: "pending" };
    const urls = (result.data.images || [])
        .filter((image) => !image.error_code)
        .map((image) => String(image.raw || image.small || "").trim())
        .filter(Boolean);
    if (!urls.length) return { status: "failed", error: result.data.state_message || "秒画任务成功但没有返回图片" };
    return { status: "completed", urls };
}

export async function waitForMiaohuaImageTask(
    route: ApiRequestRoute,
    task: MiaohuaImageTask,
    options: MiaohuaImageWaitOptions = {},
): Promise<string[]> {
    const taskTimeoutMs = options.taskTimeoutMs || options.timeoutMs || route.timeoutMs || 360_000;
    const startedAtMs = Date.parse(task.startedAt);
    if (!Number.isFinite(startedAtMs)) throw new Error("秒画图片任务 startedAt 无效，无法恢复轮询期限");
    const deadlineMs = startedAtMs + taskTimeoutMs;
    const interval = Math.max(0, options.pollIntervalMs ?? 2_000);
    const maxTransientRetries = Math.max(0, options.maxTransientRetries ?? 4);
    const wait = options.wait || delay;
    let transientAttempt = 0;
    while (true) {
        let remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 0) throw new Error("秒画图片生成超时，可稍后按任务 ID 查询结果");
        if (interval) {
            await wait(Math.min(interval, remainingMs));
            remainingMs = deadlineMs - Date.now();
            if (remainingMs <= 0) throw new Error("秒画图片生成超时，可稍后按任务 ID 查询结果");
        }
        try {
            const state = await pollMiaohuaImageTask(route, task, {
                timeoutMs: Math.min(options.timeoutMs || route.timeoutMs || 60_000, remainingMs),
            });
            transientAttempt = 0;
            if (state.status === "completed") return state.urls;
            if (state.status === "failed") throw new NativeImageTaskTerminalError(state.error);
        } catch (error) {
            if (!isRetryableMiaohuaPollError(error) || transientAttempt >= maxTransientRetries) throw error;
            const retryDelayMs = Math.min(10_000, 1_000 * (2 ** transientAttempt));
            if (Date.now() + retryDelayMs >= deadlineMs) {
                throw new Error("秒画图片生成超时，可稍后按任务 ID 查询结果", { cause: error });
            }
            await wait(retryDelayMs);
            transientAttempt += 1;
        }
    }
}

/**
 * 秒画标准生图是异步任务：POST /imgenstd/imgen，再轮询
 * GET /imgenstd/result/{task_id}。这里不把它伪装成 OpenAI Images 响应。
 */
export async function requestMiaohuaImages(
    route: ApiRequestRoute,
    options: MiaohuaImageCreateOptions & MiaohuaImageWaitOptions & {
        onTaskSubmitted?: (task: MiaohuaImageTask) => void | Promise<void>;
    },
): Promise<string[]> {
    const task = await createMiaohuaImageTask(route, options);
    await options.onTaskSubmitted?.(task);
    return waitForMiaohuaImageTask(route, task, options);
}

function isRetryableMiaohuaPollError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return status === undefined || status === 429 || status === 502 || status === 503 || status === 504;
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
