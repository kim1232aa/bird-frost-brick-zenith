import axios from "axios";
import { NativeImageTaskTerminalError } from "@/services/api/native-image-task";

import { routedLocalApiUrl, type ApiRequestRoute } from "@/services/api/ai-routing";
import { buildLocalRelayProxyHeaders, rotateRelayApiKey, selectRelayCredential } from "@/services/api/relay-proxy";
import {
    nativeVideoAdapterType,
    serializeDashscopeVideoInput,
    validateVideoGenerationParameters,
    type ResolvedVideoModelCapability,
    type VideoGenerationParameters,
    type VideoReferenceIntent,
} from "@/services/api/video-model-capabilities";

/**
 * 阿里云百炼（DashScope）原生协议适配。
 *
 * DashScope 不提供 OpenAI 兼容的 /images/generations 与 /videos/generations
 * （实测 404），必须走原生端点：
 *   - Qwen Image/Plus 文生图：POST /services/aigc/text2image/image-synthesis（异步）
 *   - 其余已验证生图模型：POST /services/aigc/multimodal-generation/generation（同步）
 *   - 生视频：POST /services/aigc/video-generation/video-synthesis（强制异步）
 *     轮询 GET /tasks/{task_id}
 */

const DASHSCOPE_HOST_PATTERN = /(^|\.)dashscope\.aliyuncs\.com$/i;
const DASHSCOPE_MAAS_HOST_PATTERN = /\.maas\.aliyuncs\.com$/i;

/** DashScope 生视频强制要求的异步头，缺失会返回 403 AccessDenied。 */
export const DASHSCOPE_ASYNC_HEADER = { "X-DashScope-Async": "enable" } as const;

export function isDashscopeBaseUrl(baseUrl: string) {
    try {
        const host = new URL(baseUrl.trim()).hostname;
        return DASHSCOPE_HOST_PATTERN.test(host) || DASHSCOPE_MAAS_HOST_PATTERN.test(host);
    } catch {
        return false;
    }
}

export function isDashscopeRoute(route: ApiRequestRoute) {
    return route.mode === "local" && nativeVideoAdapterType(route.provider) === "dashscope";
}

/**
 * DashScope 的 baseUrl 通常配成 .../compatible-mode/v1（OpenAI 兼容层），
 * 但原生生图/生视频端点挂在 /api/v1 下，这里做一次换算。
 */
export function dashscopeNativeBaseUrl(baseUrl: string) {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    try {
        const url = new URL(trimmed);
        url.pathname = "/api/v1";
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return trimmed.replace(/\/compatible-mode\/v1$/i, "/api/v1");
    }
}

function dashscopeRequestUrl(route: ApiRequestRoute, path: string) {
    if (route.mode !== "local") throw new Error("DashScope 仅支持本地中转路由");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return routedLocalApiUrl(route, normalizedPath);
}

function dashscopeHeaders(route: ApiRequestRoute, contentType?: string, async = false, apiKey?: string, credentialId?: string) {
    if (route.mode !== "local") throw new Error("DashScope 仅支持本地中转路由");
    return {
        ...buildLocalRelayProxyHeaders({ ...route.provider, baseUrl: dashscopeNativeBaseUrl(route.provider.baseUrl), apiKey: route.provider.apiKey }, contentType, apiKey, credentialId),
        ...(async ? DASHSCOPE_ASYNC_HEADER : {}),
    };
}

export function normalizeDashscopeImageSize(value: string, model = "") {
    const raw = String(value || "").trim().toLowerCase().replace(/[x×]/g, "*");
    if (!raw || raw === "auto") return "";
    const match = /^(\d+)\s*\*\s*(\d+)$/.exec(raw);
    if (!match) return "";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "";
    const modelKey = normalizeDashscopeModelKey(model);
    const area = width * height;
    const minPixels = modelKey.startsWith("wan2-7-image") ? 768 * 768 : 512 * 512;
    const maxPixels = modelKey === "wan2-7-image-pro" ? 4096 * 4096 : 2048 * 2048;
    if (area < minPixels || area > maxPixels) return "";
    return `${width}*${height}`;
}

