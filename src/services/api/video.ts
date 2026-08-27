import axios from "axios";

import { desktopApiUrl } from "@/services/desktop-api-url";

import { dataUrlToFile } from "@/lib/image-utils";
import { explicitMediaRequestModel, resolveApiRequestRoute, routedLocalApiUrl, routedLocalHeaders, type ApiRequestRoute } from "@/services/api/ai-routing";
import { agnesVideoOriginUrl, buildAgnesVideoPayload, isAgnesRoute, readAgnesVideoTaskIdentity } from "@/services/api/agnes";
import { createDashscopeVideoTask, isDashscopeRoute, pollDashscopeVideoTask } from "@/services/api/dashscope";
import { createCivitaiWorkflow, isCivitaiRoute, pollCivitaiWorkflow, resolveCivitaiRouteService } from "@/services/api/civitai-client";
import { buildCivitaiVideoWorkflow, civitaiAllowsMatureContent } from "@/services/api/civitai-orchestration";
import { resolveCivitaiVideoMediaContract } from "@/services/api/civitai-video-media-contract.mjs";
import {
    createVideoGenerationResult,
    videoGenerationResultOutputs,
    type VideoGenerationOutput,
    type VideoGenerationResult,
} from "@/services/api/video-generation-result";
import { buildLocalRelayProxyHeaders, buildProviderProxyHeaders, rotateRelayApiKey } from "@/services/api/relay-proxy";
import { describeTextTransportError, detectTextApiResponseError } from "@/services/api/text-response-errors";
import { assertVideoResponseBlob, InvalidVideoResponseError, VIDEO_RESULT_DOWNLOAD_TIMEOUT_MS } from "@/services/api/video-download-policy";
import {
    createVideoTaskPollingRequestError,
    normalizeVideoTaskProviderStatus,
} from "@/services/api/video-task-polling-policy";
import {
    assertConfiguredVideoCapabilityProfileCompatibility,
    buildVideoReferenceIntent,
    buildVideoReferencePromptText,
    mapVideoReferenceIntent,
    nativeVideoAdapterType,
    resolveVideoModelCapability,
    serializeSeedanceImageContent,
    validateVideoGenerationParameters,
    videoReferenceIntentItems,
    type ResolvedVideoModelCapability,
    type VideoGenerationParameters,
    type VideoReferenceImage,
    type VideoReferenceIntent,
} from "@/services/api/video-model-capabilities";
import { resolveVideoReferenceSlotContract } from "@/services/api/video-reference-slot-contract";
import { videoPromptPreflightError } from "@/services/api/video-prompt-contract";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { uploadImageToConfiguredHost } from "@/services/image-host-upload";
import { buildSeedancePromptText, isSeedanceVideoConfig, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { providerDisplayName, type ApiBoardRouteKey } from "@/stores/api-relay-config";
import {
    videoConfigToGenerationParameters,
    videoGenerationOperationFromIntent,
    type AiConfig,
    type VideoGenerationOperation,
    type VideoGenerationSettings,
} from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useMembershipStore } from "@/studio/membership";
import {
    buildXaiImagineVideoBody,
    isXaiImagineVideoModel,
    readXaiImaginePoll,
    readXaiImagineRequestId,
    xaiImagineCreatePath,
    xaiImaginePollPath,
} from "@/studio/adapters/contracts";
import { getStoredAuthKey } from "@/store/auth";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id?: string; task_id?: string; video_id?: string; status?: string; url?: string; metadata?: { url?: string }; error?: { message?: string } };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type RelayVideoTask = {
    id?: string;
    task_id?: string;
    status?: string;
    file_urls?: string[];
    files?: string[];
    result?: string;
    message?: string;
    error?: { code?: string; message?: string } | string | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type RelayVideoResponse = RelayVideoTask & {
    success?: boolean;
    code?: string | number;
    msg?: string;
    detail?: unknown;
    task?: RelayVideoTask;
    tasks?: RelayVideoTask[];
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type ReferenceMediaUploadResponse = { id: string; url: string; mimeType: string; bytes: number };

export type { VideoGenerationOutput, VideoGenerationResult } from "@/services/api/video-generation-result";
export type VideoGenerationTask = {
    id: string;
    provider: "openai" | "seedance" | "dashscope" | "agnes" | "civitai" | "xai-imagine";
    model: string;
    route?: ApiRequestRoute;
    apiKey?: string;
    agnesVideoId?: string;
    /** Requested provider batch cardinality; persisted so resumed polls enforce the same contract. */
    expectedOutputs?: number;
};
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };
export type VideoGenerationRequestOptions = {
    /** Provider + model + operation scoped values. Invalid or unpublished non-empty fields are rejected. */
    generationParameters?: VideoGenerationSettings;
    /** Required when one capability exposes mutually exclusive frame and reference-set operations. */
    operation?: VideoGenerationOperation;
};

export type ResolvedVideoGenerationRequestCapability = {
    readonly route: ApiRequestRoute;
    readonly model: string;
    readonly capability: ResolvedVideoModelCapability;
};

function aiApiUrl(config: AiConfig, route: ApiRequestRoute, path: string) {
    return route.mode === "local" ? routedLocalApiUrl(route, path) : `/api/v1${path}`;
}

async function aiHeaders(config: AiConfig, route: ApiRequestRoute, contentType?: string, overrideKey?: string) {
    if (route.mode === "local") return overrideKey ? (buildLocalRelayProxyHeaders(route.provider, contentType, overrideKey) as Record<string, string>) : routedLocalHeaders(route, contentType);
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: VideoReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], boardRouteKey?: ApiBoardRouteKey, options: VideoGenerationRequestOptions = {}): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, boardRouteKey, options);
    const delayMs = task.provider === "seedance" || task.provider === "civitai" ? 5000 : 2500;
    const timeoutMs = task.route?.timeoutMs ?? 360_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await pollVideoGenerationTask(config, task);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        await delay(Math.min(delayMs, Math.max(0, deadline - Date.now())));
    }
    throw new Error(`${task.provider === "seedance" ? "Seedance " : ""}视频生成超时，请稍后重试`);
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: VideoReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], boardRouteKey?: ApiBoardRouteKey, options: VideoGenerationRequestOptions = {}): Promise<VideoGenerationTask> {
    const { route, model, capability } = resolveVideoGenerationRequestCapability(config, boardRouteKey);
    if (!options.operation) {
        throw new Error(`${capability.providerLabel} / ${model || "未命名模型"}：缺少显式视频 operation；必须显式选择视频 operation，已阻止按引用数量或用途猜测付费请求类型，未发送 HTTP 请求`);
    }
    assertVideoConfig(config, model);
    const promptError = videoPromptPreflightError(capability, prompt, {
        imageCount: references.length,
        videoCount: videoReferences.length,
        audioCount: audioReferences.length,
    });
    if (promptError) throw new Error(`${capability.providerLabel} / ${model}：${promptError}`);
    if (route.mode === "local" && isCivitaiRoute(route)) {
        preflightCivitaiMediaContract(model, references, videoReferences, audioReferences);
    }
    const firstClipCount = videoReferences.filter((video) => video.useAs === "first_clip").length;
    const slotContract = resolveVideoReferenceSlotContract({
        capability,
        operation: options.operation,
        references,
        videos: videoReferences,
    });
    if (slotContract.state === "blocked") {
        let blockedMessage = "";
        try {
            // Preserve provider-specific video cardinality/purpose errors while
            // keeping the shared blocked contract ahead of intent and transport.
            validateVideoInputs(capability, videoReferences);
        } catch (error) {
            blockedMessage = error instanceof Error ? error.message : String(error);
        }
        if (!blockedMessage) {
            const contractReason = slotContract.reason || "当前视频参考媒体合同已阻止提交";
            const profilePrefix = capability.requiresExplicitProfile
                ? "没有已验证的 video capability profile/serializer；"
                : "";
            blockedMessage = `${capability.providerLabel} / ${model || "未命名模型"}：${profilePrefix}${contractReason}`;
        }
        throw new Error(`${blockedMessage}，未发送 HTTP 请求`);
    }
    if (slotContract.notSubmitted.length) {
        const reasons = Array.from(new Set(slotContract.notSubmitted.map((item) => item.reason)));
        throw new Error(
            `${capability.providerLabel} / ${model || "未命名模型"}：当前 ${references.length} 张图片中有 ${slotContract.notSubmitted.length} 张不会提交（${reasons.join("；")}）；允许的图片槽位为 ${slotContract.state === "unbounded" ? "官方未公布上限" : slotContract.visibleImageSlotPurposes.length} 个。请调整用途或移除超限引用后重试，未发送 HTTP 请求`,
        );
    }
    const referenceIntent = buildVideoReferenceIntent(capability, references, { allowLoneLastFrame: firstClipCount === 1 && capability.id === "dashscope-wan27-i2v" });
    const operation = videoGenerationOperationFromIntent({
        capability,
        referenceIntent,
        hasReferenceVideo: videoReferences.length > 0,
        hasReferenceAudio: audioReferences.length > 0,
        hasFirstClip: firstClipCount > 0,
    });
    if (options.operation && options.operation !== operation) {
        throw new Error(`${capability.providerLabel} / ${model}：显式 operation ${options.operation} 与当前引用用途解析出的 ${operation} 不一致；未发送 HTTP 请求`);
    }
    const scope = {
        providerId: route.mode === "local" ? route.provider.id : route.mode,
        model,
        operation,
    } as const;
    const generationParameters = videoConfigToGenerationParameters(
        config,
        scope,
        capability,
        options.generationParameters,
    );
    validateVideoGenerationParameters(capability, generationParameters, {
        hasReferenceVideo: videoReferences.length > 0,
    });
    const adapter = route.mode === "local" ? nativeVideoAdapterType(route.provider) : "";
    // Agnes wire semantics require an exact Agnes route. A model name alone
    // must never select the Agnes serializer on a provider-less/compatible
    // endpoint; the capability resolver already fail-closes that route.
    const usesAgnesContract = isAgnesRoute(route) && capability.id === "agnes-video-v2";

    if (referenceIntent.kind === "keyframes" && !usesAgnesContract) {
        throw new Error(`${capability.providerLabel} / ${model}：多关键帧是 Agnes 专用合同，不能提交到当前 Endpoint；请改用 Agnes Provider，或改成该模型明确支持的参考图模式`);
    }
    if (usesAgnesContract) {
        if (videoReferences.length || audioReferences.length) {
            throw new Error(`${capability.providerLabel} / ${model}：不支持参考视频或参考音频，请只使用参考图片`);
        }
        return createAgnesVideoTask(config, route, model, capability, referenceIntent, prompt, generationParameters);
    }
    if (isDashscopeRoute(route)) {
        validateVideoInputs(capability, videoReferences);
        const supportsVideoInput = capability.videoInputPolicy.supported;
        const supportsAudioInput = capability.id === "dashscope-wan27-r2v" || (capability.id === "dashscope-wan27-i2v" && firstClipCount === 0);
        if ((!supportsVideoInput && videoReferences.length) || (!supportsAudioInput && audioReferences.length)) {
            throw new Error(`${capability.providerLabel} / ${model}：不支持参考视频或参考音频，请只使用参考图片`);
        }
        return createDashscopeTask(config, route, model, capability, referenceIntent, prompt, videoReferences, audioReferences, generationParameters);
    }
    if (route.mode === "local" && isCivitaiRoute(route)) {
        return createCivitaiVideoTask(config, route, model, referenceIntent, prompt, videoReferences, audioReferences, generationParameters);
    }
    // Ark serialization is allowed only when both the resolved route adapter
    // and the resolved capability agree. Model names and global base URLs are
    // not provider identity and must never select a paid wire protocol.
    const usesArkContract = adapter === "ark" && capability.provider === "ark";
    if (usesArkContract) {
        return createSeedanceTask(config, route, model, capability, referenceIntent, prompt, references, videoReferences, audioReferences, generationParameters, options.operation);
    }
    if (isXaiImagineVideoModel(model)) {
        return createXaiImagineVideoTask(config, route, model, capability, referenceIntent, prompt, generationParameters);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error(`${capability.providerLabel} / ${model}：不支持参考视频或参考音频，请切换到 Seedance 2.0，或移除参考素材`);
    }
    return createOpenAIVideoTask(config, route, model, capability, referenceIntent, prompt, generationParameters, options.operation);
}

