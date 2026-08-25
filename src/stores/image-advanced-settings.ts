import type {
    ImageAdvancedFieldsCapability,
    ImageOperation,
    ImageRequestValidationInput,
    ResolvedImageModelCapability,
} from "../services/api/image-model-capabilities";
import { validateImageModelRequest } from "../services/api/image-model-capabilities";
import {
    assertCivitaiLoraCompatibility,
    parseCivitaiLoraAir,
    type CivitaiLoraResolution,
    type CivitaiLoraResourceKind,
    type CivitaiLoraVersionOption,
} from "../services/api/civitai-lora-resource";

export type ImageLoraSetting = {
    /** Exact identity entered by the user; never used as the wire key unless it is a full AIR. */
    resource: string;
    resourceKind: CivitaiLoraResourceKind;
    weight: number;
    /** Exact model-version AIR returned by Civitai, or a validated full AIR entered directly. */
    resolvedAir?: string;
    modelId?: string;
    modelVersionId?: string;
    ecosystem?: string;
    baseModel?: string;
    baseModelType?: string;
    modelName?: string;
    versionName?: string;
    resolutionStatus?: "unresolved" | "resolved" | "version-selection-required" | "error";
    resolutionError?: string;
    versionOptions?: CivitaiLoraVersionOption[];
};

export type ImageAdvancedSettings = {
    /** Basic output controls are provider/model/operation scoped too. */
    quality?: string;
    size?: string;
    count?: string;
    /** Provider/model-scoped requestable output format (for example png, webP, JPG). */
    outputFormat?: string;
    negativePrompt?: string;
    /** Decimal string preserves the complete signed int64 range without JS precision loss. */
    seed?: string;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    scheduler?: string;
    /** Civitai SD1-only CLIP skip (live OpenAPI clipSkip, 1-12; SDXL rejects it upstream). */
    clipSkip?: number;
    /** Explicit image-set mode for exact profiles such as DashScope Wan2.7. */
    sequential?: boolean;
    loras?: ImageLoraSetting[];
    /** Civitai SDXL createVariant checkpoint AIR; never inferred from the service ID. */
    checkpointAir?: string;
    /** Civitai SDXL createVariant denoise strength. */
    strength?: number;
    vaeAir?: string;
    embeddings?: string[];
    uCache?: "off" | "normal";
    /** OpenAI Responses image_generation tool-only options. */
    background?: "auto" | "opaque" | "transparent";
    inputFidelity?: "low" | "high";
    moderation?: "auto" | "low";
    outputCompression?: number;
    partialImages?: number;
    responseFormat?: "url" | "b64_json";
};

export type ImageAdvancedSettingsByScope = Record<
    string,
    Record<string, Partial<Record<ImageOperation, ImageAdvancedSettings>>>
>;

export type ImageAdvancedSettingsScope = {
    providerId: string;
    model: string;
    operation: ImageOperation;
};

export type ImageGenerationLegacyMigration = {
    version: 1;
    state: "migrated" | "pending";
    scope?: ImageAdvancedSettingsScope;
};

type LegacyImageGenerationConfig = {
    quality?: string;
    size?: string;
    count?: string;
    imageAdvancedSettingsByScope?: ImageAdvancedSettingsByScope;
    imageGenerationLegacyMigration?: ImageGenerationLegacyMigration;
};