export function serializeDashscopeImageParameters(model: string, options: { size?: string; count?: number; sequential?: boolean }) {
    const modelKey = normalizeDashscopeModelKey(model);
    const size = normalizeDashscopeImageSize(options.size || "", model);
    const n = options.count === undefined ? 1 : Number(options.count);
    if (!Number.isInteger(n) || n < 1) throw new Error(`DashScope 图片数量必须是正整数，当前为 ${String(options.count)}`);
    if (modelKey === "wan2-6-image") {
        return { ...(size ? { size } : {}), max_images: n, enable_interleave: true, stream: true, watermark: false };
    }
    if (modelKey === "wan2-6-t2i") {
        return { ...(size ? { size } : {}), n, prompt_extend: false, watermark: false };
    }
    if (modelKey === "z-image-turbo") return { ...(size ? { size } : {}), prompt_extend: false };
    if (modelKey === "qwen-image" || modelKey.startsWith("qwen-image-max") || modelKey.startsWith("qwen-image-plus")) {
        if (n !== 1) throw new Error(`${model} 单次请求固定生成 1 张；多张必须由客户端独立调用`);
        return { ...(size ? { size } : {}), prompt_extend: false };
    }
    if (modelKey.startsWith("qwen-image-2-") || modelKey.startsWith("qwen-image-3-")) {
        return { ...(size ? { size } : {}), n, prompt_extend: true, watermark: false };
    }
    if (modelKey === "wan2-7-image" || modelKey === "wan2-7-image-pro") {
        const sequential = options.sequential === true;
        const max = sequential ? 12 : 4;
        if (n > max) throw new Error(`DashScope ${sequential ? "连续组图" : "普通"}模式最多生成 ${max} 张，当前为 ${n}`);
        if (sequential && size) {
            const [width, height] = size.split("*").map(Number);
            if (width * height > 2048 * 2048) throw new Error("DashScope Wan2.7 连续组图最高支持 2K；4K 仅支持普通文生图");
        }
        return { ...(size ? { size } : {}), n, enable_sequential: sequential, watermark: false };
    }
    return { ...(size ? { size } : {}), n, prompt_extend: false, watermark: false };
}

type DashscopeImageResponse = {
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
    code?: string;
    message?: string;
};

export function parseDashscopeImageUrls(payload: unknown) {
    if (typeof payload === "string") {
        return payload
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .filter((data) => data && data !== "[DONE]")
            .flatMap((data) => {
                try {
                    return imageUrlsFromDashscopePayload(JSON.parse(data));
                } catch {
                    return [];
                }
            });
    }
    return imageUrlsFromDashscopePayload(payload);
}

function imageUrlsFromDashscopePayload(payload: unknown) {
    if (!isDashscopeRecord(payload) || !isDashscopeRecord(payload.output)) return [];
    if (Array.isArray(payload.output.results)) {
        return payload.output.results
            .map((result) => isDashscopeRecord(result) && typeof result.url === "string" ? result.url.trim() : "")
            .filter(Boolean);
    }
    const output = isDashscopeRecord(payload.output.output) ? payload.output.output : payload.output;
    if (!Array.isArray(output.choices)) return [];
    return output.choices.flatMap((choice) => {
        if (!isDashscopeRecord(choice) || !isDashscopeRecord(choice.message) || !Array.isArray(choice.message.content)) return [];
        return choice.message.content
            .map((item) => isDashscopeRecord(item) && typeof item.image === "string" ? item.image.trim() : "")
            .filter(Boolean);
    });
}

function isDashscopeRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type DashscopeVideoStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";

type DashscopeTaskResponse = {
    output?: {
        task_id?: string;
        task_status?: DashscopeVideoStatus;
        video_url?: string;
        output?: unknown;
        code?: string;
        message?: string;
    };
    code?: string;
    message?: string;
};

export type DashscopeImageTaskState =
    | { status: "pending" }
    | { status: "completed"; urls: string[] }
    | { status: "failed"; error: string };