export function resolveVideoGenerationRequestCapability(
    config: AiConfig,
    boardRouteKey?: ApiBoardRouteKey,
): ResolvedVideoGenerationRequestCapability {
    const route = resolveApiRequestRoute(config, "video", explicitMediaRequestModel(config, "video"), boardRouteKey);
    const model = route.model.trim();
    if (route.mode === "local") assertConfiguredVideoCapabilityProfileCompatibility(route.provider, model);
    return {
        route,
        model,
        capability: resolveVideoModelCapability({
            model,
            provider: route.mode === "local"
                ? { ...route.provider, displayName: providerDisplayName(route.provider, config.apiRelays || []) }
                : undefined,
        }),
    };
}

export function isAgnesVideoModel(model: string) {
    return /^agnes-video/i.test(model.trim());
}

async function createAgnesVideoTask(
    config: AiConfig,
    route: ApiRequestRoute,
    model: string,
    capability: ResolvedVideoModelCapability,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    generationParameters: VideoGenerationParameters,
): Promise<VideoGenerationTask> {
    const text = prompt.trim();
    if (!text) throw new Error(`Agnes / ${model}：提示词 prompt 为官方必填字段，不能仅凭图片或关键帧提交`);
    const publicIntent = await resolveVideoReferenceIntent(config, referenceIntent);
    const payload = buildAgnesVideoPayload({
        model,
        prompt: text,
        capability,
        generationParameters,
        referenceIntent: publicIntent,
    });
    try {
        // Agnes 任务按 Key 分片；创建和全部轮询必须使用同一把 Key。
        const pinnedKey = route.mode === "local" ? rotateRelayApiKey(route.provider) : "";
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, route, "/videos"), payload, { headers: await aiHeaders(config, route, "application/json", pinnedKey || undefined), timeout: route.timeoutMs })).data);
        const identity = readAgnesVideoTaskIdentity(created);
        if (!identity) throw new Error("Agnes 视频接口没有返回 id、task_id 或 video_id");
        return {
            id: identity.taskId,
            provider: "agnes",
            model,
            route,
            apiKey: pinnedKey || undefined,
            ...(identity.videoId ? { agnesVideoId: identity.videoId } : {}),
        };
    } catch (error) {
        throw new Error(readAxiosError(error, `Agnes / ${model} 视频任务创建失败`));
    }
}