export function normalizeImageAdvancedSettings(value: unknown): ImageAdvancedSettings {
    if (!isRecord(value)) return {};
    const normalized: ImageAdvancedSettings = {};
    if (typeof value.quality === "string") normalized.quality = value.quality.trim();
    if (typeof value.size === "string") normalized.size = value.size.trim();
    if (typeof value.count === "string" || typeof value.count === "number") normalized.count = String(value.count).trim();
    if (typeof value.outputFormat === "string") normalized.outputFormat = value.outputFormat.trim();
    if (typeof value.negativePrompt === "string") normalized.negativePrompt = value.negativePrompt;
    if (typeof value.seed === "string" || typeof value.seed === "number") normalized.seed = String(value.seed).trim();
    if (isFiniteNumber(value.steps)) normalized.steps = value.steps;
    if (isFiniteNumber(value.cfgScale)) normalized.cfgScale = value.cfgScale;
    if (typeof value.sampler === "string") normalized.sampler = value.sampler;
    if (typeof value.scheduler === "string") normalized.scheduler = value.scheduler;
    if (typeof value.sequential === "boolean") normalized.sequential = value.sequential;
    if (Array.isArray(value.loras)) {
        normalized.loras = value.loras.flatMap((entry): ImageLoraSetting[] => {
            if (!isRecord(entry) || typeof entry.resource !== "string" || !isFiniteNumber(entry.weight)) return [];
            const resource = entry.resource;
            const resourceKind = isCivitaiLoraResourceKind(entry.resourceKind)
                ? entry.resourceKind
                : parseCivitaiLoraAir(resource)
                  ? "air"
                  : "version-id";
            const parsedDirectAir = resourceKind === "air" ? parseCivitaiLoraAir(resource) : undefined;
            const parsedResolvedAir = typeof entry.resolvedAir === "string" ? parseCivitaiLoraAir(entry.resolvedAir) : undefined;
            // A complete direct AIR is already the selected wire identity.  Do
            // not let stale persisted resolution metadata replace it.
            const identityAir = parsedDirectAir || parsedResolvedAir;
            const resolvedAir = identityAir?.air;
            const modelId = parsedDirectAir?.modelId || normalizePositiveIntegerString(entry.modelId) || parsedResolvedAir?.modelId;
            const modelVersionId = parsedDirectAir?.modelVersionId || normalizePositiveIntegerString(entry.modelVersionId) || parsedResolvedAir?.modelVersionId;
            const ecosystem = parsedDirectAir?.ecosystem || parsedResolvedAir?.ecosystem || optionalString(entry.ecosystem);
            const versionOptions = Array.isArray(entry.versionOptions)
                ? entry.versionOptions.flatMap(normalizeVersionOption)
                : undefined;
            const resolutionStatus = isResolutionStatus(entry.resolutionStatus)
                ? entry.resolutionStatus === "resolved" && !resolvedAir
                    ? "unresolved"
                    : entry.resolutionStatus
                : resolvedAir
                  ? "resolved"
                  : "unresolved";
            return [{
                resource,
                resourceKind,
                weight: entry.weight,
                ...(resolvedAir ? { resolvedAir } : {}),
                ...(modelId ? { modelId } : {}),
                ...(modelVersionId ? { modelVersionId } : {}),
                ...(ecosystem ? { ecosystem } : {}),
                ...copyOptionalStringFields(entry, ["baseModel", "baseModelType", "modelName", "versionName"]),
                resolutionStatus,
                ...(resolutionStatus === "error" && optionalString(entry.resolutionError) ? { resolutionError: optionalString(entry.resolutionError) } : {}),
                ...(versionOptions?.length ? { versionOptions } : {}),
            }];
        });
    }
    if (typeof value.checkpointAir === "string") normalized.checkpointAir = value.checkpointAir.trim();
    if (isFiniteNumber(value.strength)) normalized.strength = value.strength;
    if (typeof value.vaeAir === "string") normalized.vaeAir = value.vaeAir.trim();
    if (Array.isArray(value.embeddings)) normalized.embeddings = value.embeddings.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    if (value.uCache === "off" || value.uCache === "normal") normalized.uCache = value.uCache;
    if (value.background === "auto" || value.background === "opaque" || value.background === "transparent") normalized.background = value.background;
    if (value.inputFidelity === "low" || value.inputFidelity === "high") normalized.inputFidelity = value.inputFidelity;
    if (value.moderation === "auto" || value.moderation === "low") normalized.moderation = value.moderation;
    if (isFiniteNumber(value.outputCompression)) normalized.outputCompression = value.outputCompression;
    if (isFiniteNumber(value.partialImages)) normalized.partialImages = value.partialImages;
    if (value.responseFormat === "url" || value.responseFormat === "b64_json") normalized.responseFormat = value.responseFormat;
    return normalized;
}

export function normalizeImageAdvancedSettingsByScope(value: unknown): ImageAdvancedSettingsByScope {
    if (!isRecord(value)) return {};
    const normalized: ImageAdvancedSettingsByScope = {};
    for (const [rawProviderId, rawModels] of Object.entries(value)) {
        const providerId = rawProviderId.trim();
        if (!providerId || !isRecord(rawModels)) continue;
        const models: ImageAdvancedSettingsByScope[string] = {};
        for (const [rawModel, rawOperations] of Object.entries(rawModels)) {
            const model = rawModel.trim();
            if (!model || !isRecord(rawOperations)) continue;
            const operations: Partial<Record<ImageOperation, ImageAdvancedSettings>> = {};
            for (const operation of IMAGE_OPERATIONS) {
                if (!isRecord(rawOperations[operation])) continue;
                operations[operation] = normalizeImageAdvancedSettings(rawOperations[operation]);
            }
            if (Object.keys(operations).length) models[model] = operations;
        }
        if (Object.keys(models).length) normalized[providerId] = models;
    }
    return normalized;
}

