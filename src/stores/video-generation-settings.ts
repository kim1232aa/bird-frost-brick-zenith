import {
    VIDEO_GENERATION_PARAMETER_NAMES,
    validateVideoGenerationParameters,
    type ResolvedVideoModelCapability,
    type VideoGenerationDimensions,
    type VideoGenerationParameterName,
    type VideoGenerationParameters,
} from "../services/api/video-model-capabilities.ts";

export type VideoGenerationOperation =
    | "text-to-video"
    | "image-to-video"
    | "reference-to-video"
    | "first-last-frame-to-video"
    | "keyframes-to-video"
    | "continuation"
    | "video-edit";

type VideoGenerationReferenceIntent = {
    kind: "none" | "last_frame" | "first_frame" | "first_last_frame" | "keyframes" | "reference_set" | "reference_set_with_first" | "reference_set_with_frames";
};

/** A closed set of request fields. There is deliberately no provider-payload/JSON escape hatch. */
export type VideoGenerationSettings = {
    duration?: number | string;
    frames?: number;
    fps?: number;
    resolution?: string;
    dimensions?: VideoGenerationDimensions;
    aspectRatio?: string;
    audio?: boolean | string | readonly string[];
    audioMode?: string;
    watermark?: boolean;
    negativePrompt?: string;
    seed?: number;
    steps?: number;
    guidance?: number;
    sampler?: string;
    scheduler?: string;
    quantity?: number;
    modelVariant?: string;
    mode?: string;
    promptExpansion?: boolean;
    safetyChecker?: boolean;
    frameGuideStrength?: number;
    returnLastFrame?: boolean;
    shift?: number;
    turbo?: boolean;
    usePro?: boolean;
    /** Explicit UI choice to omit these fields, suppressing both official UI defaults and legacy global fallbacks. */
    providerDefaultFields?: readonly VideoGenerationParameterName[];
};

export type VideoGenerationSettingsScope = {
    providerId: string;
    model: string;
    operation: VideoGenerationOperation;
};

/** Records a one-time, non-destructive import from the former global fields. */
export type VideoGenerationLegacyMigration = {
    version: 1;
    state: "migrated" | "pending";
    scope?: VideoGenerationSettingsScope;
    /** Legacy values with no matching field in the active contract stay in the old fields. */
    unmappedFields?: readonly string[];
};

/**
 * Reuse a persisted snapshot only when it still identifies the exact route
 * selected for the node.  A matching model string is insufficient because an
 * older node can retain a provider that no longer owns that model.
 */
export function replayableVideoGenerationScope(
    recordedScope: VideoGenerationSettingsScope | undefined,
    selectedModel: string,
    resolvedProviderId: string | undefined,
): VideoGenerationSettingsScope | undefined {
    if (!recordedScope?.providerId || !recordedScope.model) return undefined;
    const model = selectedModel.trim();
    if (!model) return undefined;
    const providerId = String(resolvedProviderId || "").trim();
    return recordedScope.model === model && recordedScope.providerId === providerId
        ? recordedScope
        : undefined;
}

export type VideoDimensionsDraft = {
    width: string;
    height: string;
};

export type VideoDimensionsDraftUpdate = {
    draft: VideoDimensionsDraft;
    value: VideoGenerationDimensions | undefined;
};

export type VideoWireFormatSnapshot = {
    mode: "request" | "provider-default" | "blocked";
    dimensions?: VideoGenerationDimensions;
    aspectRatio?: string;
    resolution?: string;
    validationError?: string;
};

export type VideoGenerationSettingsByScope = Record<
    string,
    Record<string, Partial<Record<VideoGenerationOperation, VideoGenerationSettings>>>
>;

type VideoGenerationRouteConfig = {
    channelMode?: "remote" | "local";
    model?: string;
    videoModel?: string;
    apiRouting?: { video?: { providerId?: string; model?: string } };
    apiBoardRouting?: { videoGeneration?: { mode?: "inherit" | "custom"; providerId?: string; model?: string } };
};

type LegacyVideoGenerationConfig = {
    videoSeconds?: string;
    vquality?: string;
    size?: string;
    videoGenerateAudio?: string;
    videoWatermark?: string;
    videoGenerationSettingsByScope?: VideoGenerationSettingsByScope;
    videoGenerationLegacyMigration?: VideoGenerationLegacyMigration;
};