// Agnes 任务创建后立刻查询可能返回 400 task_not_exist（读写竞争），
// 宽限期内按 pending 处理而不是直接判失败。
const agnesPollNotFoundSince = new Map<string, number>();
const AGNES_POLL_NOT_FOUND_GRACE_MS = 90_000;

async function pollAgnesVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        const video = await fetchAgnesVideoState(config, route, task);
        const status = normalizeVideoTaskProviderStatus(video.status);
        if (status === "completed" || status === "succeeded" || status === "success") {
            const url = video.metadata?.url || video.url;
            if (!url) return { status: "failed", error: `Agnes / ${task.model}：任务成功但没有返回视频 URL` };
            refreshRemoteUser(config);
            agnesPollNotFoundSince.delete(task.id);
            return { status: "completed", result: await videoResultFromUrl(url, route) };
        }
        if (status === "failed" || status === "cancelled" || status === "canceled") {
            agnesPollNotFoundSince.delete(task.id);
            return { status: "failed", error: video.error?.message || `Agnes / ${task.model} 视频生成失败` };
        }
        return { status: "pending" };
    } catch (error) {
        if (isAgnesTaskNotFoundError(error)) {
            const now = Date.now();
            const since = agnesPollNotFoundSince.get(task.id) ?? now;
            agnesPollNotFoundSince.set(task.id, since);
            if (now - since < AGNES_POLL_NOT_FOUND_GRACE_MS) return { status: "pending" };
            agnesPollNotFoundSince.delete(task.id);
        }
        throw createVideoTaskPollingRequestError(
            error,
            readAxiosError(error, `Agnes / ${task.model} 视频任务查询失败`),
        );
    }
}

async function fetchAgnesVideoState(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask) {
    if (task.agnesVideoId && route.mode === "local") {
        try {
            const originUrl = agnesVideoOriginUrl(route.provider.baseUrl, task.agnesVideoId);
            const response = await axios.get<ApiVideoResponse>(desktopFetchedResourceUrl(originUrl), {
                headers: {
                    ...buildProviderProxyHeaders(route.provider),
                    ...(task.apiKey ? { Authorization: `Bearer ${task.apiKey}` } : {}),
                },
                timeout: route.timeoutMs,
            });
            return unwrapVideoResponse(response.data);
        } catch (error) {
            // Only a confirmed missing endpoint is compatible with the legacy
            // route. Authentication, network, and upstream failures must be
            // surfaced instead of being reinterpreted as a pending task.
            if (!isAgnesTaskNotFoundError(error)) throw error;
        }
    }
    return unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, route, `/videos/${encodeURIComponent(task.id)}`), {
        headers: await aiHeaders(config, route, undefined, task.apiKey),
        timeout: route.timeoutMs,
    })).data);
}

type CivitaiVideoReferenceParts = {
    referenceKind: Exclude<VideoReferenceIntent<string>["kind"], "keyframes" | "last_frame">;
    images: string[];
    firstFrameImage?: string;
    lastFrameImage?: string;
    referenceImages: string[];
};

function partitionCivitaiVideoReferences(intent: VideoReferenceIntent<string>): CivitaiVideoReferenceParts {
    if (intent.kind === "none") return { referenceKind: intent.kind, images: [], referenceImages: [] };
    if (intent.kind === "last_frame") throw new Error("Civitai 不接受缺少首帧的单独尾帧 intent");
    if (intent.kind === "first_frame") {
        return { referenceKind: intent.kind, images: [intent.firstFrame], firstFrameImage: intent.firstFrame, referenceImages: [] };
    }
    if (intent.kind === "first_last_frame") {
        return {
            referenceKind: intent.kind,
            images: [intent.firstFrame, intent.lastFrame],
            firstFrameImage: intent.firstFrame,
            lastFrameImage: intent.lastFrame,
            referenceImages: [],
        };
    }
    if (intent.kind === "reference_set") {
        return { referenceKind: intent.kind, images: [...intent.references], referenceImages: intent.references };
    }
    if (intent.kind === "reference_set_with_first") {
        return {
            referenceKind: intent.kind,
            images: [intent.firstFrame, ...intent.references],
            firstFrameImage: intent.firstFrame,
            referenceImages: intent.references,
        };
    }
    if (intent.kind === "reference_set_with_frames") {
        return {
            referenceKind: intent.kind,
            images: [intent.firstFrame, ...intent.references, intent.lastFrame].filter((image): image is string => Boolean(image)),
            firstFrameImage: intent.firstFrame,
            lastFrameImage: intent.lastFrame,
            referenceImages: intent.references,
        };
    }
    if (intent.kind === "keyframes") {
        throw new Error("Civitai 当前工作流合同未定义 Agnes 多关键帧字段，已停止提交以避免错误降级");
    }
    throw new Error("Civitai 收到未识别的视频参考 intent，已停止提交");
}

async function createCivitaiVideoTask(
    config: AiConfig,
    route: Extract<ApiRequestRoute, { mode: "local" }>,
    model: string,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    generationParameters: VideoGenerationParameters,
): Promise<VideoGenerationTask> {
    const contract = preflightCivitaiMediaContract(model, videoReferenceIntentItems(referenceIntent), videoReferences, audioReferences);
    if (!contract.referenceKinds.includes(referenceIntent.kind)) {
        throw new Error(`Civitai / ${model}：精确媒体合同不接受 ${referenceIntent.kind} intent，未解析或上传任何素材`);
    }
    if (referenceIntent.kind === "keyframes") {
        throw new Error(`Civitai / ${model}：当前工作流合同未定义 Agnes 多关键帧字段，已停止提交以避免错误降级`);
    }
    const publicIntent = await resolveVideoReferenceIntent(config, referenceIntent);
    const referenceParts = partitionCivitaiVideoReferences(publicIntent);
    const publicVideos = await Promise.all(videoReferences.map((video) => resolveHostedVideoUrl("Civitai", video)));
    const publicAudios = await Promise.all(audioReferences.map((audio) => resolveHostedAudioUrl("Civitai", audio)));
    const pinnedApiKey = rotateRelayApiKey(route.provider);
    const service = await resolveCivitaiRouteService(route, model, pinnedApiKey);
    const workflow = buildCivitaiVideoWorkflow({
        model,
        service,
        prompt: prompt.trim(),
        generationParameters,
        referenceKind: referenceParts.referenceKind,
        images: referenceParts.images,
        firstFrameImage: referenceParts.firstFrameImage,
        lastFrameImage: referenceParts.lastFrameImage,
        referenceImages: referenceParts.referenceImages,
        videos: publicVideos,
        audios: publicAudios,
        allowMatureContent: civitaiAllowsMatureContent(route.provider),
    });
    try {
        const created = await createCivitaiWorkflow(route, workflow, 0, pinnedApiKey);
        if (created.state.status === "failed") throw new Error(created.state.error);
        return {
            id: created.state.workflowId,
            provider: "civitai",
            model,
            route,
            apiKey: created.apiKey,
            ...(typeof generationParameters.quantity === "number" ? { expectedOutputs: generationParameters.quantity } : {}),
        };
    } catch (error) {
        throw new Error(readAxiosError(error, `Civitai / ${model} 视频任务创建失败`));
    }
}