export function parseDashscopeImageTaskState(payload: unknown): DashscopeImageTaskState {
    if (!isDashscopeRecord(payload) || !isDashscopeRecord(payload.output)) {
        return { status: "failed", error: "阿里云百炼图片任务返回格式无效" };
    }
    const status = String(payload.output.task_status || "").trim().toUpperCase();
    if (status === "PENDING" || status === "RUNNING") return { status: "pending" };
    if (status === "SUCCEEDED") {
        const urls = parseDashscopeImageUrls(payload);
        return urls.length
            ? { status: "completed", urls }
            : { status: "failed", error: "阿里云百炼图片任务成功但没有返回图片 URL" };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
        if (status === "UNKNOWN") {
            return { status: "failed", error: readDashscopeError(payload as DashscopeTaskResponse) || "阿里云百炼图片任务不存在或已过期（task_id 仅 24 小时内有效），请重新生成" };
        }
        return { status: "failed", error: readDashscopeError(payload as DashscopeTaskResponse) || `阿里云百炼图片任务${status === "CANCELED" ? "已取消" : "失败"}` };
    }
    return { status: "failed", error: `阿里云百炼图片任务返回未知状态：${status || "空"}` };
}

export function dashscopeImagePollDelay(attempt: number) {
    return Math.min(10_000, 1_000 * (2 ** Math.max(0, Math.min(4, Math.floor(attempt)))));
}

export type DashscopeImageTaskSubmission = {
    readonly taskId: string;
    /** Opaque server-vault identity selected for creation and polling. */
    readonly credentialId: string;
    /** ISO timestamp captured before the paid create request is dispatched. */
    readonly startedAt: string;
    readonly expectedOutputs: number;
};

type DashscopeAsyncImageCreateOptions = {
    model: string;
    prompt: string;
    references?: readonly string[];
    size?: string;
    count?: number;
    sequential?: boolean;
    timeoutMs?: number;
};

type DashscopeImageWaitOptions = {
    requestTimeoutMs?: number;
    taskTimeoutMs?: number;
    /** Testable wait seam; production uses the exact backoff returned by dashscopeImagePollDelay. */
    wait?: (delayMs: number) => Promise<void>;
};

function readDashscopeError(payload: { code?: string; message?: string; output?: unknown } | undefined) {
    const output = (payload?.output || {}) as { code?: string; message?: string };
    const outputMessage = output.message || output.code;
    return String(payload?.message || payload?.code || outputMessage || "").trim();
}

export async function requestDashscopeImages(
    route: ApiRequestRoute,
    options: {
        model: string;
        prompt: string;
        references?: readonly string[];
        size?: string;
        count?: number;
        sequential?: boolean;
        timeoutMs?: number;
        taskTimeoutMs?: number;
        onTaskSubmitted?: (task: DashscopeImageTaskSubmission) => void | Promise<void>;
        /** Testable wait seam; production uses the exact backoff returned by dashscopeImagePollDelay. */
        wait?: (delayMs: number) => Promise<void>;
    },
): Promise<string[]> {
    const references = requireCompleteDashscopeReferences(options.references);
    const parameters = serializeDashscopeImageParameters(options.model, options);
    const modelKey = normalizeDashscopeModelKey(options.model);
    const interleaved = modelKey === "wan2-6-image";
    const asyncQwen = modelKey === "qwen-image" || modelKey.startsWith("qwen-image-plus");
    if (asyncQwen) {
        const task = await createDashscopeImageTask(route, { ...options, references });
        await options.onTaskSubmitted?.(task);
        return waitForDashscopeImageTask(route, task, {
            requestTimeoutMs: options.timeoutMs,
            taskTimeoutMs: options.taskTimeoutMs,
            wait: options.wait,
        });
    }
    const selected = route.mode === "local"
        ? selectRelayCredential(route.provider)
        : { apiKey: "", credentialId: "" };
    const content = [
        ...references.map((image) => ({ image })),
        { text: options.prompt },
    ];
    const response = await axios.post<DashscopeImageResponse | string>(
        dashscopeRequestUrl(route, "/services/aigc/multimodal-generation/generation"),
        {
            model: options.model,
            input: { messages: [{ role: "user", content }] },
            parameters,
        },
        { headers: dashscopeHeaders(route, "application/json", false, selected.apiKey, selected.credentialId), timeout: options.timeoutMs || 300_000, responseType: interleaved ? "text" : "json" },
    );
    const error = typeof response.data === "string" ? "" : readDashscopeError(response.data);
    const urls = parseDashscopeImageUrls(response.data);
    if (!urls.length) throw new Error(error || "阿里云百炼没有返回图片");
    return urls;
}