const VIDEO_GENERATION_OPERATIONS: readonly VideoGenerationOperation[] = [
    "text-to-video",
    "image-to-video",
    "reference-to-video",
    "first-last-frame-to-video",
    "keyframes-to-video",
    "continuation",
    "video-edit",
];

export function normalizeVideoGenerationSettings(value: unknown): VideoGenerationSettings {
    if (!isRecord(value)) return {};
    const normalized: VideoGenerationSettings = {};
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        const field = normalizeVideoGenerationSetting(name, value[name]);
        if (field !== undefined) assignVideoSetting(normalized, name, field);
    }
    if (Array.isArray(value.providerDefaultFields)) {
        const names = value.providerDefaultFields.filter((name): name is VideoGenerationParameterName => VIDEO_GENERATION_PARAMETER_NAMES.includes(name as VideoGenerationParameterName));
        if (names.length) normalized.providerDefaultFields = [...new Set(names)];
    }
    return normalized;
}

export function normalizeVideoGenerationSettingsByScope(value: unknown): VideoGenerationSettingsByScope {
    if (!isRecord(value)) return {};
    const normalized: VideoGenerationSettingsByScope = {};
    for (const [rawProviderId, rawModels] of Object.entries(value)) {
        const providerId = rawProviderId.trim();
        if (!providerId || !isRecord(rawModels)) continue;
        const models: VideoGenerationSettingsByScope[string] = {};
        for (const [rawModel, rawOperations] of Object.entries(rawModels)) {
            const model = rawModel.trim();
            if (!model || !isRecord(rawOperations)) continue;
            const operations: Partial<Record<VideoGenerationOperation, VideoGenerationSettings>> = {};
            for (const operation of VIDEO_GENERATION_OPERATIONS) {
                if (!isRecord(rawOperations[operation])) continue;
                operations[operation] = normalizeVideoGenerationSettings(rawOperations[operation]);
            }
            if (Object.keys(operations).length) models[model] = operations;
        }
        if (Object.keys(models).length) normalized[providerId] = models;
    }
    return normalized;
}

export function readScopedVideoGenerationSettings(
    settingsByScope: VideoGenerationSettingsByScope | undefined,
    scope: VideoGenerationSettingsScope,
): VideoGenerationSettings {
    return normalizeVideoGenerationSettings(
        settingsByScope?.[scope.providerId]?.[scope.model]?.[scope.operation],
    );
}

export function writeVideoGenerationSettings(
    settingsByScope: VideoGenerationSettingsByScope | undefined,
    scope: VideoGenerationSettingsScope,
    settings: VideoGenerationSettings,
): VideoGenerationSettingsByScope {
    const current = normalizeVideoGenerationSettingsByScope(settingsByScope);
    return {
        ...current,
        [scope.providerId]: {
            ...(current[scope.providerId] || {}),
            [scope.model]: {
                ...(current[scope.providerId]?.[scope.model] || {}),
                [scope.operation]: normalizeVideoGenerationSettings(settings),
            },
        },
    };
}

/**
 * Import old global video controls once into one explicit provider/model/
 * operation scope. Existing scoped values win. We retain the legacy fields on
 * the surrounding config, and values that cannot be named by the active
 * contract are reported as unmapped rather than guessed or discarded.
 */
export function migrateLegacyVideoGenerationSettings(
    config: LegacyVideoGenerationConfig,
    scope: VideoGenerationSettingsScope,
    capability: ResolvedVideoModelCapability,
): {
    settingsByScope: VideoGenerationSettingsByScope;
    migration: VideoGenerationLegacyMigration;
} {
    const current = normalizeVideoGenerationSettingsByScope(config.videoGenerationSettingsByScope);
    const existingMigration = config.videoGenerationLegacyMigration;
    if (existingMigration?.version === 1 && existingMigration.state === "migrated") {
        return { settingsByScope: current, migration: existingMigration };
    }
    if (!scope.providerId.trim() || !scope.model.trim()) {
        return { settingsByScope: current, migration: { version: 1, state: "pending" } };
    }
    const { settings: legacy, unmappedFields } = legacyVideoSettingsForMigration(config, capability);
    const existing = readScopedVideoGenerationSettings(current, scope);
    return {
        settingsByScope: writeVideoGenerationSettings(current, scope, { ...legacy, ...existing }),
        migration: {
            version: 1,
            state: "migrated",
            scope: { ...scope },
            ...(unmappedFields.length ? { unmappedFields } : {}),
        },
    };
}