function preflightCivitaiMediaContract(
    model: string,
    references: readonly { useAs?: string }[],
    videos: readonly ReferenceVideo[],
    audios: readonly ReferenceAudio[],
) {
    const contract = resolveCivitaiVideoMediaContract(model);
    if (!contract) {
        throw new Error(`Civitai / ${model}：没有经过当前 live OpenAPI 验证的视频媒体合同，未解析或上传任何素材`);
    }
    if (contract.imageMaximum !== null && references.length > contract.imageMaximum) {
        throw new Error(`Civitai / ${model}：图片最多 ${contract.imageMaximum} 张，当前为 ${references.length} 张，未解析或上传任何素材`);
    }
    const permitsFirst = contract.referenceKinds.some((kind: string) => kind === "first_frame" || kind === "first_last_frame" || kind === "reference_set_with_first" || kind === "reference_set_with_frames");
    const permitsLast = contract.referenceKinds.some((kind: string) => kind === "first_last_frame" || kind === "reference_set_with_frames");
    const permitsOrdinary = contract.referenceKinds.some((kind: string) => kind === "reference_set" || kind === "reference_set_with_first" || kind === "reference_set_with_frames");
    for (const reference of references) {
        const purpose = reference.useAs || "reference_image";
        const permitted = purpose === "first_frame"
            ? permitsFirst
            : purpose === "last_frame"
              ? permitsLast
              : purpose === "reference_image"
                ? permitsOrdinary
                : false;
        if (!permitted) throw new Error(`Civitai / ${model}：精确媒体合同不接受图片用途 ${purpose}，未解析或上传任何素材`);
    }
    if (videos.length && !contract.acceptsReferenceVideos) {
        throw new Error(`Civitai / ${model}：精确媒体合同不接受参考视频，未解析或上传任何素材`);
    }
    if (contract.videoMinimum > 0 && (
        videos.length < contract.videoMinimum ||
        (contract.videoMaximum !== null && videos.length > contract.videoMaximum)
    )) {
        const maximum = contract.videoMaximum === null ? "官方未公布上限" : String(contract.videoMaximum);
        throw new Error(`Civitai / ${model}：参考视频要求 ${contract.videoMinimum}..${maximum} 个，当前为 ${videos.length} 个，未解析或上传任何素材`);
    }
    if (contract.videoMaximum !== null && videos.length > contract.videoMaximum) {
        throw new Error(`Civitai / ${model}：参考视频最多 ${contract.videoMaximum} 个，当前为 ${videos.length} 个，未解析或上传任何素材`);
    }
    for (const video of videos) {
        if (video.useAs !== undefined && video.useAs !== "reference_video") {
            throw new Error(`Civitai / ${model}：精确媒体合同不接受视频用途 ${video.useAs}，未解析或上传任何素材`);
        }
    }
    if (audios.length && !contract.acceptsReferenceAudios) {
        throw new Error(`Civitai / ${model}：精确媒体合同不接受参考音频，未解析或上传任何素材`);
    }
    return contract;
}

async function resolveHostedVideoUrl(providerLabel: string, video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url)) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error(`${providerLabel} 参考视频必须是公网 URL，或本地已保存的视频`);
    return uploadReferenceMedia(new File([blob], video.name || "reference-video.mp4", { type: video.type || blob.type || "video/mp4" }));
}

async function resolveHostedAudioUrl(providerLabel: string, audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url)) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error(`${providerLabel} 参考音频必须是公网 URL，或本地已保存的音频`);
    return uploadReferenceMedia(new File([blob], audio.name || "reference-audio.mp3", { type: audio.type || blob.type || "audio/mpeg" }));
}

async function pollCivitaiVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    if (route.mode !== "local" || !isCivitaiRoute(route)) return { status: "failed", error: "Civitai 视频任务路由已失效，请检查 Provider 配置" };
    try {
        const state = await pollCivitaiWorkflow(route, task.id, task.apiKey || route.provider.apiKey);
        if (state.status === "pending") return { status: "pending" };
        if (state.status === "failed") return { status: "failed", error: state.error };
        const providerLabel = `Civitai / ${task.model}`;
        const remoteOutputs: VideoGenerationOutput[] = state.blobs.map((video) => ({ url: video.url }));
        createVideoGenerationResult(remoteOutputs, task.expectedOutputs, providerLabel);
        const downloadedOutputs = await Promise.all(state.blobs.map((video) => videoResultFromUrl(video.url, route)));
        refreshRemoteUser(config);
        return {
            status: "completed",
            result: createVideoGenerationResult(downloadedOutputs, task.expectedOutputs, providerLabel),
        };
    } catch (error) {
        throw createVideoTaskPollingRequestError(
            error,
            readAxiosError(error, `Civitai / ${task.model} 视频任务查询失败`),
        );
    }
}

function isAgnesTaskNotFoundError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    if (status !== 400 && status !== 404) return false;
    const message = readErrorValue(error.response?.data).toLowerCase();
    return message.includes("not_exist") || message.includes("not found") || message.includes("不存在");
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    assertVideoConfig(config, task.model);
    const route = task.route || resolveApiRequestRoute(config, "video", task.model);
    if (task.provider === "agnes" || isAgnesRoute(route)) return pollAgnesVideoTask(config, route, task);
    if (task.provider === "dashscope") return pollDashscopeTask(config, route, task);
    if (task.provider === "civitai") return pollCivitaiVideoTask(config, route, task);
    if (task.provider === "xai-imagine" || isXaiImagineVideoModel(task.model)) return pollXaiImagineVideoTask(config, route, task);
    return task.provider === "seedance" ? pollSeedanceTask(config, route, task) : pollOpenAIVideoTask(config, route, task);
}

export async function storeGeneratedVideo(result: VideoGenerationResult, route?: ApiRequestRoute): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        const downloaded = await videoResultFromUrl(result.url, route);
        if (downloaded.blob) return uploadMediaFile(downloaded.blob, "video");
        throw new Error("视频已生成，但无法下载到本地；请检查结果地址或网络后重试");
    }
    throw new Error("视频接口没有返回可播放的视频");
}

/** Provider-aware result download seam used by native polling and diagnostics. */
export async function downloadVideoResultFromUrl(url: string, route?: ApiRequestRoute): Promise<VideoGenerationResult> {
    return videoResultFromUrl(url, route);
}

export async function storeGeneratedVideos(result: VideoGenerationResult, route?: ApiRequestRoute): Promise<readonly UploadedFile[]> {
    const outputs = videoGenerationResultOutputs(result);
    if (!outputs.length) throw new Error("视频接口没有返回可播放的视频");
    return Promise.all(outputs.map((output) => storeGeneratedVideo(output, route)));
}