export function readImageAdvancedSettings(
    settingsByScope: ImageAdvancedSettingsByScope | undefined,
    scope: ImageAdvancedSettingsScope,
): ImageAdvancedSettings {
    return normalizeImageAdvancedSettings(
        settingsByScope?.[scope.providerId]?.[scope.model]?.[scope.operation],
    );
}

/**
 * The request runtime consumes this subset instead of ambient global
 * quality/size/count values.  It deliberately preserves incompatible saved
 * values so the request boundary can block and explain them rather than
 * silently substituting a provider default.
 */
export function readScopedImageGenerationSettings(
    settingsByScope: ImageAdvancedSettingsByScope | undefined,
    scope: ImageAdvancedSettingsScope,
): Pick<ImageAdvancedSettings, "quality" | "size" | "count"> {
    const settings = readImageAdvancedSettings(settingsByScope, scope);
    return {
        ...(settings.quality ? { quality: settings.quality } : {}),
        ...(settings.size ? { size: settings.size } : {}),
        ...(settings.count ? { count: settings.count } : {}),
    };
}

/**
 * Migrate legacy global basic controls once into an exact route scope. Existing
 * scoped values always win. The old fields are intentionally retained by the
 * caller for recovery/audit; after this marker is written they are not a
 * fallback for another provider.
 */
export function migrateLegacyImageGenerationSettings(
    config: LegacyImageGenerationConfig,
    scope: ImageAdvancedSettingsScope,
): {
    settingsByScope: ImageAdvancedSettingsByScope;
    migration: ImageGenerationLegacyMigration;
} {
    const current = normalizeImageAdvancedSettingsByScope(config.imageAdvancedSettingsByScope);
    const existingMigration = config.imageGenerationLegacyMigration;
    if (existingMigration?.version === 1 && existingMigration.state === "migrated") {
        return { settingsByScope: current, migration: existingMigration };
    }
    if (!scope.providerId.trim() || !scope.model.trim()) {
        return {
            settingsByScope: current,
            migration: { version: 1, state: "pending" },
        };
    }
    const legacy = normalizeImageAdvancedSettings({
        quality: config.quality,
        size: config.size,
        count: config.count,
    });
    const existing = readImageAdvancedSettings(current, scope);
    return {
        settingsByScope: writeImageAdvancedSettings(current, scope, { ...legacy, ...existing }),
        migration: { version: 1, state: "migrated", scope: { ...scope } },
    };
}

/**
 * Validate preserved basic settings before transport normalization. Calling
 * code must run this before helpers which otherwise omit an invalid field.
 */
export function validateScopedImageGenerationSettings(
    settings: Pick<ImageAdvancedSettings, "quality" | "size" | "count">,
    capability: ResolvedImageModelCapability,
): void {
    const outputCount = Number(settings.count || 1);
    const validation = validateImageModelRequest(capability, {
        operation: capability.operation,
        prompt: capability.serialization.kind === "openai-responses-image-tool" ? "settings validation" : "",
        outputCount,
        referenceCount: 0,
        hasMask: false,
        ...(settings.quality ? { quality: settings.quality } : {}),
        ...(settings.size ? { size: settings.size } : {}),
    });
    const settingErrors = validation.errors.filter((issue) =>
        issue.field === "quality" || issue.field === "size" || issue.field === "outputCount",
    );
    if (settingErrors.length) throw new Error(settingErrors.map((issue) => issue.message).join("；"));
}

export function writeImageAdvancedSettings(
    settingsByScope: ImageAdvancedSettingsByScope | undefined,
    scope: ImageAdvancedSettingsScope,
    settings: ImageAdvancedSettings,
): ImageAdvancedSettingsByScope {
    const current = normalizeImageAdvancedSettingsByScope(settingsByScope);
    return {
        ...current,
        [scope.providerId]: {
            ...(current[scope.providerId] || {}),
            [scope.model]: {
                ...(current[scope.providerId]?.[scope.model] || {}),
                [scope.operation]: normalizeImageAdvancedSettings(settings),
            },
        },
    };
}