export async function createDashscopeImageTask(
    route: ApiRequestRoute,
    options: DashscopeAsyncImageCreateOptions,
): Promise<DashscopeImageTaskSubmission> {
    const references = requireCompleteDashscopeReferences(options.references);
    const modelKey = normalizeDashscopeModelKey(options.model);
    if (modelKey !== "qwen-image" && !modelKey.startsWith("qwen-image-plus")) {
        throw new Error(`${options.model} 不是已验证的 DashScope 异步图片任务模型`);
    }
    if (references.length) throw new Error(`${options.model} 异步文生图合同不接受参考图片`);
    const parameters = serializeDashscopeImageParameters(options.model, options);
    const selected = route.mode === "local"
        ? selectRelayCredential(route.provider)
        : { apiKey: "", credentialId: "" };
    if (!selected.credentialId) throw new Error("DashScope 图片任务凭据缺少稳定标识，未发送生成请求");
    const startedAt = new Date().toISOString();
    const response = await axios.post<DashscopeTaskResponse>(
        dashscopeRequestUrl(route, "/services/aigc/text2image/image-synthesis"),
        {
            model: options.model,
            input: { prompt: options.prompt },
            parameters,
        },
        { headers: dashscopeHeaders(route, "application/json", true, selected.apiKey, selected.credentialId), timeout: Math.min(options.timeoutMs || 120_000, 120_000) },
    );
    const taskId = String(response.data?.output?.task_id || "").trim();
    if (!taskId) throw new Error(readDashscopeError(response.data) || "阿里云百炼没有返回图片任务 ID");
    return { taskId, credentialId: selected.credentialId, startedAt, expectedOutputs: 1 };
}

function requireCompleteDashscopeReferences(values: readonly string[] | undefined): string[] {
    return (values || []).map((value, index) => {
        if (typeof value !== "string" || !value.trim()) {
            throw new Error(`DashScope 参考图第 ${index + 1} 项为空或无效；已停止提交，未发送 HTTP 请求`);
        }
        return value;
    });
}

export async function pollDashscopeImageTask(
    route: ApiRequestRoute,
    taskId: string,
    options: { credentialId?: string; requestTimeoutMs?: number },
): Promise<DashscopeImageTaskState> {
    const response = await axios.get<DashscopeTaskResponse>(dashscopeRequestUrl(route, `/tasks/${encodeURIComponent(taskId)}`), {
        headers: dashscopeHeaders(route, undefined, false, undefined, options.credentialId),
        timeout: Math.min(options.requestTimeoutMs || 60_000, 60_000),
    });
    return parseDashscopeImageTaskState(response.data);
}

export async function waitForDashscopeImageTask(
    route: ApiRequestRoute,
    task: DashscopeImageTaskSubmission,
    options: DashscopeImageWaitOptions = {},
): Promise<string[]> {
    return pollDashscopeImageTaskUntilComplete(route, task.taskId, {
        credentialId: task.credentialId,
        startedAt: task.startedAt,
        ...options,
    });
}