async function resolveOpenAIInputReferenceFile(intent: VideoReferenceIntent<VideoReferenceImage>): Promise<File | null> {
    if (intent.kind === "none") return null;
    if (intent.kind !== "first_frame") {
        throw new Error("OpenAI Videos 当前官方合同只接受 1 个 input_reference；已停止提交多图，避免静默截断或发送未定义字段");
    }
    const dataUrl = String((await imageToDataUrl(intent.firstFrame)) || "").trim();
    if (!dataUrl) throw new Error("OpenAI Videos 参考图读取失败，未发送生成请求");
    const file = dataUrlToFile({ ...intent.firstFrame, dataUrl });
    if (!file.size) throw new Error("OpenAI Videos 参考图为空，未发送生成请求");
    if (!file.type.toLowerCase().startsWith("image/")) throw new Error("OpenAI Videos input_reference 必须是图片文件，未发送生成请求");
    return file;
}

async function createXaiImagineVideoTask(
    config: AiConfig,
    route: ApiRequestRoute,
    model: string,
    capability: ResolvedVideoModelCapability,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    generationParameters: VideoGenerationParameters,
): Promise<VideoGenerationTask> {
    const publicIntent = await resolveVideoReferenceIntent(config, referenceIntent);
    const stills = Array.from(new Set(videoReferenceIntentItems(publicIntent).map((url) => String(url || "").trim()).filter(Boolean))).slice(0, 5);
    let first = "";
    let last = "";
    if (publicIntent.kind === "first_frame" || publicIntent.kind === "reference_set_with_first") first = publicIntent.firstFrame;
    else if (publicIntent.kind === "first_last_frame" || publicIntent.kind === "reference_set_with_frames") {
        first = publicIntent.firstFrame || stills[0] || "";
        last = publicIntent.lastFrame || stills[stills.length - 1] || "";
    } else if (publicIntent.kind === "reference_set") {
        first = stills[0] || "";
        last = stills.length > 1 ? stills[stills.length - 1] : "";
    } else if (publicIntent.kind !== "none" && stills.length) {
        first = stills[0];
        last = stills.length > 1 ? stills[stills.length - 1] : "";
    }
    if (!first) first = stills[0] || "";
    if (last && last === first) last = stills.find((url) => url !== first) || "";
    const duration = typeof generationParameters.duration === "number" ? generationParameters.duration : Number(config.videoSeconds) || 6;
    const resolution = String(generationParameters.resolution || config.vquality || "720p").replace(/p$/i, "") + "p";
    const aspect = String(generationParameters.aspectRatio || "16:9");
    const body = buildXaiImagineVideoBody({
        model,
        prompt,
        duration: Math.max(1, Math.min(15, Math.round(duration))),
        aspect_ratio: aspect,
        resolution: ["480p", "720p", "1080p"].includes(resolution) ? resolution : "720p",
        ...(first ? { image: { url: first } } : {}),
        ...(last ? { last_frame_image: { url: last } } : {}),
        image_urls: stills,
    });
    try {
        const pinnedKey = route.mode === "local" ? rotateRelayApiKey(route.provider) : "";
        const response = await axios.post<unknown>(aiApiUrl(config, route, xaiImagineCreatePath()), body, {
            headers: await aiHeaders(config, route, "application/json", pinnedKey || undefined),
            timeout: route.timeoutMs,
        });
        const requestId = readXaiImagineRequestId(response.data);
        if (!requestId) throw new Error("xAI Imagine 没有返回 request_id");
        try { useMembershipStore.getState().record("video"); } catch { /* quota is advisory */ }
        return { id: requestId, provider: "xai-imagine", model, route, apiKey: pinnedKey || undefined };
    } catch (error) {
        throw new Error(readAxiosError(error, `${capability.providerLabel} / ${model} 视频任务创建失败`));
    }
}

async function pollXaiImagineVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        const response = await axios.get<unknown>(aiApiUrl(config, route, xaiImaginePollPath(task.id)), {
            headers: await aiHeaders(config, route, undefined, task.apiKey),
            timeout: route.timeoutMs,
        });
        const state = readXaiImaginePoll(response.data);
        if (state.status === "completed" && state.url) {
            refreshRemoteUser(config);
            return { status: "completed", result: await videoResultFromUrl(state.url, route) };
        }
        if (state.status === "failed") return { status: "failed", error: state.error || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw createVideoTaskPollingRequestError(error, readAxiosError(error, "xAI Imagine 视频任务查询失败"));
    }
}

async function createOpenAIVideoTask(
    config: AiConfig,
    route: ApiRequestRoute,
    model: string,
    capability: ResolvedVideoModelCapability,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    generationParameters: VideoGenerationParameters,
    operation?: VideoGenerationOperation,
): Promise<VideoGenerationTask> {
    if (route.mode === "remote") return createRelayVideoTask(config, route, model, capability, referenceIntent, prompt, generationParameters, operation);

    const inputReference = await resolveOpenAIInputReferenceFile(referenceIntent);
    const wireParameters = serializeOpenAIVideoGenerationParameters(capability, generationParameters);
    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    if (wireParameters.seconds !== undefined) body.append("seconds", wireParameters.seconds);
    if (wireParameters.size !== undefined) body.append("size", wireParameters.size);
    if (inputReference) body.append("input_reference", inputReference, inputReference.name);
    try {
        const pinnedKey = route.mode === "local" ? rotateRelayApiKey(route.provider) : "";
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, route, "/videos"), body, { headers: await aiHeaders(config, route, undefined, pinnedKey || undefined), timeout: route.timeoutMs })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model, route, apiKey: pinnedKey || undefined };
    } catch (error) {
        throw new Error(readAxiosError(error, `OpenAI-compatible / ${model} 视频任务创建失败`));
    }
}