export function resolveVideoGenerationSettingsScope(
    config: VideoGenerationRouteConfig,
    operation: VideoGenerationOperation,
): VideoGenerationSettingsScope {
    const route = resolveVideoGenerationRoute(config);
    return {
        providerId: String(route?.providerId || (config.channelMode === "remote" ? "remote" : "")).trim(),
        model: resolveVideoGenerationRouteModel(config),
        operation,
    };
}

export function resolveVideoGenerationRouteModel(config: VideoGenerationRouteConfig) {
    const route = resolveVideoGenerationRoute(config);
    return String(route?.model || config.model || config.videoModel || "").trim();
}

function resolveVideoGenerationRoute(config: VideoGenerationRouteConfig) {
    const boardRoute = config.apiBoardRouting?.videoGeneration;
    return boardRoute?.mode === "custom" ? boardRoute : config.apiRouting?.video;
}

export function readVideoDimensionsDraft(value: VideoGenerationDimensions | undefined): VideoDimensionsDraft {
    if (value && typeof value === "object") {
        return { width: String(value.width), height: String(value.height) };
    }
    const match = String(value || "").trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/u);
    return {
        width: match?.[1] || "",
        height: match?.[2] || "",
    };
}

/** Keep incomplete width/height text local; only expose a request value once both sides are valid. */
export function updateVideoDimensionsDraft(
    current: VideoDimensionsDraft,
    side: keyof VideoDimensionsDraft,
    nextValue: string,
): VideoDimensionsDraftUpdate {
    const draft = { ...current, [side]: nextValue };
    const width = positiveIntegerDraft(draft.width);
    const height = positiveIntegerDraft(draft.height);
    return {
        draft,
        value: width === undefined || height === undefined ? undefined : `${width}x${height}`,
    };
}

/**
 * Read the effective UI/request settings in deterministic precedence order:
 * official defaults -> (only while legacy migration is still absent) compatible
 * legacy fields -> scoped values -> explicit call values. Hydrated configs mark
 * the old globals migrated exactly once, so provider B never absorbs a value
 * which had belonged to provider A.
 */
export function readVideoGenerationSettings(
    config: LegacyVideoGenerationConfig,
    scope: VideoGenerationSettingsScope,
    capability: ResolvedVideoModelCapability,
    explicit: VideoGenerationSettings = {},
): VideoGenerationSettings {
    const scoped = readScopedVideoGenerationSettings(config.videoGenerationSettingsByScope, scope);
    const explicitSettings = resolveDerivedDurationFrames(
        normalizeVideoGenerationSettings(explicit),
        capability,
    );
    const merged: VideoGenerationSettings = {
        ...videoGenerationDefaults(capability),
        ...(config.videoGenerationLegacyMigration ? {} : validatedLegacyVideoGenerationSettings(config, capability)),
        ...scoped,
        ...explicitSettings,
    };
    for (const name of scoped.providerDefaultFields || []) {
        if (!isProvided(explicitSettings[name])) delete merged[name];
    }
    for (const name of explicitSettings.providerDefaultFields || []) delete merged[name];
    return resolveDerivedDurationFrames(applyCanvasSecondsFallback(merged, config, capability), capability);
}

/**
 * The canvas still exposes seconds as the cross-provider workflow control, and
 * frames/fps contracts (e.g. Agnes) cannot display or submit a duration without
 * it. Legacy migration carried the old global into only the single scope that
 * was active at migration time, so scopes created later would otherwise be
 * stuck without any legal frame count. Seconds are provider-agnostic user
 * intent, never scoped provider state, so this fallback cannot leak provider
 * A's values into provider B. Explicit/scoped values and an explicit
 * "provider default" choice always win.
 */
