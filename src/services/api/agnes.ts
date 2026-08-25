import type { ApiRequestRoute } from "@/services/api/ai-routing";
import {
    resolveVideoModelCapability,
    serializeAgnesVideoReferences,
    validateVideoGenerationParameters,
    type ResolvedVideoModelCapability,
    type VideoGenerationParameters,
    type VideoReferenceIntent,
} from "@/services/api/video-model-capabilities";

/**
 * Agnes AI 图片/视频适配。
 *
 * 官方协议（https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash.md，已核实）：
 * - POST {baseUrl}/images/generations
 * - 必填 model/prompt/size；size 为档位 "1K"|"2K"|"3K"|"4K"
 * - ratio 可选："1:1"|"3:4"|"4:3"|"16:9"|"9:16"|"2:3"|"3:2"|"21:9"
 * - 输出格式只能通过 extra_body.response_format 指定；顶层 response_format
 *   会被网关拒绝（实测：UnsupportedParamsError），也不能传 n/quality/output_size。
 * - 返回 data[0].url 或 data[0].b64_json。
 */

const AGNES_HOST_PATTERN = /(^|\.)agnes-ai\.com$/i;

export const AGNES_IMAGE_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"] as const;

export function isAgnesBaseUrl(baseUrl: string) {
    try {
        return AGNES_HOST_PATTERN.test(new URL(baseUrl.trim()).hostname);
    } catch {
        return false;
    }
}

export function isAgnesRoute(route: ApiRequestRoute) {
    if (route.mode !== "local") return false;
    const adapterType = String((route.provider as { adapterType?: string }).adapterType || "").toLowerCase();
    if (adapterType) return adapterType === "agnes";
    return isAgnesBaseUrl(route.provider.baseUrl);
}

/** 质量档位映射到 Agnes size 档位。 */
export function agnesImageSizeTier(quality: string | undefined) {
    const value = String(quality || "").toLowerCase();
    if (value === "medium" || value === "2k") return "2K";
    if (value === "3k") return "3K";
    if (value === "high" || value === "4k") return "4K";
    return "1K";
}

/** config.size 若是合法宽高比则透传，否则省略（由 Agnes 默认 1:1）。 */
export function agnesImageRatio(size: string) {
    const value = String(size || "").trim();
    return (AGNES_IMAGE_RATIOS as readonly string[]).includes(value) ? value : "";
}

export type AgnesVideoTaskIdentity = {
    taskId: string;
    videoId?: string;
};

export function buildAgnesVideoPayload(options: {
    model: string;
    prompt: string;
    referenceIntent: VideoReferenceIntent<string>;
    capability?: ResolvedVideoModelCapability;
    generationParameters?: VideoGenerationParameters;
    /** @deprecated Use generationParameters.dimensions. */
    width?: number;
    /** @deprecated Use generationParameters.dimensions. */
    height?: number;
    /** @deprecated Use generationParameters.frames. */
    numFrames?: number;
    /** @deprecated Use generationParameters.fps. */
    frameRate?: number;
}) {
    const capability = options.capability || resolveVideoModelCapability({
        model: options.model,
        provider: { name: "Agnes", adapterType: "agnes" },
    });
    const generationParameters: VideoGenerationParameters = options.generationParameters || {
        ...(options.width !== undefined && options.height !== undefined
            ? { dimensions: { width: options.width, height: options.height } }
            : {}),
        ...(options.numFrames !== undefined ? { frames: options.numFrames } : {}),
        ...(options.frameRate !== undefined ? { fps: options.frameRate } : {}),
    };
    const prompt = options.prompt.trim();
    if (!prompt) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：提示词 prompt 为官方必填字段，不能仅凭图片或关键帧提交`);
    }
    validateVideoGenerationParameters(capability, generationParameters);
    validateAgnesReferenceIntent(capability, options.referenceIntent);
    const dimensions = readAgnesDimensions(generationParameters.dimensions);
    const negativePrompt = typeof generationParameters.negativePrompt === "string"
        ? generationParameters.negativePrompt.trim()
        : "";
    return {
        model: options.model,
        prompt,
        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
        ...(typeof generationParameters.frames === "number" ? { num_frames: generationParameters.frames } : {}),
        ...(typeof generationParameters.fps === "number" ? { frame_rate: generationParameters.fps } : {}),
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        ...(typeof generationParameters.seed === "number" ? { seed: generationParameters.seed } : {}),
        ...(typeof generationParameters.steps === "number" ? { num_inference_steps: generationParameters.steps } : {}),
        ...serializeAgnesVideoReferences(options.referenceIntent),
    };
}

function validateAgnesReferenceIntent(
    capability: ResolvedVideoModelCapability,
    intent: VideoReferenceIntent<string>,
) {
    if (intent.kind !== "keyframes") return;
    if (!capability.supportsKeyframeSequence) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：当前精确 profile 不支持多关键帧`);
    }
    const count = intent.keyframes.length;
    const minimum = capability.keyframeImageMinimum;
    if (typeof minimum === "number" && count < minimum) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：关键帧至少 ${minimum} 张，当前为 ${count} 张；未发送 HTTP 请求`);
    }
    const maximum = capability.keyframeImageLimit;
    if (typeof maximum === "number" && count > maximum) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：关键帧最多 ${maximum} 张，当前为 ${count} 张；不会自动截断，未发送 HTTP 请求`);
    }
}

function readAgnesDimensions(value: unknown) {
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

/** Agnes 创建响应在不同入口可能返回 id、task_id 或 video_id。 */
export function readAgnesVideoTaskIdentity(payload: unknown): AgnesVideoTaskIdentity | null {
    if (!payload || typeof payload !== "object") return null;
    const root = payload as Record<string, unknown>;
    const data = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? (root.data as Record<string, unknown>) : undefined;
    const taskId = firstNonEmptyString(root.id, root.task_id, root.video_id, data?.id, data?.task_id, data?.video_id);
    if (!taskId) return null;
    const videoId = firstNonEmptyString(root.video_id, data?.video_id);
    return { taskId, ...(videoId ? { videoId } : {}) };
}

export function agnesVideoOriginUrl(baseUrl: string, videoId: string) {
    const url = new URL("/agnesapi", baseUrl);
    url.searchParams.set("video_id", videoId);
    return url.toString();
}

function firstNonEmptyString(...values: unknown[]) {
    for (const value of values) {
        const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
        if (text) return text;
    }
    return "";
}