export function serializeOpenAIVideoGenerationParameters(
    capability: ResolvedVideoModelCapability,
    generationParameters: VideoGenerationParameters,
) {
    const validated = validateVideoGenerationParameters(capability, generationParameters);
    const providedNames = Object.entries(validated)
        .filter(([, value]) => isProvidedVideoGenerationValue(value))
        .map(([name]) => name);
    const unsupportedSerializerField = providedNames.find((name) => name !== "duration" && name !== "dimensions");
    if (unsupportedSerializerField) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：参数 ${unsupportedSerializerField} 已通过能力校验，但 OpenAI Videos 提交字段尚未接通`);
    }
    const dimensions = readVideoGenerationDimensions(validated.dimensions);
    return {
        ...(typeof validated.duration === "number" ? { seconds: String(validated.duration) } : {}),
        ...(dimensions ? { size: `${dimensions.width}x${dimensions.height}` } : {}),
    };
}

async function pollOpenAIVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, route, `/videos/${task.id}`), { headers: await aiHeaders(config, route, undefined, task.apiKey), params: route.mode === "remote" ? { model: task.model } : undefined, timeout: route.timeoutMs })).data);
        const status = normalizeVideoTaskProviderStatus(video.status);
        if (status === "completed" || status === "succeeded" || status === "success") {
            const content = await axios.get<Blob>(aiApiUrl(config, route, `/videos/${task.id}/content`), { headers: await aiHeaders(config, route, undefined, task.apiKey), params: route.mode === "remote" ? { model: task.model } : undefined, responseType: "blob", timeout: route.timeoutMs });
            await assertVideoResponseBlob(content.data);
            refreshRemoteUser(config);
            return { status: "completed", result: { blob: content.data } };
        }
        if (status === "failed" || status === "cancelled" || status === "canceled") return { status: "failed", error: video.error?.message || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw createVideoTaskPollingRequestError(
            error,
            readAxiosError(error, "视频任务查询失败"),
        );
    }
}

async function createDashscopeTask(
    config: AiConfig,
    route: ApiRequestRoute,
    model: string,
    capability: ResolvedVideoModelCapability,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    generationParameters: VideoGenerationParameters,
): Promise<VideoGenerationTask> {
    const text = prompt.trim();
    if (capability.id === "dashscope-happyhorse-video-edit" && !text) throw new Error(`${capability.providerLabel} / ${model}：视频编辑 prompt 为官方必填字段`);
    if (!text && referenceIntent.kind === "none" && !videoReferences.length) throw new Error(`${capability.providerLabel} / ${model}：请输入视频提示词，或连接参考素材`);
    const publicIntent = await resolveVideoReferenceIntent(config, referenceIntent);
    const publicVideos = await Promise.all(videoReferences.map(async (video) => ({
        url: await resolveHostedVideoUrl(capability.providerLabel, video),
        ...(video.useAs ? { useAs: video.useAs } : {}),
    })));
    const publicVoices = await Promise.all(audioReferences.map((audio) => resolveHostedAudioUrl(capability.providerLabel, audio)));
    try {
        const pinnedKey = route.mode === "local" ? rotateRelayApiKey(route.provider) : "";
        const taskId = await createDashscopeVideoTask(route, {
            model,
            prompt: buildVideoReferencePromptText(capability, text, referenceIntent),
            capability,
            referenceIntent: publicIntent,
            referenceVideos: publicVideos,
            referenceVoices: publicVoices,
            generationParameters,
            hasReferenceVideo: publicVideos.length > 0,
            timeoutMs: route.timeoutMs,
            apiKey: pinnedKey || undefined,
        });
        return { id: taskId, provider: "dashscope", model, route, apiKey: pinnedKey || undefined };
    } catch (error) {
        throw new Error(readAxiosError(error, `${capability.providerLabel} / ${model} 视频任务创建失败`));
    }
}

function validateVideoInputs(capability: ResolvedVideoModelCapability, videos: readonly ReferenceVideo[]) {
    const policy = capability.videoInputPolicy;
    if (!policy.supported) {
        if (videos.length) throw new Error(`${capability.providerLabel} / ${capability.model}：当前 operation 不接受视频素材`);
        return;
    }
    if (videos.length < policy.min || (policy.max !== null && videos.length > policy.max)) {
        const expected = policy.max === null
            ? `至少 ${policy.min} 个（官方未公布上限）`
            : policy.min === policy.max ? `恰好 ${policy.min} 个` : `${policy.min}..${policy.max} 个`;
        throw new Error(`${capability.providerLabel} / ${capability.model}：视频素材要求 ${expected}，当前为 ${videos.length} 个`);
    }
    for (const video of videos) {
        if ((capability.id === "dashscope-wan27-video-edit" || capability.id === "dashscope-happyhorse-video-edit") && video.useAs === undefined) {
            continue;
        }
        const useAs = video.useAs || "reference_video";
        if (!policy.uses.includes(useAs)) throw new Error(`${capability.providerLabel} / ${capability.model}：视频用途 ${useAs} 不属于当前 operation（允许：${policy.uses.join("、")}）`);
    }
}

async function pollDashscopeTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        const state = await pollDashscopeVideoTask(route, task.id, route.timeoutMs, task.apiKey);
        if (state.status === "completed") {
            refreshRemoteUser(config);
            return { status: "completed", result: await videoResultFromUrl(state.url, route) };
        }
        if (state.status === "failed") return { status: "failed", error: state.error };
        return { status: "pending" };
    } catch (error) {
        throw createVideoTaskPollingRequestError(
            error,
            readAxiosError(error, "阿里云百炼视频任务查询失败"),
        );
    }
}

async function createSeedanceTask(
    config: AiConfig,
    route: ApiRequestRoute,
    model: string,
    capability: ResolvedVideoModelCapability,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    references: VideoReferenceImage[],
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    generationParameters: VideoGenerationParameters,
    operation?: VideoGenerationOperation,
): Promise<VideoGenerationTask> {
    validateVideoGenerationParameters(capability, generationParameters, {
        hasReferenceVideo: videoReferences.length > 0,
    });
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error(`${capability.providerLabel} / ${model}：参考音频不能单独使用，请同时添加参考图或参考视频`);
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    if (route.mode === "remote") {
        if (videoReferences.length || audioReferences.length) {
            throw new Error(`${capability.providerLabel} / ${model}：当前中转接口不支持参考视频或参考音频，请先使用参考图片生成`);
        }
        return createRelayVideoTask(config, route, model, capability, referenceIntent, prompt, generationParameters, operation);
    }

    const content = await buildSeedanceContent(config, capability, prompt, references, referenceIntent, videoReferences, audioReferences);
    if (!content.length) throw new Error(`${capability.providerLabel} / ${model}：请输入视频提示词，或连接参考图片/视频/音频`);
    const payload = {
        model,
        content,
        ...serializeArkSeedanceGenerationParameters(capability, generationParameters),
    };

    try {
        const pinnedKey = route.mode === "local" ? rotateRelayApiKey(route.provider) : "";
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, route), payload, { headers: await aiHeaders(config, route, "application/json", pinnedKey || undefined), timeout: route.timeoutMs })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model, route, apiKey: pinnedKey || undefined };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

export function serializeArkSeedanceGenerationParameters(
    capability: ResolvedVideoModelCapability,
    generationParameters: VideoGenerationParameters,
): Record<string, unknown> {
    if (capability.provider !== "ark" || !capability.generationParameters.id.startsWith("ark:seedance-2.0-")) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：当前模型没有已验证的 Ark Seedance 2 参数 serializer`);
    }
    const validated = validateVideoGenerationParameters(capability, generationParameters);
    const payload: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(validated)) {
        if (!isProvidedVideoGenerationValue(value)) continue;
        const field = capability.generationParameters[name as keyof VideoGenerationParameters];
        const transportName = field?.transportName;
        if (field?.status !== "supported" || !transportName) {
            throw new Error(`${capability.providerLabel} / ${capability.model}：参数 ${name} 已通过能力校验，但 Ark Seedance 2 transport 字段尚未接通`);
        }
        payload[transportName] = value;
    }
    return payload;
}

async function pollSeedanceTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    if (route.mode === "remote") return pollRelayVideoTask(config, route, task);

    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, route, task.id), { headers: await aiHeaders(config, route, undefined, task.apiKey), timeout: route.timeoutMs })).data);
        if (state.status === "succeeded") {
            const url = state.content?.video_url;
            if (!url) return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
            refreshRemoteUser(config);
            return { status: "completed", result: await videoResultFromUrl(url, route) };
        }
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: state.error?.message || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw createVideoTaskPollingRequestError(
            error,
            readAxiosError(error, "Seedance 任务查询失败"),
        );
    }
}