function applyCanvasSecondsFallback(
    settings: VideoGenerationSettings,
    config: LegacyVideoGenerationConfig,
    capability: ResolvedVideoModelCapability,
): VideoGenerationSettings {
    const durationField = capability.generationParameters.duration;
    if (!durationField.derivedFrom?.includes("frames") || !durationField.derivedFrom.includes("fps")) return settings;
    if (typeof settings.duration === "number" || typeof settings.frames === "number") return settings;
    if ((settings.providerDefaultFields || []).includes("duration")) return settings;
    const seconds = legacyRawDuration(config.videoSeconds);
    if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds <= 0) return settings;
    return { ...settings, duration: seconds };
}

/**
 * The canvas exposes seconds as a workflow control, while Agnes only accepts
 * num_frames + frame_rate. Resolve that UI value before strict wire validation.
 * Existing explicit frame settings always win; 24fps is the application's
 * established fallback, not a claimed provider default.
 */
export function resolveDerivedDurationFrames(
    settings: VideoGenerationSettings,
    capability: ResolvedVideoModelCapability,
): VideoGenerationSettings {
    const durationField = capability.generationParameters.duration;
    if (
        !durationField.derivedFrom?.includes("frames")
        || !durationField.derivedFrom.includes("fps")
        || typeof settings.duration !== "number"
        || !Number.isInteger(settings.duration)
    ) return settings;

    const providerDefaultFields = new Set(settings.providerDefaultFields || []);
    const mayFillFrames = typeof settings.frames !== "number" && !providerDefaultFields.has("frames");
    const mayFillFps = typeof settings.fps !== "number" && !providerDefaultFields.has("fps");
    if (!mayFillFrames && !mayFillFps) return settings;

    const fps = typeof settings.fps === "number" ? settings.fps : mayFillFps ? 24 : undefined;
    if (typeof fps !== "number" || !isValidDerivedNumber(fps, capability.generationParameters.fps)) return settings;

    if (typeof settings.frames === "number") {
        return Math.round(settings.frames / fps) === settings.duration
            ? { ...settings, fps }
            : settings;
    }
    if (!mayFillFrames) return settings;

    const frames = nearestLegalFrameCount(
        settings.duration,
        fps,
        capability.generationParameters.frames,
    );
    return frames === undefined ? settings : { ...settings, frames, fps };
}

function nearestLegalFrameCount(
    duration: number,
    fps: number,
    field: ResolvedVideoModelCapability["generationParameters"]["frames"],
) {
    const minimum = Math.ceil(field.minimum ?? 1);
    const maximum = Math.floor(field.maximum ?? Math.max(minimum, duration * fps + 1_000));
    const offset = field.offsetMultiple?.offset ?? 0;
    const multiple = field.offsetMultiple?.multiple ?? 1;
    const target = duration * fps;
    const base = offset + Math.round((target - offset) / multiple) * multiple;
    const candidates = Array.from({ length: 9 }, (_, index) => base + (index - 4) * multiple)
        .filter((value) => Number.isInteger(value) && value >= minimum && value <= maximum)
        .filter((value) => Math.round(value / fps) === duration)
        .sort((left, right) => Math.abs(left - target) - Math.abs(right - target));
    return candidates[0];
}

function isValidDerivedNumber(
    value: number,
    field: ResolvedVideoModelCapability["generationParameters"][VideoGenerationParameterName],
) {
    if (field.status !== "supported" || !Number.isFinite(value)) return false;
    if ((field.valueType === "integer" || field.integer) && !Number.isInteger(value)) return false;
    if (field.minimum !== undefined && value < field.minimum) return false;
    if (field.maximum !== undefined && value > field.maximum) return false;
    return true;
}

/** Keep only fields whose exact provider/model contract is verified, then strictly validate. */
export function videoGenerationSettingsToRequest(
    settings: VideoGenerationSettings,
    capability: ResolvedVideoModelCapability,
): VideoGenerationParameters {
    const normalized = normalizeVideoGenerationSettings(settings);
    const allProvided: VideoGenerationParameters = {};
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        if (isProvided(normalized[name])) assignVideoSetting(allProvided, name, normalized[name]);
    }
    validateVideoGenerationParameters(capability, allProvided);
    const request: VideoGenerationParameters = {};
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        if (capability.generationParameters[name].status !== "supported") continue;
        const value = normalized[name];
        if (!isProvided(value)) continue;
        assignVideoSetting(request, name, value);
    }
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        const field = capability.generationParameters[name];
        if (field.status === "supported" && field.required && !isProvided(request[name])) {
            throw new Error(`${capability.providerLabel} / ${capability.model || "未命名模型"}：${name} 是当前合同的必填参数，请在视频设置中明确选择`);
        }
    }
    return validateVideoGenerationParameters(capability, request);
}

