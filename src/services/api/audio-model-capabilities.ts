export type AudioOperation = "text-to-speech";

export type AudioCapabilityProfileId =
    | "openai-tts-1-speech"
    | "openai-gpt-4o-mini-tts-speech";

export type AudioCapabilityProvider = {
    id?: string;
    name?: string;
    displayName?: string;
    adapterType?: string;
    baseUrl?: string;
    audioCapabilityProfiles?: Record<string, AudioCapabilityProfileId | string>;
};

export type AudioCapabilityProfile = {
    readonly id: AudioCapabilityProfileId;
    readonly provider: "openai";
    readonly label: string;
    readonly operation: AudioOperation;
    readonly availability: { readonly state: "supported" };
    readonly serialization: {
        readonly kind: "openai-audio-speech";
        readonly endpoint: "/audio/speech";
    };
    readonly supportsInstructions: boolean;
    readonly responseFormats: readonly string[];
    readonly speed: { readonly minimum: number; readonly maximum: number };
    readonly maximumInputCharacters: number;
    readonly evidence: readonly string[];
};

export type ResolvedAudioModelCapability = Omit<AudioCapabilityProfile, "id" | "provider" | "availability" | "serialization"> & {
    readonly id:
        | AudioCapabilityProfileId
        | "profile-adapter-mismatch"
        | "speech-recognition-model"
        | "unknown-audio-model";
    readonly provider: "openai" | "custom";
    readonly availability:
        | { readonly state: "supported" }
        | { readonly state: "unsupported"; readonly reason: string }
        | { readonly state: "unknown"; readonly reason: string };
    readonly serialization:
        | AudioCapabilityProfile["serialization"]
        | { readonly kind: "unresolved"; readonly endpoint: "" };
    readonly model: string;
    readonly providerLabel: string;
    readonly profileConfigured: boolean;
    readonly requiresExplicitProfile?: boolean;
};

const OPENAI_SPEECH_REFERENCE = "https://platform.openai.com/docs/api-reference/audio/createSpeech";
const OPENAI_SPEECH_FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"] as const;

export const AUDIO_CAPABILITY_PROFILES: Readonly<Record<AudioCapabilityProfileId, AudioCapabilityProfile>> = {
    "openai-tts-1-speech": {
        id: "openai-tts-1-speech",
        provider: "openai",
        label: "OpenAI tts-1 / tts-1-hd Speech",
        operation: "text-to-speech",
        availability: { state: "supported" },
        serialization: { kind: "openai-audio-speech", endpoint: "/audio/speech" },
        supportsInstructions: false,
        responseFormats: OPENAI_SPEECH_FORMATS,
        speed: { minimum: 0.25, maximum: 4 },
        maximumInputCharacters: 4096,
        evidence: [OPENAI_SPEECH_REFERENCE],
    },
    "openai-gpt-4o-mini-tts-speech": {
        id: "openai-gpt-4o-mini-tts-speech",
        provider: "openai",
        label: "OpenAI gpt-4o-mini-tts Speech",
        operation: "text-to-speech",
        availability: { state: "supported" },
        serialization: { kind: "openai-audio-speech", endpoint: "/audio/speech" },
        supportsInstructions: true,
        responseFormats: OPENAI_SPEECH_FORMATS,
        speed: { minimum: 0.25, maximum: 4 },
        maximumInputCharacters: 4096,
        evidence: [OPENAI_SPEECH_REFERENCE],
    },
};

export const AUDIO_CAPABILITY_PROFILE_IDS = Object.freeze(
    Object.keys(AUDIO_CAPABILITY_PROFILES) as AudioCapabilityProfileId[],
);

export function isAudioCapabilityProfileId(value: unknown): value is AudioCapabilityProfileId {
    return typeof value === "string" && value in AUDIO_CAPABILITY_PROFILES;
}

export function normalizeAudioCapabilityProfiles(value: unknown): Record<string, AudioCapabilityProfileId> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const normalized: Record<string, AudioCapabilityProfileId> = {};
    for (const [rawModel, profile] of Object.entries(value as Record<string, unknown>)) {
        const model = String(rawModel || "").trim();
        if (model && model !== "*" && isAudioCapabilityProfileId(profile)) normalized[model] = profile;
    }
    return Object.keys(normalized).length ? normalized : undefined;
}

export function audioCapabilityProfileCompatibility(
    provider: AudioCapabilityProvider | undefined,
    profileId: AudioCapabilityProfileId,
): { readonly compatible: boolean; readonly adapter: "openai" | ""; readonly reason: string } {
    const profile = AUDIO_CAPABILITY_PROFILES[profileId];
    const explicitAdapter = String(provider?.adapterType || "").trim().toLowerCase();
    const adapter = !explicitAdapter || explicitAdapter === "openai" || explicitAdapter === "openai-compatible"
        ? "openai"
        : "";
    if (adapter === profile.provider) return { compatible: true, adapter, reason: "" };
    return {
        compatible: false,
        adapter,
        reason: `能力模板 ${profile.label} 使用 OpenAI Speech wire 协议，与当前 ${explicitAdapter || "OpenAI-compatible"} adapter 不兼容`,
    };
}