async function createRelayVideoTask(
    config: AiConfig,
    route: ApiRequestRoute,
    model: string,
    capability: ResolvedVideoModelCapability,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    prompt: string,
    generationParameters: VideoGenerationParameters,
    operation?: VideoGenerationOperation,
): Promise<VideoGenerationTask> {
    const payload = await buildRelayVideoPayload(config, model, capability, prompt, referenceIntent, generationParameters, operation);
    const requestUrl = aiApiUrl(config, route, "/videos/generations");
    try {
        const response = await axios.post<RelayVideoResponse>(requestUrl, payload, { headers: await aiHeaders(config, route, "application/json"), timeout: route.timeoutMs });
        const data = response.data;
        if (!data || data.success === false) throw new Error(readErrorValue(data) || "视频任务创建失败");
        const relayTask = data.task || data;
        const taskId = data.task_id || relayTask.task_id || data.id || relayTask.id;
        if (!taskId) throw new Error("视频接口没有返回任务 ID");
        return { id: taskId, provider: "seedance", model, route };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollRelayVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    const requestUrl = aiApiUrl(config, route, `/videos/generations/tasks/${encodeURIComponent(task.id)}`);
    try {
        const response = await axios.get<RelayVideoResponse>(requestUrl, { headers: await aiHeaders(config, route), timeout: route.timeoutMs });
        const data = response.data;
        if (!data || data.success === false) throw new Error(readErrorValue(data) || "视频任务查询失败");
        return relayVideoTaskState(config, route, data.task || data);
    } catch (error) {
        if (isRelayVideoEndpointMissing(error)) {
            try {
                const response = await axios.get<RelayVideoResponse>(relayVideoTaskListUrl(config, route), { headers: await aiHeaders(config, route), timeout: route.timeoutMs });
                const data = response.data;
                if (!data || data.success === false) throw new Error(readErrorValue(data) || "视频任务查询失败");
                const relayTask = findRelayVideoTaskById(data, task.id);
                return relayTask
                    ? relayVideoTaskState(config, route, relayTask)
                    : { status: "failed", error: `视频任务 ${task.id} 在上游不存在，未找到可恢复的任务记录` };
            } catch (listError) {
                throw createVideoTaskPollingRequestError(
                    listError,
                    readAxiosError(listError, "视频任务查询失败"),
                );
            }
        }
        throw createVideoTaskPollingRequestError(
            error,
            readAxiosError(error, "视频任务查询失败"),
        );
    }
}

function relayVideoTaskListUrl(config: AiConfig, route: ApiRequestRoute) {
    return aiApiUrl(config, route, "/tasks");
}

function findRelayVideoTaskById(data: RelayVideoResponse, taskId: string) {
    const cleanTaskId = String(taskId || "").trim();
    if (!cleanTaskId) return undefined;
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    return tasks.find((item) => item.task_id === cleanTaskId || item.id === cleanTaskId);
}

async function relayVideoTaskState(config: AiConfig, route: ApiRequestRoute, relayTask: RelayVideoTask): Promise<VideoGenerationTaskState> {
    const status = String(relayTask.status || "").toLowerCase();
    if (["failed", "failure", "error", "canceled", "cancelled", "expired"].includes(status)) {
        return { status: "failed", error: readErrorValue(relayTask) || "视频生成失败" };
    }
    const urls = relayVideoFileUrls(relayTask);
    if (urls.length) {
        refreshRemoteUser(config);
        return { status: "completed", result: await videoResultFromUrl(urls[0], route) };
    }
    if (["success", "succeeded", "completed", "done"].includes(status)) {
        return { status: "failed", error: readErrorValue(relayTask) || "上游报告视频任务已完成，但没有返回视频结果" };
    }
    return { status: "pending" };
}

function isRelayVideoEndpointMissing(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    const message = readErrorValue(error.response?.data).toLowerCase();
    return status === 404 || message.includes("not found") || message.includes("page not found");
}

async function buildRelayVideoPayload(
    config: AiConfig,
    model: string,
    capability: ResolvedVideoModelCapability,
    prompt: string,
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    generationParameters: VideoGenerationParameters,
    operation?: VideoGenerationOperation,
) {
    validateGenericRelayVideoPayload({
        model,
        capability,
        operation,
        referenceIntent,
        generationParameters,
    });
    const intent = await resolveVideoReferenceIntent(config, referenceIntent);
    return serializeGenericRelayVideoPayload({
        model,
        capability,
        operation,
        prompt,
        referenceIntent: intent,
        generationParameters,
    });
}

function validateGenericRelayVideoPayload<T>({
    model,
    capability,
    operation,
    referenceIntent: intent,
    generationParameters,
}: {
    model: string;
    capability: ResolvedVideoModelCapability;
    operation?: VideoGenerationOperation;
    referenceIntent: VideoReferenceIntent<T>;
    generationParameters: VideoGenerationParameters;
}) {
    if (!operation) {
        throw new Error(`${capability.providerLabel} / ${model}：通用视频 serializer 缺少显式 operation，未发送 HTTP 请求`);
    }
    const referenceImages = videoReferenceIntentItems(intent);
    if (capability.requiresExplicitProfile && referenceImages.length) {
        throw new Error(`${capability.providerLabel} / ${model}：参考媒体 capability profile 未验证，未发送 HTTP 请求`);
    }
    if (intent.kind === "keyframes") {
        throw new Error("当前通用视频中转合同未定义多关键帧字段，不能把 Agnes keyframes 静默转换为 reference_images；未发送 HTTP 请求");
    }
    const inferredOperation = videoGenerationOperationFromIntent({
        capability,
        referenceIntent: intent,
    });
    if (inferredOperation !== operation) {
        throw new Error(`${capability.providerLabel} / ${model}：显式 operation ${operation} 与 intent ${intent.kind} 解析出的 ${inferredOperation} 不一致，未发送 HTTP 请求`);
    }
    validateVideoGenerationParameters(capability, generationParameters);
    const providedGenerationParameter = Object.entries(generationParameters)
        .find(([, value]) => isProvidedVideoGenerationValue(value));
    if (providedGenerationParameter) {
        throw new Error(`${capability.providerLabel} / ${model}：通用 /videos/generations 中转合同未公布参数 ${providedGenerationParameter[0]} 的 wire 字段；请为该 Endpoint 配置原生 provider adapter`);
    }
    const mode = operation === "text-to-video"
        ? "text_to_video"
        : operation === "first-last-frame-to-video"
          ? "first_last_frame"
          : operation === "image-to-video" || operation === "reference-to-video"
            ? "image_to_video"
            : "";
    if (!mode) {
        throw new Error(`${capability.providerLabel} / ${model}：通用视频 serializer 未验证 operation ${operation} 的 wire mode，未发送 HTTP 请求`);
    }
    return { mode, referenceImages };
}

export function serializeGenericRelayVideoPayload<T>({
    model,
    capability,
    operation,
    prompt,
    referenceIntent: intent,
    generationParameters,
}: {
    model: string;
    capability: ResolvedVideoModelCapability;
    operation?: VideoGenerationOperation;
    prompt: string;
    referenceIntent: VideoReferenceIntent<T>;
    generationParameters: VideoGenerationParameters;
}) {
    const { mode, referenceImages } = validateGenericRelayVideoPayload({
        model,
        capability,
        operation,
        referenceIntent: intent,
        generationParameters,
    });
    const firstFrame = intent.kind === "first_frame" || intent.kind === "first_last_frame" || intent.kind === "reference_set_with_first" ? intent.firstFrame : undefined;
    const lastFrame = intent.kind === "first_last_frame" ? intent.lastFrame : undefined;
    return {
        model,
        mode,
        prompt: prompt.trim(),
        ...(firstFrame ? { first_frame: firstFrame } : {}),
        ...(lastFrame ? { last_frame: lastFrame } : {}),
        ...(referenceImages.length
            ? {
                  reference_image: referenceImages[0],
                  reference_images: referenceImages,
              }
            : {}),
    };
}

function relayVideoFileUrls(task: RelayVideoTask) {
    const candidates = [
        ...(Array.isArray(task.file_urls) ? task.file_urls : []),
        ...(Array.isArray(task.files) ? task.files : []),
        task.content?.video_url,
        task.result,
    ];
    return candidates.map(normalizeRelayVideoFileUrl).filter((url): url is string => Boolean(url));
}

function normalizeRelayVideoFileUrl(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        if (parsed.hostname === "0.0.0.0" && typeof window !== "undefined") parsed.hostname = window.location.hostname;
        return parsed.toString();
    } catch (error) {
        if (error instanceof InvalidVideoResponseError) throw error;
        return raw;
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    if (videoReferences.length > SEEDANCE_REFERENCE_LIMITS.videos) {
        throw new Error(`Seedance 参考视频最多 ${SEEDANCE_REFERENCE_LIMITS.videos} 个，当前为 ${videoReferences.length} 个；不会自动截断`);
    }
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    if (audioReferences.length > SEEDANCE_REFERENCE_LIMITS.audios) {
        throw new Error(`Seedance 参考音频最多 ${SEEDANCE_REFERENCE_LIMITS.audios} 个，当前为 ${audioReferences.length} 个；不会自动截断`);
    }
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, route: ApiRequestRoute, taskId?: string) {
    if (route.mode === "remote") return taskId ? `/v1/videos/generations/tasks/${encodeURIComponent(taskId)}` : "/v1/videos/generations";
    return routedLocalApiUrl(route, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(
    config: AiConfig,
    capability: ResolvedVideoModelCapability,
    prompt: string,
    references: VideoReferenceImage[],
    referenceIntent: VideoReferenceIntent<VideoReferenceImage>,
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
) {
    const content: Array<Record<string, unknown>> = [];
    const semanticPrompt = buildVideoReferencePromptText(capability, prompt, referenceIntent);
    const baseText = buildSeedancePromptText(semanticPrompt, references, videoReferences, audioReferences);
    const text = referenceIntent.kind === "reference_set" && referenceIntent.softFirstFrame
        ? `图片1为当前分镜图，请将它作为画面起点的软提示；所有图片仍属于普通多参考模式，不要把图片2推断为尾帧。\n\n${baseText}`
        : baseText;
    if (text) content.push({ type: "text", text });
    const publicIntent = await resolveVideoReferenceIntent(config, referenceIntent);
    const publicVideos = await Promise.all(videoReferences.map(async (video) => ({
        url: await resolveSeedanceVideoUrl(video),
        ...(video.useAs ? { useAs: video.useAs } : {}),
    })));
    content.push(...serializeSeedanceImageContent(publicIntent, { videos: publicVideos }));
    for (const audio of audioReferences) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveVideoReferenceIntent(config: AiConfig, intent: VideoReferenceIntent<VideoReferenceImage>): Promise<VideoReferenceIntent<string>> {
    const images = videoReferenceIntentItems(intent);
    const urls: string[] = [];
    // Preserve frame order and avoid concurrent multipart uploads through the
    // desktop relay: some image hosts/proxies leave one parallel request open.
    for (const image of images) {
        urls.push(await resolveSeedanceImageUrl(config, image));
    }
    const byImage = new Map(images.map((image, index) => [image, urls[index]]));
    return mapVideoReferenceIntent(intent, (image) => byImage.get(image) || "");
}

async function resolveSeedanceImageUrl(config: AiConfig, image: VideoReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl)) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    const file = dataUrlToFile({ ...image, dataUrl });
    return uploadImageToConfiguredHost(config, file, file.name, { requirePublicResult: true });
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    const file = new File([blob], video.name || "reference-video.mp4", { type: video.type || blob.type || "video/mp4" });
    return uploadReferenceMedia(file);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    const file = new File([blob], audio.name || "reference-audio.mp3", { type: audio.type || blob.type || "audio/mpeg" });
    return uploadReferenceMedia(file);
}

async function uploadReferenceMedia(file: File) {
    const config = useConfigStore.getState().config;
    if (!String(config.imageHostBaseUrl || "").trim()) {
        throw new Error("参考视频/音频需要公网 URL。请在设置中填写图床地址，或直接使用已有 http(s) 链接。");
    }
    return uploadImageToConfiguredHost(config, file, file.name, { requirePublicResult: true });
}

function desktopFetchedResourceUrl(url: string) {
    return `${desktopApiUrl("/client-api/fetch-url")}?url=${encodeURIComponent(url)}`;
}

async function videoResultFromUrl(url: string, route?: ApiRequestRoute): Promise<VideoGenerationResult> {
    // A provider-aware result must preserve that provider's direct/custom
    // transport choice. Do not probe the URL in WebView first, because that
    // would silently bypass an explicitly selected proxy.
    if (route?.mode === "local") {
        const response = await axios.get<Blob>(desktopFetchedResourceUrl(url), {
            headers: buildProviderProxyHeaders(route.provider),
            responseType: "blob",
            timeout: VIDEO_RESULT_DOWNLOAD_TIMEOUT_MS,
        });
        await assertVideoResponseBlob(response.data);
        return { blob: response.data };
    }
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", timeout: VIDEO_RESULT_DOWNLOAD_TIMEOUT_MS });
        await assertVideoResponseBlob(response.data);
        return { blob: response.data };
    } catch {
        // WebView 直连失败（CORS/网络）时经 Go 后端代取：节点 <video crossOrigin="anonymous">
        // 对无 ACAO 头的远程 URL 无法播放，必须落本地媒体。
        try {
            const response = await axios.get<Blob>(desktopFetchedResourceUrl(url), { responseType: "blob", timeout: VIDEO_RESULT_DOWNLOAD_TIMEOUT_MS });
            await assertVideoResponseBlob(response.data);
            return { blob: response.data };
        } catch (relayError) {
            if (relayError instanceof InvalidVideoResponseError) throw relayError;
            const detail = readAxiosError(relayError, "直连和中转均未返回有效视频");
            throw new Error(`视频结果下载失败：${detail}`);
        }
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先选择视频模型");
}

function readVideoGenerationDimensions(value: unknown) {
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

function isProvidedVideoGenerationValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function readErrorValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const item = value as { error?: unknown; message?: unknown; detail?: unknown; msg?: unknown };
    if (typeof item.msg === "string") return item.msg;
    if (typeof item.message === "string") return item.message;
    return readErrorValue(item.error) || readErrorValue(item.detail);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ detail?: unknown; error?: unknown; message?: string; msg?: string; code?: number }>(error)) {
        if (!error.response) return describeTextTransportError(error, fallback);
        const responseData = error.response?.data;
        const responseError = detectTextApiResponseError(responseData, {
            status: error.response?.status,
            contentType: String(error.response?.headers?.["content-type"] || ""),
            operation: fallback,
        });
        if (responseError) return responseError;
        return readErrorValue(responseData) || statusMessage(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