/** Snapshot only output-format fields that the active capability will actually put on the wire. */
export function snapshotVideoWireFormat(
    settings: VideoGenerationSettings,
    capability: ResolvedVideoModelCapability,
): VideoWireFormatSnapshot {
    try {
        const request = videoGenerationSettingsToRequest(settings, capability);
        const snapshot: VideoWireFormatSnapshot = {
            mode: request.dimensions !== undefined || request.aspectRatio !== undefined || request.resolution !== undefined
                ? "request"
                : "provider-default",
        };
        if (isVideoGenerationDimensions(request.dimensions)) snapshot.dimensions = request.dimensions;
        if (typeof request.aspectRatio === "string") snapshot.aspectRatio = request.aspectRatio;
        if (typeof request.resolution === "string") snapshot.resolution = request.resolution;
        return snapshot;
    } catch (error) {
        return {
            mode: "blocked",
            validationError: error instanceof Error ? error.message : "视频输出格式不符合当前 provider 合同",
        };
    }
}

/**
 * Convert persisted config to the request option consumed by the video runtime.
 * Explicit call parameters are validated before merging, so unsupported explicit fields never disappear silently.
 */
export function videoConfigToGenerationParameters(
    config: LegacyVideoGenerationConfig,
    scope: VideoGenerationSettingsScope,
    capability: ResolvedVideoModelCapability,
    explicit: VideoGenerationSettings = {},
): VideoGenerationParameters {
    const persisted = readVideoGenerationSettings(config, scope, capability);
    const explicitSettings = resolveDerivedDurationFrames(
        normalizeVideoGenerationSettings(explicit),
        capability,
    );
    const explicitProvided: VideoGenerationParameters = {};
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        if (isProvided(explicitSettings[name])) assignVideoSetting(explicitProvided, name, explicitSettings[name]);
    }
    validateVideoGenerationParameters(capability, explicitProvided);
    return videoGenerationSettingsToRequest(
        resolveDerivedDurationFrames({ ...persisted, ...explicitSettings }, capability),
        capability,
    );
}

export function inferVideoGenerationOperation(options: {
    model?: string;
    imageReferenceCount?: number;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
    hasKeyframes?: boolean;
}): VideoGenerationOperation {
    if (options.hasKeyframes) return "keyframes-to-video";
    if (options.hasFirstFrame && options.hasLastFrame) return "first-last-frame-to-video";
    if ((options.imageReferenceCount || 0) > 1) return "reference-to-video";
    if ((options.imageReferenceCount || 0) === 1) return "image-to-video";
    return "text-to-video";
}

/** Capability validation produces the intent; that intent is the sole authority for scoped settings. */
export function videoGenerationOperationFromIntent(options: {
    capability: ResolvedVideoModelCapability;
    referenceIntent: VideoGenerationReferenceIntent;
    hasReferenceVideo?: boolean;
    hasReferenceAudio?: boolean;
    hasFirstClip?: boolean;
}): VideoGenerationOperation {
    const { capability, referenceIntent } = options;
    if (capability.id === "dashscope-wan27-video-edit" || capability.id === "dashscope-happyhorse-video-edit") return "video-edit";
    if (options.hasFirstClip) return "continuation";
    if (referenceIntent.kind === "keyframes") return "keyframes-to-video";
    if (referenceIntent.kind === "first_last_frame") return "first-last-frame-to-video";
    if (
        referenceIntent.kind === "reference_set"
        || referenceIntent.kind === "reference_set_with_first"
        || referenceIntent.kind === "reference_set_with_frames"
    ) return "reference-to-video";
    if (referenceIntent.kind === "first_frame") return "image-to-video";
    if (options.hasReferenceVideo || options.hasReferenceAudio) return "reference-to-video";
    if (capability.intentPolicy === "blocked" && referenceIntent.kind !== "none") {
        throw new Error(`${capability.providerLabel} / ${capability.model || "未命名模型"}：参考素材合同未知，不能决定视频 operation scope`);
    }
    return "text-to-video";
}