export function resolveAudioModelCapability(options: {
    readonly model: string;
    readonly operation: AudioOperation;
    readonly provider?: AudioCapabilityProvider;
}): ResolvedAudioModelCapability {
    const model = String(options.model || "").trim();
    const configuredProfile = configuredAudioProfile(options.provider?.audioCapabilityProfiles, model);
    if (configuredProfile) return resolveProfile(configuredProfile, model, options.provider, true);

    const automaticProfile = automaticOpenAiSpeechProfile(model);
    if (automaticProfile) return resolveProfile(automaticProfile, model, options.provider, false);

    if (isSpeechRecognitionModel(model)) {
        return unresolvedCapability(
            "speech-recognition-model",
            model,
            options.operation,
            options.provider,
            "当前模型是语音识别（音频转文字）模型，不适用于当前 text-to-speech 操作",
            "unsupported",
        );
    }
    return unresolvedCapability(
        "unknown-audio-model",
        model,
        options.operation,
        options.provider,
        "当前 provider/model 未配置已验证的文本转语音能力模板；音频分类不会自动授权 OpenAI /audio/speech",
        "unknown",
    );
}

export function assertAudioModelRequest(
    capability: ResolvedAudioModelCapability,
    request: {
        readonly operation: AudioOperation;
        readonly input?: string;
        readonly format: string;
        readonly speed: number;
        readonly instructions: string;
    },
) {
    const subject = `${capability.providerLabel} / ${capability.model || "未选择模型"}`;
    if (request.operation !== capability.operation) {
        throw new Error(`${subject} 的音频 capability 是 ${capability.operation}，不能处理 ${request.operation}；未发送 HTTP 请求`);
    }
    if (capability.availability.state !== "supported") {
        throw new Error(`${subject}：${capability.availability.reason}；已停止提交，未发送 HTTP 请求`);
    }
    if (request.input !== undefined) {
        const input = request.input.trim();
        if (!input) throw new Error("请输入需要转换为语音的文本；未发送 HTTP 请求");
        if (Array.from(input).length > capability.maximumInputCharacters) {
            throw new Error(`${subject} 的文本最多 ${capability.maximumInputCharacters} 个字符；未发送 HTTP 请求`);
        }
    }
    if (!capability.responseFormats.includes(request.format)) {
        throw new Error(`${subject} 不接受 response_format“${request.format}”；允许：${capability.responseFormats.join("、")}；未发送 HTTP 请求`);
    }
    if (!Number.isFinite(request.speed) || request.speed < capability.speed.minimum || request.speed > capability.speed.maximum) {
        throw new Error(`${subject} 的语速必须在 ${capability.speed.minimum} 到 ${capability.speed.maximum} 之间；未发送 HTTP 请求`);
    }
    if (request.instructions && !capability.supportsInstructions) {
        throw new Error(`${subject} 的 tts-1 Speech 合同不支持 instructions；未发送 HTTP 请求`);
    }
}

function resolveProfile(
    id: AudioCapabilityProfileId,
    model: string,
    provider: AudioCapabilityProvider | undefined,
    profileConfigured: boolean,
): ResolvedAudioModelCapability {
    const profile = AUDIO_CAPABILITY_PROFILES[id];
    const compatibility = audioCapabilityProfileCompatibility(provider, id);
    const providerLabel = String(provider?.displayName || provider?.name || "").trim() || profile.label;
    if (!compatibility.compatible) {
        return {
            ...profile,
            id: "profile-adapter-mismatch",
            availability: { state: "unsupported", reason: compatibility.reason },
            model,
            providerLabel,
            profileConfigured,
        };
    }
    return { ...profile, model, providerLabel, profileConfigured };
}

function unresolvedCapability(
    id: "speech-recognition-model" | "unknown-audio-model",
    model: string,
    operation: AudioOperation,
    provider: AudioCapabilityProvider | undefined,
    reason: string,
    state: "unsupported" | "unknown",
): ResolvedAudioModelCapability {
    return {
        id,
        provider: "custom",
        label: "未验证音频 Endpoint",
        operation,
        availability: { state, reason },
        serialization: { kind: "unresolved", endpoint: "" },
        supportsInstructions: false,
        responseFormats: [],
        speed: { minimum: 0.25, maximum: 4 },
        maximumInputCharacters: 4096,
        evidence: [],
        model,
        providerLabel: String(provider?.displayName || provider?.name || "").trim() || "未验证音频 Endpoint",
        profileConfigured: false,
        requiresExplicitProfile: state === "unknown",
    };
}

function configuredAudioProfile(
    profiles: AudioCapabilityProvider["audioCapabilityProfiles"],
    model: string,
) {
    if (!profiles) return undefined;
    const exact = profiles[model];
    return isAudioCapabilityProfileId(exact) ? exact : undefined;
}

function automaticOpenAiSpeechProfile(model: string): AudioCapabilityProfileId | undefined {
    const key = model.trim().toLowerCase();
    if (key === "tts-1" || key === "tts-1-hd") return "openai-tts-1-speech";
    if (key === "gpt-4o-mini-tts" || key === "gpt-4o-mini-tts-2025-12-15") {
        return "openai-gpt-4o-mini-tts-speech";
    }
    return undefined;
}

function isSpeechRecognitionModel(model: string) {
    const key = normalizeModelKey(model);
    return key === "qwen-audio-3-0-asr-flash" || key.startsWith("qwen-audio-3-0-asr-flash-");
}

function normalizeModelKey(model: string) {
    return String(model || "").trim().toLowerCase().replace(/[._/]+/gu, "-").replace(/-+/gu, "-");
}
