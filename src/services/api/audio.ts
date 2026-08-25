import axios from "axios";

import { audioMimeType, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import {
    assertAudioModelRequest,
    resolveAudioModelCapability,
    type AudioOperation,
} from "@/services/api/audio-model-capabilities";
import { explicitMediaRequestModel, resolveApiRequestRoute, routedLocalApiUrl, routedLocalHeaders, type ApiRequestRoute } from "@/services/api/ai-routing";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { providerDisplayName } from "@/stores/api-relay-config";
import { type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { getStoredAuthKey } from "@/store/auth";
import { detectTextApiResponseError } from "@/services/api/text-response-errors";

export const AUDIO_GENERATION_OPERATION: AudioOperation = "text-to-speech";

function aiApiUrl(config: AiConfig, route: ApiRequestRoute, path: string) {
    return route.mode === "local" ? routedLocalApiUrl(route, path) : `/api/v1${path}`;
}

async function aiHeaders(config: AiConfig, route: ApiRequestRoute) {
    if (route.mode === "local") return routedLocalHeaders(route, "application/json");
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
    };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export async function requestAudioGeneration(config: AiConfig, prompt: string): Promise<Blob> {
    const { route, capability } = resolveAudioGenerationRequestCapability(config);
    const model = capability.model;
    const voice = configuredAudioValue(config.audioVoice, normalizeAudioVoiceValue, "alloy");
    const format = configuredAudioValue(config.audioFormat, normalizeAudioFormatValue, "mp3");
    const speed = configuredAudioSpeed(config.audioSpeed);
    const instructions = config.audioInstructions.trim();
    assertAudioModelRequest(capability, {
        operation: AUDIO_GENERATION_OPERATION,
        input: prompt,
        format,
        speed,
        instructions,
    });

    try {
        const response = await axios.post<Blob>(
            aiApiUrl(config, route, capability.serialization.endpoint),
            {
                model,
                input: prompt,
                voice,
                response_format: format,
                speed,
                ...(instructions ? { instructions } : {}),
            },
            { headers: await aiHeaders(config, route), responseType: "blob", timeout: route.timeoutMs },
        );
        await assertAudioBlob(response.data);
        refreshRemoteUser(config);
        return response.data.type.startsWith("audio/") ? response.data : new Blob([response.data], { type: audioMimeType(format) });
    } catch (error) {
        throw new Error(await readAxiosError(error, "音频生成失败"));
    }
}

function configuredAudioValue(value: string, normalize: (value: string) => string, fallback: string) {
    const raw = String(value || "").trim();
    return raw || normalize(fallback);
}

function configuredAudioSpeed(value: string) {
    const raw = String(value || "").trim();
    if (!raw) return Number(normalizeAudioSpeedValue(""));
    const speed = Number(raw);
    if (!Number.isFinite(speed)) throw new Error(`音频语速“${raw}”不是有效数字；已停止提交`);
    return speed;
}

export function resolveAudioGenerationRoute(config: AiConfig) {
    return resolveApiRequestRoute(config, "audio", explicitMediaRequestModel(config, "audio"));
}

export function resolveAudioGenerationRequestCapability(
    config: AiConfig,
    operation: AudioOperation = AUDIO_GENERATION_OPERATION,
) {
    const route = resolveAudioGenerationRoute(config);
    const model = route.model.trim();
    if (!model) throw new Error("请先选择音频模型");
    const provider = route.mode === "local"
        ? { ...route.provider, displayName: providerDisplayName(route.provider, config.apiRelays || []) }
        : undefined;
    const capability = resolveAudioModelCapability({ model, operation, provider });
    return { route, capability };
}

export function audioGenerationPreflightError(config: AiConfig) {
    try {
        const { capability } = resolveAudioGenerationRequestCapability(config);
        assertAudioModelRequest(capability, {
            operation: AUDIO_GENERATION_OPERATION,
            format: configuredAudioValue(config.audioFormat, normalizeAudioFormatValue, "mp3"),
            speed: configuredAudioSpeed(config.audioSpeed),
            instructions: config.audioInstructions.trim(),
        });
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : "音频生成配置无效";
    }
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
}

export async function assertAudioBlob(blob: Blob) {
    if (!blob.size) throw new Error("音频生成返回了空文件");
    const contentType = String(blob.type || "").toLowerCase().split(";", 1)[0].trim();
    if (contentType.startsWith("audio/")) return;
    if (!contentType.includes("json")) {
        throw new Error(`音频生成返回了 ${contentType || "未知文件类型"}，而不是音频文件`);
    }
    let payload: { code?: number; msg?: string; message?: string; error?: { message?: string } | string };
    try {
        payload = JSON.parse(await blob.text()) as typeof payload;
    } catch {
        throw new Error("音频生成返回了无效 JSON，而不是音频文件");
    }
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(
            detectTextApiResponseError(payload, { operation: "音频生成失败" }) ||
            "音频生成失败：上游返回错误，请检查请求配置后重试",
        );
    }
    if (payload.error) {
        throw new Error(
            detectTextApiResponseError(payload, { operation: "音频生成失败" }) ||
            "音频生成失败：上游返回错误，请检查请求配置后重试",
        );
    }
    throw new Error("音频生成返回了 JSON，而不是音频文件");
}

async function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ detail?: unknown; error?: unknown; message?: string; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        if (responseData instanceof Blob) {
            try {
                const payload = JSON.parse(await responseData.text()) as unknown;
                return detectTextApiResponseError(payload, {
                    status: error.response?.status,
                    operation: fallback,
                }) || statusMessage(error.response?.status, fallback);
            } catch {
                return statusMessage(error.response?.status, fallback);
            }
        }
        return detectTextApiResponseError(responseData, {
            status: error.response?.status,
            operation: fallback,
        }) || statusMessage(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}