function videoGenerationDefaults(capability: ResolvedVideoModelCapability): VideoGenerationSettings {
    const defaults: VideoGenerationSettings = {};
    for (const name of VIDEO_GENERATION_PARAMETER_NAMES) {
        const field = capability.generationParameters[name];
        if (field.status !== "supported" || field.defaultValue === undefined) continue;
        assignVideoSetting(defaults, name, field.defaultValue);
    }
    return defaults;
}

function legacyVideoSettingsForMigration(
    config: LegacyVideoGenerationConfig,
    capability: ResolvedVideoModelCapability,
): { settings: VideoGenerationSettings; unmappedFields: string[] } {
    const settings: VideoGenerationSettings = {};
    const unmappedFields: string[] = [];
    const duration = legacyRawDuration(config.videoSeconds);
    if (duration !== undefined) settings.duration = duration;
    const resolution = String(config.vquality || "").trim();
    if (resolution) settings.resolution = resolution;
    const size = String(config.size || "").trim();
    if (size) {
        if (capability.generationParameters.dimensions.status === "supported") settings.dimensions = size;
        else if (capability.generationParameters.aspectRatio.status === "supported") settings.aspectRatio = size;
        else unmappedFields.push("size");
    }
    const audio = legacyBoolean(config.videoGenerateAudio);
    if (audio !== undefined) settings.audio = audio;
    const watermark = legacyBoolean(config.videoWatermark);
    if (watermark !== undefined) settings.watermark = watermark;
    return { settings: normalizeVideoGenerationSettings(settings), unmappedFields };
}

function legacyRawDuration(value: string | undefined): VideoGenerationSettings["duration"] | undefined {
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : raw;
}

function validatedLegacyVideoGenerationSettings(
    config: LegacyVideoGenerationConfig,
    capability: ResolvedVideoModelCapability,
): VideoGenerationSettings {
    const candidates: VideoGenerationSettings = {};
    const duration = legacyEnumOrNumber(config.videoSeconds, capability.generationParameters.duration);
    if (duration !== undefined) {
        candidates.duration = duration;
        if (
            typeof duration === "number"
            && Number.isInteger(duration)
            && capability.generationParameters.duration.derivedFrom?.includes("frames")
            && capability.generationParameters.duration.derivedFrom?.includes("fps")
        ) {
            const fps = 24;
            const frames = duration * fps + 1;
            const framesField = capability.generationParameters.frames;
            const officialSeconds = frames / fps;
            const roundedDuration = Math.round(officialSeconds);
            const legalOffset = !framesField.offsetMultiple || (frames - framesField.offsetMultiple.offset) % framesField.offsetMultiple.multiple === 0;
            const legalRange = (framesField.minimum === undefined || frames >= framesField.minimum) && (framesField.maximum === undefined || frames <= framesField.maximum);
            if (roundedDuration === duration && legalOffset && legalRange) {
                candidates.frames = frames;
                candidates.fps = fps;
            }
        }
    }
    const resolution = legacyEnumString(config.vquality, capability.generationParameters.resolution);
    if (resolution !== undefined) candidates.resolution = resolution;
    const dimensions = legacyEnumString(config.size, capability.generationParameters.dimensions);
    if (dimensions !== undefined) candidates.dimensions = dimensions;
    const aspectRatio = legacyEnumString(config.size, capability.generationParameters.aspectRatio);
    if (aspectRatio !== undefined) candidates.aspectRatio = aspectRatio;
    if (capability.generationParameters.audio.status === "supported" && capability.generationParameters.audio.valueType === "boolean") {
        const audio = legacyBoolean(config.videoGenerateAudio);
        if (audio !== undefined) candidates.audio = audio;
    }
    if (capability.generationParameters.watermark.status === "supported" && capability.generationParameters.watermark.valueType === "boolean") {
        const watermark = legacyBoolean(config.videoWatermark);
        if (watermark !== undefined) candidates.watermark = watermark;
    }

    const accepted: VideoGenerationSettings = {};
    if (candidates.duration !== undefined && capability.generationParameters.duration.derivedFrom?.includes("frames")) {
        try {
            const derived = { duration: candidates.duration, frames: candidates.frames, fps: candidates.fps };
            validateVideoGenerationParameters(capability, derived as VideoGenerationParameters);
            accepted.duration = candidates.duration;
            accepted.frames = candidates.frames;
            accepted.fps = candidates.fps;
        } catch {
            // Legacy seconds cannot be represented by this provider's official frame-rate display contract.
        }
        delete candidates.duration;
        delete candidates.frames;
        delete candidates.fps;
    }

    for (const [name, value] of Object.entries(candidates) as [VideoGenerationParameterName, VideoGenerationSettings[VideoGenerationParameterName]][]) {
        try {
            validateVideoGenerationParameters(capability, { [name]: value } as VideoGenerationParameters);
            assignVideoSetting(accepted, name, value);
        } catch {
            // An old cross-provider value is preserved in its legacy field but is not adopted by this scope.
        }
    }
    return accepted;
}