export async function pollDashscopeImageTaskUntilComplete(
    route: ApiRequestRoute,
    taskId: string,
    options: {
        credentialId?: string;
        startedAt?: string;
        requestTimeoutMs?: number;
        taskTimeoutMs?: number;
        wait?: (delayMs: number) => Promise<void>;
    },
) {
    const wait = options.wait || ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
    const taskTimeoutMs = options.taskTimeoutMs || 10 * 60_000;
    const parsedStartedAt = options.startedAt ? Date.parse(options.startedAt) : Date.now();
    if (!Number.isFinite(parsedStartedAt)) throw new Error("阿里云百炼图片任务 startedAt 无效，无法计算总轮询期限");
    const startedAt = parsedStartedAt;
    let attempt = 0;
    while (true) {
        if (Date.now() - startedAt >= taskTimeoutMs) throw new Error(`阿里云百炼图片任务轮询超时（${taskTimeoutMs}ms）`);
        try {
            const remainingMs = taskTimeoutMs - (Date.now() - startedAt);
            const state = await pollDashscopeImageTask(route, taskId, {
                credentialId: options.credentialId,
                requestTimeoutMs: Math.min(options.requestTimeoutMs || 60_000, remainingMs),
            });
            if (state.status === "completed") return state.urls;
            if (state.status === "failed") throw new NativeImageTaskTerminalError(state.error);
        } catch (error) {
            if (!isRetryableDashscopeImagePollError(error)) throw error;
        }
        const delayMs = dashscopeImagePollDelay(attempt);
        if (Date.now() - startedAt + delayMs > taskTimeoutMs) throw new Error(`阿里云百炼图片任务轮询超时（${taskTimeoutMs}ms）`);
        await wait(delayMs);
        attempt += 1;
    }
}

function isRetryableDashscopeImagePollError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return status === undefined || status === 429 || status === 502 || status === 503 || status === 504;
}

export async function createDashscopeVideoTask(
    route: ApiRequestRoute,
    options: {
        model: string;
        prompt: string;
        capability: ResolvedVideoModelCapability;
        referenceIntent: VideoReferenceIntent<string>;
        referenceVideos?: readonly (string | { url: string; useAs?: "reference_video" | "first_clip" | "source_video" })[];
        referenceVoices?: readonly string[];
        hasReferenceVideo?: boolean;
        generationParameters?: VideoGenerationParameters;
        /** @deprecated Use generationParameters.resolution. */
        resolution?: string;
        /** @deprecated Use generationParameters.aspectRatio. */
        ratio?: string;
        /** @deprecated Use generationParameters.duration. */
        duration?: number;
        timeoutMs?: number;
        apiKey?: string;
        credentialId?: string;
    },
): Promise<string> {
    const model = options.model.trim();
    const generationParameters = resolveDashscopeVideoGenerationParameters(options.capability, options);
    const explicitVoices = readDashscopeReferenceVoices(generationParameters.audio);
    const configuredVoices = [...(options.referenceVoices || [])];
    if (explicitVoices.length && configuredVoices.length && !sameStringArray(explicitVoices, configuredVoices)) {
        throw new Error(`${options.capability.providerLabel} / ${model}：参数 audio 与已连接参考音频冲突；不会覆盖或合并未对齐的主体音频`);
    }
    const input = serializeDashscopeVideoInput(options.capability, options.prompt, options.referenceIntent, {
        videos: options.referenceVideos,
        voices: explicitVoices.length ? explicitVoices : configuredVoices,
    });
    applyDashscopeAudioInput(options.capability, input, generationParameters.audio);
    const parameters = serializeDashscopeVideoParameters(options.capability, {
        generationParameters,
        hasReferenceVideo: options.hasReferenceVideo,
    });
    const response = await axios.post<DashscopeTaskResponse>(
        dashscopeRequestUrl(route, "/services/aigc/video-generation/video-synthesis"),
        {
            model,
            input,
            parameters,
        },
        { headers: dashscopeHeaders(route, "application/json", true, options.apiKey, options.credentialId), timeout: options.timeoutMs || 120_000 },
    );
    const taskId = String(response.data?.output?.task_id || "").trim();
    if (!taskId) throw new Error(readDashscopeError(response.data) || "阿里云百炼没有返回视频任务 ID");
    return taskId;
}