/**
 * Convert only fields verified as requestable by the resolved capability.
 * Hidden values from another profile remain persisted and cannot leak onto the wire.
 */
export function imageAdvancedSettingsToRequest(
    settings: ImageAdvancedSettings,
    capabilities: ImageAdvancedFieldsCapability,
    context?: { readonly model?: string },
): Pick<
    ImageRequestValidationInput,
    "negativePrompt" | "seed" | "steps" | "cfgScale" | "sampler" | "scheduler" | "sequential" | "loras"
> & { clipSkip?: number } {
    const request: {
        negativePrompt?: string;
        seed?: string;
        steps?: number;
        cfgScale?: number;
        sampler?: string;
        scheduler?: string;
        sequential?: boolean;
        loras?: Record<string, number>;
        clipSkip?: number;
    } = {};
    if (capabilities.negativePrompt.state === "supported" && capabilities.negativePrompt.kind === "string" && settings.negativePrompt?.trim()) request.negativePrompt = settings.negativePrompt;
    if (capabilities.seed.state === "supported" && capabilities.seed.kind === "int64" && settings.seed?.trim()) request.seed = settings.seed.trim();
    if (capabilities.steps.state === "supported" && capabilities.steps.kind === "number" && isFiniteNumber(settings.steps)) request.steps = settings.steps;
    if (capabilities.cfgScale.state === "supported" && capabilities.cfgScale.kind === "number" && isFiniteNumber(settings.cfgScale)) request.cfgScale = settings.cfgScale;
    if (capabilities.sampler.state === "supported" && capabilities.sampler.kind === "enum" && settings.sampler?.trim()) request.sampler = settings.sampler;
    if (capabilities.scheduler.state === "supported" && capabilities.scheduler.kind === "enum" && settings.scheduler?.trim()) request.scheduler = settings.scheduler;
    if (capabilities.clipSkip.state === "supported" && capabilities.clipSkip.kind === "number" && isFiniteNumber(settings.clipSkip)) request.clipSkip = settings.clipSkip;
    if (capabilities.sequential.state === "supported" && capabilities.sequential.kind === "boolean" && typeof settings.sequential === "boolean") request.sequential = settings.sequential;
    if (capabilities.loras.state === "supported" && capabilities.loras.kind === "number-map") {
        const entries = settings.loras || [];
        const loras: Record<string, number> = {};
        for (const [index, entry] of entries.entries()) {
            const identity = entry.resource.trim();
            if (!identity) throw new Error(`第 ${index + 1} 个 LoRA 缺少资源 identity；请填写或移除该行`);
            if (!isFiniteNumber(entry.weight)) throw new Error(`第 ${index + 1} 个 LoRA 权重必须是有限数字`);
            const directAir = entry.resourceKind === "air" ? parseCivitaiLoraAir(identity) : undefined;
            const resolved = directAir || (entry.resolvedAir ? parseCivitaiLoraAir(entry.resolvedAir) : undefined);
            if (!resolved) {
                const detail = entry.resolutionError?.trim() ? `：${entry.resolutionError.trim()}` : "";
                throw new Error(`第 ${index + 1} 个 LoRA（${identity}）尚未解析为官方 model-version AIR${detail}`);
            }
            if (entry.resourceKind !== "air" && entry.resolutionStatus !== "resolved") {
                throw new Error(`第 ${index + 1} 个 LoRA（${identity}）的 ID 尚未完成官方解析`);
            }
            assertResolvedLoraIdentity(entry, resolved, identity, index);
            if (context?.model) assertCivitaiLoraCompatibility({ ...resolved, baseModel: entry.baseModel }, context.model);
            if (Object.prototype.hasOwnProperty.call(loras, resolved.air)) {
                throw new Error(`多个 LoRA 解析为同一个 AIR：${resolved.air}；请保留一条并明确权重`);
            }
            loras[resolved.air] = entry.weight;
        }
        if (Object.keys(loras).length) request.loras = loras;
    }
    return request;
}