function legacyEnumOrNumber(
    value: string | undefined,
    field: ResolvedVideoModelCapability["generationParameters"][VideoGenerationParameterName],
): number | string | undefined {
    if (field.status !== "supported") return undefined;
    if (field.valueType === "string") return legacyEnumString(value, field);
    if (field.valueType !== "integer" && field.valueType !== "number") return undefined;
    const number = Number(String(value || "").trim());
    return Number.isFinite(number) ? number : undefined;
}

function legacyEnumString(
    value: string | undefined,
    field: ResolvedVideoModelCapability["generationParameters"][VideoGenerationParameterName],
): string | undefined {
    if (field.status !== "supported" || (field.valueType !== "string" && field.valueType !== "dimensions")) return undefined;
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    if (!field.enumValues?.length) return raw;
    const normalized = raw.toLowerCase().replace(/p$/, "");
    const exact = field.enumValues.find((entry) => typeof entry === "string" && entry.toLowerCase() === raw.toLowerCase());
    if (typeof exact === "string") return exact;
    const resolutionAlias = field.enumValues.find((entry) => typeof entry === "string" && entry.toLowerCase().replace(/p$/, "") === normalized);
    return typeof resolutionAlias === "string" ? resolutionAlias : undefined;
}

function legacyBoolean(value: string | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return undefined;
}

function normalizeVideoGenerationSetting(name: VideoGenerationParameterName, value: unknown): VideoGenerationSettings[VideoGenerationParameterName] | undefined {
    if (value === undefined || value === null) return undefined;
    if (name === "dimensions") {
        if (typeof value === "string") return value.trim();
        if (isRecord(value) && isFiniteNumber(value.width) && isFiniteNumber(value.height)) return { width: value.width, height: value.height };
        return undefined;
    }
    if (name === "audio" && Array.isArray(value)) {
        return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
    }
    if (name === "audio" && typeof value === "boolean") return value;
    if (["duration", "audio"].includes(name) && typeof value === "string") return value;
    if (["resolution", "aspectRatio", "negativePrompt", "sampler", "scheduler", "modelVariant", "mode", "audioMode"].includes(name)) {
        return typeof value === "string" ? value : undefined;
    }
    if (["watermark", "promptExpansion", "safetyChecker", "returnLastFrame", "turbo", "usePro"].includes(name)) {
        return typeof value === "boolean" ? value : undefined;
    }
    return isFiniteNumber(value) ? value : undefined;
}

function isVideoGenerationDimensions(value: unknown): value is VideoGenerationDimensions {
    return typeof value === "string"
        || (isRecord(value) && isFiniteNumber(value.width) && isFiniteNumber(value.height));
}

function assignVideoSetting(
    target: VideoGenerationSettings | VideoGenerationParameters,
    name: VideoGenerationParameterName,
    value: VideoGenerationSettings[VideoGenerationParameterName] | undefined,
) {
    if (value !== undefined) (target as Record<string, unknown>)[name] = value;
}

function isProvided(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function positiveIntegerDraft(value: string) {
    const normalized = value.trim();
    if (!/^\d+$/u.test(normalized)) return undefined;
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