export function serializeDashscopeVideoParameters(
    capability: ResolvedVideoModelCapability,
    options: {
        generationParameters?: VideoGenerationParameters;
        /** @deprecated Use generationParameters.resolution. */
        resolution?: string;
        /** @deprecated Use generationParameters.aspectRatio. */
        ratio?: string;
        /** @deprecated Use generationParameters.duration. */
        duration?: number;
        hasReferenceVideo?: boolean;
    },
) {
    const generationParameters = resolveDashscopeVideoGenerationParameters(capability, options);
    assertDashscopeParameterSerializerCoverage(capability, generationParameters);
    const dimensions = readDashscopeDimensions(generationParameters.dimensions);
    const negativePrompt = typeof generationParameters.negativePrompt === "string"
        ? generationParameters.negativePrompt.trim()
        : "";
    return {
        ...(typeof generationParameters.duration === "number" ? { duration: generationParameters.duration } : {}),
        ...(typeof generationParameters.resolution === "string" ? { resolution: generationParameters.resolution } : {}),
        ...(dimensions ? { size: `${dimensions.width}*${dimensions.height}` } : {}),
        ...(typeof generationParameters.aspectRatio === "string" ? { ratio: generationParameters.aspectRatio } : {}),
        ...(typeof generationParameters.audio === "boolean" ? { audio: generationParameters.audio } : {}),
        ...(typeof generationParameters.audioMode === "string" ? { audio_setting: generationParameters.audioMode } : {}),
        ...(typeof generationParameters.watermark === "boolean" ? { watermark: generationParameters.watermark } : {}),
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        ...(typeof generationParameters.seed === "number" ? { seed: generationParameters.seed } : {}),
        ...(typeof generationParameters.promptExpansion === "boolean" ? { prompt_extend: generationParameters.promptExpansion } : {}),
    };
}

function resolveDashscopeVideoGenerationParameters(
    capability: ResolvedVideoModelCapability,
    options: {
        generationParameters?: VideoGenerationParameters;
        resolution?: string;
        ratio?: string;
        duration?: number;
        hasReferenceVideo?: boolean;
    },
) {
    const generationParameters = options.generationParameters || legacyDashscopeVideoGenerationParameters(capability, options);
    return validateVideoGenerationParameters(capability, generationParameters, {
        hasReferenceVideo: options.hasReferenceVideo,
    });
}

function legacyDashscopeVideoGenerationParameters(
    capability: ResolvedVideoModelCapability,
    options: { resolution?: string; ratio?: string; duration?: number },
): VideoGenerationParameters {
    const parameters: VideoGenerationParameters = {
        ...(options.duration !== undefined ? { duration: options.duration } : {}),
    };
    if (capability.generationParameters.dimensions.status === "supported" && options.resolution) {
        parameters.dimensions = dashscopeVideoDimensions(options.resolution, options.ratio);
    } else {
        if (options.resolution) parameters.resolution = exactDashscopeResolution(options.resolution);
        if (options.ratio && capability.generationParameters.aspectRatio.status === "supported") parameters.aspectRatio = options.ratio;
    }
    return parameters;
}

function exactDashscopeResolution(value: string) {
    const raw = value.trim().toUpperCase();
    if (raw === "720" || raw === "720P") return "720P";
    if (raw === "1080" || raw === "1080P") return "1080P";
    if (raw === "480" || raw === "480P") return "480P";
    return value;
}

function dashscopeVideoDimensions(resolution: string, ratio = "16:9") {
    const tier = exactDashscopeResolution(resolution);
    if (tier !== "720P" && tier !== "1080P") {
        throw new Error(`DashScope 视频参数 resolution=${resolution} 不能精确映射到 Wan2.6 size；不会替换为其他分辨率`);
    }
    if (!["16:9", "9:16", "1:1", "4:3", "3:4"].includes(ratio)) {
        throw new Error(`DashScope 视频参数 aspectRatio=${ratio} 不能精确映射到 Wan2.6 size；不会替换为其他比例`);
    }
    const dimensionsByTier: Record<string, Record<string, string>> = {
        "720P": { "16:9": "1280x720", "9:16": "720x1280", "1:1": "960x960", "4:3": "1088x832", "3:4": "832x1088" },
        "1080P": { "16:9": "1920x1080", "9:16": "1080x1920", "1:1": "1440x1440", "4:3": "1632x1248", "3:4": "1248x1632" },
    };
    return dimensionsByTier[tier][ratio];
}