function assertResolvedLoraIdentity(entry: ImageLoraSetting, resolved: NonNullable<ReturnType<typeof parseCivitaiLoraAir>>, identity: string, index: number) {
    const expectedResourceId = entry.resourceKind === "air" ? undefined : normalizePositiveIntegerString(identity);
    const expectedModelId = entry.resourceKind === "model-id" ? expectedResourceId : normalizePositiveIntegerString(entry.modelId);
    const expectedModelVersionId = entry.resourceKind === "version-id" ? expectedResourceId : normalizePositiveIntegerString(entry.modelVersionId);
    if (expectedModelId && resolved.modelId !== expectedModelId) {
        throw new Error(`第 ${index + 1} 个 LoRA 的 resolved AIR model ID 与保存的 identity 不一致；请重新解析`);
    }
    if (expectedModelVersionId && resolved.modelVersionId !== expectedModelVersionId) {
        throw new Error(`第 ${index + 1} 个 LoRA 的 resolved AIR version ID 与保存的 identity 不一致；请重新解析`);
    }
}

export function resetImageLoraResolution(
    setting: ImageLoraSetting,
    identity: { readonly resource?: string; readonly resourceKind?: CivitaiLoraResourceKind },
): ImageLoraSetting {
    return {
        resource: identity.resource ?? setting.resource,
        resourceKind: identity.resourceKind ?? setting.resourceKind,
        weight: setting.weight,
        resolutionStatus: "unresolved",
    };
}

export function applyCivitaiLoraResolution(setting: ImageLoraSetting, resolution: CivitaiLoraResolution): ImageLoraSetting {
    if (resolution.status === "version-selection-required") {
        return {
            resource: setting.resource,
            resourceKind: setting.resourceKind,
            weight: setting.weight,
            modelId: resolution.modelId,
            ...(resolution.modelName ? { modelName: resolution.modelName } : {}),
            resolutionStatus: "version-selection-required",
            versionOptions: [...resolution.versions],
        };
    }
    return {
        resource: setting.resource,
        resourceKind: setting.resourceKind,
        weight: setting.weight,
        resolvedAir: resolution.resource.air,
        modelId: resolution.resource.modelId,
        modelVersionId: resolution.resource.modelVersionId,
        ecosystem: resolution.resource.ecosystem,
        ...(resolution.resource.baseModel ? { baseModel: resolution.resource.baseModel } : {}),
        ...(resolution.resource.baseModelType ? { baseModelType: resolution.resource.baseModelType } : {}),
        ...(resolution.resource.modelName ? { modelName: resolution.resource.modelName } : {}),
        ...(resolution.resource.versionName ? { versionName: resolution.resource.versionName } : {}),
        resolutionStatus: "resolved",
    };
}

export function imageLoraResolutionError(setting: ImageLoraSetting, error: unknown): ImageLoraSetting {
    return {
        ...resetImageLoraResolution(setting, {}),
        resolutionStatus: "error",
        resolutionError: error instanceof Error ? error.message : String(error || "Civitai LoRA 解析失败"),
    };
}

const IMAGE_OPERATIONS: readonly ImageOperation[] = ["generate", "edit", "variation", "responses-tool"];

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isCivitaiLoraResourceKind(value: unknown): value is CivitaiLoraResourceKind {
    return value === "air" || value === "model-id" || value === "version-id";
}

function isResolutionStatus(value: unknown): value is NonNullable<ImageLoraSetting["resolutionStatus"]> {
    return value === "unresolved" || value === "resolved" || value === "version-selection-required" || value === "error";
}

function normalizeVersionOption(value: unknown): CivitaiLoraVersionOption[] {
    if (!isRecord(value)) return [];
    const modelVersionId = normalizePositiveIntegerString(value.modelVersionId);
    const name = optionalString(value.name);
    if (!modelVersionId || !name) return [];
    const compatible = value.compatible === true ? true : value.compatible === false ? false : null;
    return [{
        modelVersionId,
        name,
        ...(optionalString(value.baseModel) ? { baseModel: optionalString(value.baseModel) } : {}),
        compatible,
        ...(optionalString(value.compatibilityError) ? { compatibilityError: optionalString(value.compatibilityError) } : {}),
    }];
}

function normalizePositiveIntegerString(value: unknown) {
    const normalized = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
    if (!/^\d+$/.test(normalized)) return "";
    try {
        const parsed = BigInt(normalized);
        return parsed > 0n ? parsed.toString() : "";
    } catch {
        return "";
    }
}

function optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function copyOptionalStringFields(value: Record<string, unknown>, fields: readonly string[]) {
    const result: Record<string, string> = {};
    for (const field of fields) {
        const normalized = optionalString(value[field]);
        if (normalized) result[field] = normalized;
    }
    return result;
}