function readDashscopeDimensions(value: unknown) {
    if (value === undefined) return undefined;
    if (typeof value === "object" && value !== null && "width" in value && "height" in value) {
        const width = value.width;
        const height = value.height;
        if (typeof width === "number" && typeof height === "number") return { width, height };
        return undefined;
    }
    if (typeof value !== "string") return undefined;
    const match = /^(\d+)\s*[x*×]\s*(\d+)$/.exec(value.trim());
    if (!match) return undefined;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function readDashscopeReferenceVoices(value: unknown) {
    return Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : [];
}

function applyDashscopeAudioInput(
    capability: ResolvedVideoModelCapability,
    input: Record<string, unknown>,
    audio: unknown,
) {
    if (typeof audio !== "string" || !audio.trim()) return;
    const url = audio.trim();
    const transport = capability.generationParameters.audio.transportName;
    if (transport === "input.audio_url") {
        input.audio_url = url;
        return;
    }
    if (transport === "input.media[type=driving_audio].url") {
        const media = Array.isArray(input.media) ? [...input.media] : [];
        media.push({ type: "driving_audio", url });
        input.media = media;
        return;
    }
    throw new Error(`${capability.providerLabel} / ${capability.model}：参数 audio 的提交字段 ${transport || "未声明"} 尚未接通`);
}

function assertDashscopeParameterSerializerCoverage(
    capability: ResolvedVideoModelCapability,
    generationParameters: VideoGenerationParameters,
) {
    const handled = new Set([
        "duration", "resolution", "dimensions", "aspectRatio", "audio", "audioMode", "watermark",
        "negativePrompt", "seed", "promptExpansion",
    ]);
    for (const [name, value] of Object.entries(generationParameters)) {
        if (!isProvidedDashscopeValue(value) || handled.has(name)) continue;
        throw new Error(`${capability.providerLabel} / ${capability.model}：参数 ${name} 已通过能力校验，但 DashScope 提交字段尚未接通`);
    }
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isProvidedDashscopeValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function normalizeDashscopeModelKey(model: string) {
    return String(model || "").trim().toLowerCase().replace(/[._]+/g, "-").replace(/-+/g, "-");
}

export type DashscopeVideoTaskState =
    | { status: "pending" }
    | { status: "completed"; url: string }
    | { status: "failed"; error: string };

export async function pollDashscopeVideoTask(route: ApiRequestRoute, taskId: string, timeoutMs?: number, apiKey?: string, credentialId?: string): Promise<DashscopeVideoTaskState> {
    const response = await axios.get<DashscopeTaskResponse>(dashscopeRequestUrl(route, `/tasks/${encodeURIComponent(taskId)}`), {
        headers: dashscopeHeaders(route, undefined, false, apiKey, credentialId),
        timeout: timeoutMs || 60_000,
    });
    const output = response.data?.output;
    const status = String(output?.task_status || "").toUpperCase() as DashscopeVideoStatus;
    const upstreamError = readDashscopeError(response.data);
    if (upstreamError) return { status: "failed", error: upstreamError };
    if (status === "SUCCEEDED") {
        const url = String(output?.video_url || "").trim();
        if (!url) return { status: "failed", error: "阿里云百炼任务成功但没有返回视频 URL" };
        return { status: "completed", url };
    }
    if (status === "UNKNOWN") {
        return { status: "failed", error: "阿里云百炼视频任务不存在或已过期（task_id 仅 24 小时内有效），请重新生成" };
    }
    if (status === "FAILED" || status === "CANCELED") {
        return { status: "failed", error: `阿里云百炼视频生成${status === "CANCELED" ? "已取消" : "失败"}` };
    }
    if (status === "PENDING" || status === "RUNNING") return { status: "pending" };
    return { status: "failed", error: `阿里云百炼视频任务返回未知状态：${status || "空"}` };
}
