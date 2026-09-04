import axios from "axios";

import { explicitMediaRequestModel, explicitTextRequestModel, resolveApiRequestRoute, routedLocalApiUrl, routedLocalHeaders, type ApiRequestRoute } from "@/services/api/ai-routing";
import { buildLocalRelayProxyHeaders, buildLocalRelayProxyUrl, rotateRelayApiKey, selectRelayCredential } from "@/services/api/relay-proxy";
import { isDashscopeRoute, requestDashscopeImages, waitForDashscopeImageTask } from "@/services/api/dashscope";
import { normalizeSenseNovaImageSize, requestMiaohuaImages, waitForMiaohuaImageTask } from "@/services/api/sensenova";
import { agnesImageRatio, agnesImageSizeTier, isAgnesRoute } from "@/services/api/agnes";
import { createCivitaiWorkflow, isCivitaiRoute, resolveCivitaiRouteService, waitCivitaiWorkflow } from "@/services/api/civitai-client";
import { buildCivitaiImageWorkflow, civitaiAllowsMatureContent, type CivitaiWorkflowState } from "@/services/api/civitai-orchestration";
import type { CivitaiGenerationService } from "@/services/api/civitai-services";
import {
    planImageOutputRequests,
    resolveImageModelCapability,
    validateImageModelRequest,
    type ImageOutputRequestPlan,
    type ImageRequestValidationInput,
    type ResolvedImageModelCapability,
} from "@/services/api/image-model-capabilities";
import { toRelayModelDiscoveryError } from "@/services/api/relay-errors";
import { shouldUseDesktopLoopback } from "@/services/desktop-api-url";
import { describeTextTransportError, detectTextApiResponseError } from "@/services/api/text-response-errors";
import type { ApiBoardRouteKey, ApiRelayProvider } from "@/stores/api-relay-config";
import {
    imageAdvancedSettingsToRequest,
    readImageAdvancedSettings,
    readScopedImageGenerationSettings,
    validateScopedImageGenerationSettings,
} from "@/stores/image-advanced-settings";
import { type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { nanoid } from "nanoid";
import { base64ImageDataUrl, dataUrlToFile, getDataUrlByteSize, isLikelyImageDataUrl } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { explicitImageSizeToAspectRatio } from "@/lib/image-size-selection";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveMiaohuaPublicReference } from "@/services/image-host-upload";
import { getStoredAuthKey } from "@/store/auth";
import type { ReferenceImage } from "@/types/image";
import type { NativeImageTaskSubmissionObserver } from "@/services/api/native-image-task";
import { NativeImageTaskTerminalError, restoreNativeImageTaskCredential, type CanvasImageTaskSnapshot } from "@/services/api/native-image-task";
import { ensureApiRelaySettings, providerDisplayName, resolveApiRelayTimeoutMs } from "@/stores/api-relay-config";
import { generateStudioImage } from "@/studio/generate/image";
import { STUDIO_PROVIDERS } from "@/studio/wiring";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ChatCompletionOptions = {
    responseFormat?: "json_object";
    stream?: boolean;
    disableFileGeneration?: boolean;
    boardRouteKey?: ApiBoardRouteKey;
    requestPurpose?: "storyDirector";
};

const AGNES_PRO_ALPHA_STORY_MAX_TOKENS = 16_384;

function storyCompletionBudget(route: ApiRequestRoute, requestPurpose?: ChatCompletionOptions["requestPurpose"]) {
    const adapterType = route.mode === "local" ? String(route.provider.adapterType || "").trim().toLowerCase() : "";
    return requestPurpose === "storyDirector" && adapterType === "agnes" && route.model === "agnes-2.5-pro-alpha"
        ? AGNES_PRO_ALPHA_STORY_MAX_TOKENS
        : undefined;
}

export type ImageAdvancedOptions = {
    /** Runtime lifecycle hook; awaited after a real remote ID exists and before the first poll. */
    onNativeTaskSubmitted?: NativeImageTaskSubmissionObserver;
    outputFormat?: string;
    negativePrompt?: string;
    seed?: number | string;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    scheduler?: string;
    /** Civitai SD1-only CLIP skip. */
    clipSkip?: number;
    sequential?: boolean;
    loras?: Readonly<Record<string, number>>;
    checkpointAir?: string;
    strength?: number;
    vaeAir?: string;
    embeddings?: readonly string[];
    uCache?: "off" | "normal";
    background?: "auto" | "opaque" | "transparent";
    inputFidelity?: "low" | "high";
    moderation?: "auto" | "low";
    outputCompression?: number;
    partialImages?: number;
    responseFormat?: "url" | "b64_json";
};

export type ImageGenerationOptions = ImageAdvancedOptions & {
    /** Ordered optional-image inputs for generate-capable provider contracts. */
    references?: readonly ReferenceImage[];
};

export type ImageEditOptions = ImageAdvancedOptions & {
    useReferenceLabels?: boolean;
};

export type ImageVariationOptions = ImageAdvancedOptions & { prompt?: string };
export type ImageResponsesToolOptions = Pick<
    ImageAdvancedOptions,
    "outputFormat" | "background" | "inputFidelity" | "moderation" | "outputCompression" | "partialImages" | "onNativeTaskSubmitted"
>;

export type ImageRequestOperation = "generate" | "edit" | "variation" | "responses-tool";

export type ImageRequestPreflightOptions = ImageAdvancedOptions & {
    useReferenceLabels?: boolean;
};

export type ImageRequestPreflight = ResolvedImageRequestCapability & {
    readonly operation: ImageRequestOperation;
    readonly prompt: string;
    readonly settings: PreparedImageSettings;
    readonly advanced: ImageAdvancedOptions;
    readonly plan: ImageOutputRequestPlan;
};

/**
 * The effective provider contract for an image request. Resolve this before
 * planning a canvas request so preflight and submission share one route,
 * Civitai service lookup, and capability decision.
 */
export type ResolvedImageRequestCapability = {
    readonly route: ApiRequestRoute;
    readonly service: CivitaiGenerationService | undefined;
    readonly capability: ResolvedImageModelCapability;
    /** Runtime-only Civitai key for this request, when available. */
    readonly civitaiApiKey?: string;
    /** Opaque Civitai vault identity pinned across preflight/create/poll. */
    readonly civitaiCredentialId?: string;
};

type ImageApiError = {
    message?: string;
    code?: string | null;
    type?: string;
    param?: string | null;
};

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: ImageApiError;
    code?: number;
    msg?: string;
};

export type GeneratedImageResult = {
    id: string;
    dataUrl: string;
    backendUrl?: string;
    backendRel?: string;
    revisedPrompt?: string;
    metadata?: {
        responseId?: string;
        callId?: string;
    };
};

const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const IMAGE_REQUEST_TIMEOUT_MS = 360_000;

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return ["auto", "low", "medium", "high", "standard", "hd"].includes(normalized) ? normalized : undefined;
}

function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    return { width: w, height: h };
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function closestPublishedAspectRatio(values: readonly string[], width: number, height: number) {
    const target = Math.max(1, width) / Math.max(1, height);
    const candidates = values.flatMap((value) => {
        try {
            const parsed = parseImageRatio(value);
            return [{ value, ratio: parsed.width / parsed.height }];
        } catch {
            return [];
        }
    });
    if (!candidates.length) return explicitImageSizeToAspectRatio(`${width}x${height}`);
    return candidates.reduce((best, candidate) => (
        Math.abs(candidate.ratio - target) < Math.abs(best.ratio - target) ? candidate : best
    )).value;
}

function civitaiMappedImageSizeToken(width: number, height: number) {
    if (width === height) return width >= 1024 ? "square_hd" : "square";
    const landscape = width > height;
    const wide = Math.max(width, height) / Math.max(1, Math.min(width, height)) >= 1.5;
    return `${landscape ? "landscape" : "portrait"}_${wide ? "16_9" : "4_3"}`;
}

function civitaiMappedResolutionTier(width: number, height: number) {
    const longest = Math.max(width, height);
    return longest > 2048 ? "4K" : longest > 1024 ? "2K" : "1K";
}

function civitaiMappedKrea2Size(width: number, height: number) {
    return Math.max(width, height) < 1536 ? "medium" : "large";
}

function closestEnumImageSize(values: readonly string[], ratio: string) {
    const parsed = parseImageRatio(ratio);
    const target = parsed.width / parsed.height;
    const candidates = values
        .map((value) => ({ value, dimensions: parseImageDimensions(value) }))
        .filter((item): item is { value: string; dimensions: { width: number; height: number } } => Boolean(item.dimensions));
    if (!candidates.length) return undefined;
    return candidates.reduce((best, candidate) => {
        const distance = Math.abs(Math.log((candidate.dimensions.width / candidate.dimensions.height) / target));
        const bestDistance = Math.abs(Math.log((best.dimensions.width / best.dimensions.height) / target));
        if (distance < bestDistance) return candidate;
        if (distance === bestDistance && candidate.dimensions.width * candidate.dimensions.height > best.dimensions.width * best.dimensions.height) return candidate;
        return best;
    }).value;
}

function requestedTierShortSide(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "2k" || normalized === "medium") return 2048;
    if (normalized === "4k" || normalized === "high") return 4096;
    return 1024;
}

function resolveCapabilityAspectSize(capability: ResolvedImageModelCapability, quality: string, ratio: string) {
    const parsed = parseImageRatio(ratio);
    const step = capability.size.state === "supported" && capability.size.kind === "dimensions"
        ? capability.size.rules.multipleOf || 1
        : 1;
    const shortSide = Math.max(step, Math.round(requestedTierShortSide(quality) / step) * step);
    const landscape = parsed.width >= parsed.height;
    const longRatio = landscape ? parsed.width / parsed.height : parsed.height / parsed.width;
    const longSide = Math.max(step, Math.round((shortSide * longRatio) / step) * step);
    return `${landscape ? longSide : shortSide}x${landscape ? shortSide : longSide}`;
}

type PreparedImageSettings = {
    readonly size?: string;
    readonly width?: number;
    readonly height?: number;
    readonly aspectRatio?: string;
    readonly quality?: string;
    readonly outputFormat?: string;
};

function requestedImageOutputCount(value: string) {
    const raw = String(value || "").trim();
    return raw ? Number(raw) : 1;
}

type ImageRequestBasicSettings = {
    quality?: string;
    size?: string;
    count?: string;
};

/**
 * A Canvas node may intentionally pin one basic output field, but absence of
 * the other fields must continue to read the exact resolved route scope. The
 * old `true` marker is only a compatibility seam for direct, ephemeral callers
 * that supply all three values on the request config itself.
 */
function explicitImageRequestBasicSettings(config: AiConfig): ImageRequestBasicSettings {
    if (config.imageRequestBasicSettings === true) {
        return {
            quality: String(config.quality || ""),
            size: String(config.size || ""),
            count: String(config.count || ""),
        };
    }
    const value = config.imageRequestBasicSettings;
    if (!value || typeof value !== "object") return {};
    const settings: ImageRequestBasicSettings = {};
    const fromConfig = Array.isArray(value.fromConfig) ? new Set(value.fromConfig) : new Set<string>();
    if (fromConfig.has("quality")) settings.quality = String(config.quality || "");
    if (fromConfig.has("size")) settings.size = String(config.size || "");
    if (fromConfig.has("count")) settings.count = String(config.count || "");
    if (Object.prototype.hasOwnProperty.call(value, "quality") && typeof value.quality === "string") settings.quality = value.quality;
    if (Object.prototype.hasOwnProperty.call(value, "size") && typeof value.size === "string") settings.size = value.size;
    if (Object.prototype.hasOwnProperty.call(value, "count") && (typeof value.count === "string" || typeof value.count === "number")) settings.count = String(value.count);
    return settings;
}

function civitaiSizeField(capability: ResolvedImageModelCapability) {
    return String(capability.serialization.sizeField || "");
}

function civitaiSizeFieldIncludesAspectRatio(sizeField: string) {
    return sizeField === "size+ratio" || sizeField.includes("aspectRatio");
}

function civitaiDimensionDefault(size: Extract<ResolvedImageModelCapability["size"], { kind: "dimensions" }>) {
    const width = size.rules.defaultWidth;
    const height = size.rules.defaultHeight;
    if (Number.isInteger(width) && Number.isInteger(height) && Number(width) > 0 && Number(height) > 0) {
        return { width: width as number, height: height as number };
    }
    return undefined;
}

function civitaiEnumDefault(size: Extract<ResolvedImageModelCapability["size"], { kind: "enum" }>) {
    const value = size.default;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function civitaiTierRatioDefault(size: Extract<ResolvedImageModelCapability["size"], { kind: "tier-and-ratio" }>) {
    const defaultTier = typeof size.defaultTier === "string" ? size.defaultTier.trim() : "";
    const defaultRatio = typeof size.defaultRatio === "string" ? size.defaultRatio.trim() : "";
    return defaultTier || defaultRatio ? { defaultTier, defaultRatio } : undefined;
}

function civitaiSizeHasOfficialDefault(size: ResolvedImageModelCapability["size"]) {
    if (size.state !== "supported") return false;
    if (size.kind === "dimensions") return Boolean(civitaiDimensionDefault(size));
    if (size.kind === "enum") return Boolean(civitaiEnumDefault(size));
    return Boolean(civitaiTierRatioDefault(size));
}

function civitaiAutoIsUsable(size: ResolvedImageModelCapability["size"]) {
    if (size.state !== "supported") return false;
    if (size.kind === "enum") return size.allowAuto === true || civitaiSizeHasOfficialDefault(size);
    if (size.kind === "dimensions") return size.allowAuto === true || civitaiSizeHasOfficialDefault(size);
    return civitaiSizeHasOfficialDefault(size);
}

function matchPublishedSizeValue(values: readonly string[], raw: string) {
    const lower = raw.trim().toLowerCase();
    return values.find((value) => value.toLowerCase() === lower);
}

function civitaiEnumPrepared(value: string): Pick<PreparedImageSettings, "size"> {
    return { size: value };
}

function prepareCivitaiWorkflowSize(
    capability: ResolvedImageModelCapability,
    rawSize: string,
    quality: string,
): Pick<PreparedImageSettings, "size" | "width" | "height" | "aspectRatio"> {
    const lowerSize = rawSize.toLowerCase();
    const size = capability.size;
    const sizeField = civitaiSizeField(capability);
    const auto = lowerSize === "auto";
    const usable = Boolean(rawSize) && (!auto || civitaiAutoIsUsable(size));

    if (capability.requiresExplicitProfile && size.state === "unknown" && !usable) {
        throw new Error(`${capability.providerLabel} / ${capability.model}：合同未知或未验证；请显式配置 imageCapabilityProfiles 后再提交`);
    }
    if (size.state === "unsupported") return {};
    if (!usable) {
        if (size.state === "supported" && size.required === true && !civitaiSizeHasOfficialDefault(size)) {
            throw new Error(`${capability.providerLabel} / ${capability.model}：生成图片必须提供 size 尺寸，不能静默默认 1024x1024`);
        }
        if (size.state === "supported" && size.kind === "dimensions") return civitaiDimensionDefault(size) || {};
        if (size.state === "supported" && size.kind === "enum") {
            const published = civitaiEnumDefault(size);
            return published ? civitaiEnumPrepared(published) : {};
        }
        return {};
    }

    if (size.state !== "supported") {
        const dimensions = parseImageDimensions(rawSize);
        if (dimensions) return { width: dimensions.width, height: dimensions.height };
        if (auto) return {};
        return rawSize.includes(":") ? { aspectRatio: rawSize } : { size: rawSize };
    }

    if (auto) {
        if (size.kind === "dimensions") return civitaiDimensionDefault(size) || {};
        if (size.kind === "enum") {
            if (size.allowAuto) return civitaiEnumPrepared("auto");
            const published = civitaiEnumDefault(size);
            return published ? civitaiEnumPrepared(published) : {};
        }
        return {};
    }

    if (size.kind === "dimensions") {
        const parsed = parseImageDimensions(rawSize);
        if (parsed) return { width: parsed.width, height: parsed.height };
        if (rawSize.includes(":")) {
            const converted = resolveCapabilityAspectSize(capability, quality, rawSize);
            const dimensions = parseImageDimensions(converted);
            return dimensions ? { width: dimensions.width, height: dimensions.height } : { size: converted };
        }
        return { size: rawSize };
    }

    if (size.kind === "enum") {
        const matched = matchPublishedSizeValue(size.values, rawSize);
        if (matched) return civitaiEnumPrepared(matched);
        if (rawSize.includes(":")) {
            const closest = closestEnumImageSize(size.values, rawSize) || closestPublishedAspectRatio(size.values, parseImageRatio(rawSize).width, parseImageRatio(rawSize).height);
            if (closest) return civitaiEnumPrepared(closest);
        }
        const parsed = parseImageDimensions(rawSize);
        if (parsed) {
            const exact = matchPublishedSizeValue(size.values, `${parsed.width}x${parsed.height}`);
            if (exact) return civitaiEnumPrepared(exact);
            const imageSize = matchPublishedSizeValue(size.values, civitaiMappedImageSizeToken(parsed.width, parsed.height));
            if (imageSize) return civitaiEnumPrepared(imageSize);
            const closest = closestPublishedAspectRatio(size.values, parsed.width, parsed.height);
            if (matchPublishedSizeValue(size.values, closest)) return civitaiEnumPrepared(closest);
        }
        return civitaiEnumPrepared(rawSize);
    }

    const tier = matchPublishedSizeValue(size.tiers, rawSize);
    if (tier) return { size: tier };
    const ratio = matchPublishedSizeValue(size.ratios, rawSize);
    if (ratio) return { aspectRatio: ratio };
    const parsed = parseImageDimensions(rawSize);
    if (parsed) {
        if (sizeField === "size+aspectRatio") {
            return {
                size: matchPublishedSizeValue(size.tiers, civitaiMappedKrea2Size(parsed.width, parsed.height))
                    || civitaiMappedKrea2Size(parsed.width, parsed.height),
                aspectRatio: closestPublishedAspectRatio(size.ratios, parsed.width, parsed.height),
            };
        }
        if (sizeField === "aspectRatio+resolution") {
            return {
                size: matchPublishedSizeValue(size.tiers, civitaiMappedResolutionTier(parsed.width, parsed.height))
                    || civitaiMappedResolutionTier(parsed.width, parsed.height),
                aspectRatio: closestPublishedAspectRatio(size.ratios, parsed.width, parsed.height),
            };
        }
        if (sizeField === "aspectRatio") {
            return { aspectRatio: closestPublishedAspectRatio(size.ratios, parsed.width, parsed.height) };
        }
        return {
            width: parsed.width,
            height: parsed.height,
            ...(civitaiSizeFieldIncludesAspectRatio(sizeField)
                ? { aspectRatio: closestPublishedAspectRatio(size.ratios, parsed.width, parsed.height) }
                : {}),
        };
    }
    if (rawSize.includes(":")) return { aspectRatio: rawSize };
    return { size: rawSize };
}

function prepareImageSettings(capability: ResolvedImageModelCapability, config: AiConfig, requestedOutputFormat?: string): PreparedImageSettings {
    const rawSize = String(config.size || "").trim();
    const lowerSize = rawSize.toLowerCase();
    const quality = normalizeQuality(config.quality);
    const kind = capability.serialization.kind;

    if (kind === "openai-images-generate" || kind === "openai-images-edit" || kind === "openai-images-variation" || kind === "openai-responses-image-tool") {
        const size = capability.size.state !== "supported"
            ? undefined
            : capability.size.kind === "dimensions"
        ? !rawSize
                ? undefined
                : rawSize.includes(":")
                  ? resolveCapabilityAspectSize(capability, config.quality, rawSize)
                  : rawSize
            : rawSize && lowerSize !== "auto"
              ? rawSize.includes(":") && capability.size.kind === "enum"
                ? closestEnumImageSize(capability.size.values, rawSize) || rawSize
                : rawSize
              : capability.size.kind === "enum" && capability.size.allowAuto
                ? "auto"
                : undefined;
        const requestQuality = quality && capability.quality.state === "supported" && capability.quality.values.some((value) => value.toLowerCase() === quality)
            ? quality
            : undefined;
        const outputFormat = capability.serialization.outputFormatField ? requestedOutputFormat || "png" : undefined;
        return { ...(size ? { size } : {}), ...(requestQuality ? { quality: requestQuality } : {}), ...(outputFormat ? { outputFormat } : {}) };
    }

    if (kind === "agnes-images-generate") {
        if (capability.size.state === "supported" && capability.size.kind === "tier-and-ratio") {
            const dimensions = parseImageDimensions(rawSize);
            if (dimensions) return { size: `${dimensions.width}x${dimensions.height}` };
            // A bare size tier ("1K".."4K") selects the tier directly; the
            // quality field is only a fallback tier source for ratio-only input.
            const sizeTier = capability.size.tiers.find((value) => value.toLowerCase() === lowerSize);
            if (sizeTier) return { size: sizeTier };
            const ratio = agnesImageRatio(rawSize);
            if (ratio) return { size: agnesImageSizeTier(config.quality), aspectRatio: ratio };
            if (String(config.quality || "").trim()) {
                return { size: agnesImageSizeTier(config.quality), ...(agnesImageRatio(rawSize) ? { aspectRatio: agnesImageRatio(rawSize) } : {}) };
            }
            throw new Error(`${capability.providerLabel} / ${capability.model}：生成图片必须提供 size 档位（${capability.size.tiers.join("/")}）或宽高比加质量档位，不能静默默认 1K`);
        }
        if (parseImageDimensions(rawSize)) return { size: rawSize };
        if (rawSize.includes(":")) return { size: resolveCapabilityAspectSize(capability, config.quality, rawSize) };
        throw new Error(`${capability.providerLabel} / ${capability.model}：生成图片必须提供 size 尺寸（WIDTHxHEIGHT 或宽高比），不能静默默认 1024x1024`);
    }

    if (kind === "sensenova-images-generate") {
        const size = !rawSize || lowerSize === "auto" ? "" : rawSize.replace(/[×*]/g, "x");
        return size ? { size } : {};
    }

    if (kind === "sensenova-miaohua-image") {
        const size = !rawSize || lowerSize === "auto"
            ? undefined
            : parseImageDimensions(rawSize)
              ? rawSize
              : rawSize.includes(":")
                ? resolveCapabilityAspectSize(capability, config.quality, rawSize)
                : rawSize;
        const dimensions = size ? parseImageDimensions(size) : null;
        return {
            ...(dimensions ? { width: dimensions.width, height: dimensions.height } : size ? { size } : {}),
            outputFormat: requestedOutputFormat || "PNG",
        };
    }

    if (kind === "civitai-workflow") {
        return {
            ...prepareCivitaiWorkflowSize(capability, rawSize, config.quality),
            ...(requestedOutputFormat ? { outputFormat: requestedOutputFormat } : {}),
        };
    }

    if (capability.size.state !== "supported") return {};
    const size = !rawSize || lowerSize === "auto"
        ? undefined
        : parseImageDimensions(rawSize)
          ? rawSize
          : rawSize.includes(":")
            ? resolveCapabilityAspectSize(capability, config.quality, rawSize)
            : rawSize;
    return size ? { size } : {};
}

function assertScopedImageBasicSettings(
    scoped: { quality?: string; size?: string; count?: string },
    prepared: PreparedImageSettings,
    capability: ResolvedImageModelCapability,
    options: { readonly sequential?: boolean } = {},
) {
    const rawQuality = String(scoped.quality || "").trim();
    if (rawQuality) {
        const normalizedQuality = normalizeQuality(rawQuality);
        const qualityAccepted = capability.quality.state === "supported"
            && Boolean(normalizedQuality)
            && capability.quality.values.some((value) => value.toLowerCase() === normalizedQuality);
        const tierAccepted = capability.size.state === "supported"
            && capability.size.kind === "tier-and-ratio"
            && capability.size.tiers.some((value) => value.toLowerCase() === rawQuality.toLowerCase());
        if (!qualityAccepted && !tierAccepted && capability.quality.state !== "unsupported") {
            throw new Error(`${capability.providerLabel} / ${capability.model} 不接受已保存的质量/规格“${rawQuality}”；请选择当前模型提供的有效值`);
        }
    }
    const rawSize = String(scoped.size || "").trim();
    if (rawSize && !isKnownScopedImageSizeInput(rawSize, capability) && capability.size.state !== "unsupported") {
        throw new Error(`${capability.providerLabel} / ${capability.model} 不接受已保存的尺寸“${rawSize}”；请选择当前模型提供的有效值`);
    }
    validateScopedImageGenerationSettings(
        {
            ...(prepared.quality ? { quality: prepared.quality } : {}),
            ...(prepared.size
                ? { size: prepared.size }
                : prepared.width && prepared.height
                  ? { size: `${prepared.width}x${prepared.height}` }
                  : {}),
            ...(scoped.count ? { count: options.sequential ? "1" : scoped.count } : {}),
        },
        capability,
    );
}

function isKnownScopedImageSizeInput(value: string, capability: ResolvedImageModelCapability) {
    const normalized = value.trim().toLowerCase();
    if (parseImageDimensions(value)) return true;
    if (/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/u.test(normalized)) {
        try {
            parseImageRatio(normalized);
            return true;
        } catch {
            return false;
        }
    }
    if (capability.size.state !== "supported") return false;
    if (capability.size.kind === "enum") {
        return (capability.size.allowAuto && normalized === "auto")
            || capability.size.values.some((candidate) => candidate.toLowerCase() === normalized);
    }
    if (capability.size.kind === "tier-and-ratio") {
        return capability.size.tiers.some((candidate) => candidate.toLowerCase() === normalized)
            || capability.size.ratios.some((candidate) => candidate.toLowerCase() === normalized);
    }
    return capability.size.allowAuto === true && normalized === "auto";
}

function imageValidationInput(
    operation: ImageRequestOperation,
    outputCount: number,
    referenceCount: number,
    hasMask: boolean,
    settings: PreparedImageSettings,
    advanced: ImageAdvancedOptions,
    prompt?: string,
): ImageRequestValidationInput {
    return {
        operation,
        prompt,
        outputCount,
        referenceCount,
        hasMask,
        ...settings,
        ...advanced,
    };
}

function resolveImageAdvancedOptions(
    config: AiConfig,
    route: ApiRequestRoute,
    capability: ResolvedImageModelCapability,
    operation: ImageRequestOperation,
    explicit: ImageAdvancedOptions,
): ImageAdvancedOptions {
    const scopedSettings = route.mode === "local"
        ? readImageAdvancedSettings(config.imageAdvancedSettingsByScope, {
                  providerId: route.provider.id,
                  model: route.model,
                  operation,
              })
        : {};
    const stored = route.mode === "local"
        ? {
            ...imageAdvancedSettingsToRequest(
              scopedSettings,
              capability.advancedFields,
              { model: route.model },
            ),
            ...(capability.outputFormat.state === "supported"
                && capability.outputFormat.requestable !== false
                && scopedSettings.outputFormat?.trim()
                ? { outputFormat: scopedSettings.outputFormat.trim() }
                : {}),
          }
        : {};
    const operationSpecificStored: ImageAdvancedOptions = route.mode === "local"
        ? {
            ...(scopedSettings.checkpointAir ? { checkpointAir: scopedSettings.checkpointAir } : {}),
            ...(scopedSettings.strength !== undefined ? { strength: scopedSettings.strength } : {}),
            ...(scopedSettings.vaeAir ? { vaeAir: scopedSettings.vaeAir } : {}),
            ...(scopedSettings.embeddings?.length ? { embeddings: scopedSettings.embeddings } : {}),
            ...(scopedSettings.uCache ? { uCache: scopedSettings.uCache } : {}),
            ...(scopedSettings.background ? { background: scopedSettings.background } : {}),
            ...(scopedSettings.inputFidelity ? { inputFidelity: scopedSettings.inputFidelity } : {}),
            ...(scopedSettings.moderation ? { moderation: scopedSettings.moderation } : {}),
            ...(scopedSettings.outputCompression !== undefined ? { outputCompression: scopedSettings.outputCompression } : {}),
            ...(scopedSettings.partialImages !== undefined ? { partialImages: scopedSettings.partialImages } : {}),
            ...(scopedSettings.responseFormat ? { responseFormat: scopedSettings.responseFormat } : {}),
          }
        : {};
    const merged: ImageAdvancedOptions = { ...stored, ...operationSpecificStored };
    for (const field of ["outputFormat", "negativePrompt", "seed", "steps", "cfgScale", "sampler", "scheduler", "sequential", "loras", "checkpointAir", "strength", "vaeAir", "embeddings", "uCache", "background", "inputFidelity", "moderation", "outputCompression", "partialImages", "responseFormat"] as const) {
        if (explicit[field] !== undefined) Object.assign(merged, { [field]: explicit[field] });
    }
    if (explicit.onNativeTaskSubmitted) merged.onNativeTaskSubmitted = explicit.onNativeTaskSubmitted;
    return merged;
}

function requireValidImageRequest(
    capability: ResolvedImageModelCapability,
    request: ImageRequestValidationInput,
): ImageOutputRequestPlan {
    const validation = validateImageModelRequest(capability, request);
    const plan = planImageOutputRequests(capability, Number(request.outputCount ?? 1), { sequential: request.sequential });
    if (!validation.ok || !plan.ok) {
        const messages = [...validation.errors, ...plan.errors].map((issue) => issue.message);
        throw new Error([...new Set(messages)].join("；"));
    }
    return plan;
}

async function executeImageOutputPlan(
    plan: ImageOutputRequestPlan,
    requestBatch: (providerOutputCount: number) => Promise<GeneratedImageResult[]>,
    options: { readonly outputCountIsMaximum?: boolean } = {},
) {
    const images: GeneratedImageResult[] = [];
    for (const batch of plan.batches) {
        for (let index = 0; index < batch.repeat; index += 1) {
            const batchImages = await requestBatch(batch.providerOutputCount);
            if (!options.outputCountIsMaximum && batchImages.length !== batch.providerOutputCount) {
                throw new Error(`图片 provider 应返回 ${batch.providerOutputCount} 张，实际返回 ${batchImages.length} 张；不会静默丢弃或补齐`);
            }
            if (options.outputCountIsMaximum && batchImages.length < 1) {
                throw new Error("连续组图 provider 没有返回任何图片");
            }
            images.push(...batchImages);
        }
    }
    if (!options.outputCountIsMaximum && images.length !== plan.expectedOutputCount) {
        throw new Error(`图片请求计划应返回 ${plan.expectedOutputCount} 张，实际返回 ${images.length} 张；不会只取 images[0]`);
    }
    return images;
}

function resolveImageResult(item: Record<string, unknown>, outputFormat?: string): GeneratedImageResult | null {
    const b64Json = typeof item.b64_json === "string" ? item.b64_json.trim() : "";
    const backendUrl = typeof item.url === "string" ? item.url.trim() : "";
    const responseMime = [item.mime_type, item.mimeType, item.content_type, item.contentType]
        .find((value): value is string => typeof value === "string" && /^image\/[a-z0-9.+-]+$/i.test(value.trim()))
        ?.trim()
        .toLowerCase();
    const requestedMime = imageMimeTypeForOutputFormat(outputFormat);
    const dataUrl = b64Json ? base64ImageDataUrl(b64Json, responseMime || requestedMime) : backendUrl;
    if (!dataUrl) return null;
    return {
        id: nanoid(),
        dataUrl,
        backendUrl: backendUrl || undefined,
        backendRel: extractBackendImageRel(backendUrl),
        revisedPrompt: typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
    };
}

function parseImagePayload(payload: ImageApiResponse, outputFormat?: string) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(
            detectTextApiResponseError(payload, { operation: "图片生成失败" }) ||
            "图片生成失败：上游返回错误，请检查请求配置后重试",
        );
    }
    if (payload.error) {
        throw new Error(
            detectTextApiResponseError(payload, { operation: "图片生成失败" }) ||
            "图片生成失败：上游返回错误，请检查请求配置后重试",
        );
    }
    const images =
        payload.data
            ?.map((item) => resolveImageResult(item, outputFormat))
            .filter((value): value is GeneratedImageResult => Boolean(value)) || [];

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function imageMimeTypeForOutputFormat(outputFormat?: string) {
    const value = String(outputFormat || "").trim().toLowerCase();
    if (value === "jpg" || value === "jpeg") return "image/jpeg";
    if (value === "webp") return "image/webp";
    if (value === "gif") return "image/gif";
    if (value === "avif") return "image/avif";
    if (value === "png") return "image/png";
    return undefined;
}

function extractBackendImageRel(url: string) {
    if (!url) return undefined;
    const marker = "/images/";
    const index = url.indexOf(marker);
    if (index < 0) return undefined;
    return decodeURIComponent(url.slice(index + marker.length).split("?", 1)[0].split("#", 1)[0]).replace(/^\/+/, "") || undefined;
}

function readErrorPayload(value: unknown): ImageApiError {
    if (typeof value === "string") return { message: value };
    if (!value || typeof value !== "object") return {};
    const item = value as { error?: unknown; message?: unknown; detail?: unknown; msg?: unknown; code?: unknown; type?: unknown; param?: unknown };
    if (typeof item.msg === "string") return { message: item.msg };
    if (typeof item.message === "string") {
        return {
            message: item.message,
            code: typeof item.code === "string" ? item.code : null,
            type: typeof item.type === "string" ? item.type : undefined,
            param: typeof item.param === "string" ? item.param : null,
        };
    }
    const nestedError = readErrorPayload(item.error);
    if (nestedError.message || nestedError.code) return nestedError;
    return readErrorPayload(item.detail);
}

function formatImageApiError(error: ImageApiError, fallback: string) {
    const message = String(error.message || "").trim();
    if (error.code === "maintenance_retry_later") {
        return "系统维护中，请10分钟后再试";
    }
    if (/no available image quota/i.test(message) || error.code === "insufficient_quota") {
        return message || fallback;
    }
    if (/token(_| )?invalidated|authentication token has been invalidated|invalidated oauth token|account token is invalid/i.test(message)) {
        return "上游生图账号已失效，系统已尝试剔除异常账号；请刷新账号池或补充可用账号后重试";
    }
    if (error.code === "image_generation_no_result") {
        return "提示词过于模糊，上游没有直接出图，请补充主体、场景或风格后重试";
    }
    return fallback;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ detail?: unknown; error?: unknown; message?: string; msg?: string; code?: number }>(error)) {
        if (error.code === "ECONNABORTED") return `${fallback}：请求超时，请检查后端号池、上游接口或稍后重试`;
        if (!error.response) return describeTextTransportError(error, fallback);
        const responseData = error.response?.data;
        const responseError = detectTextApiResponseError(responseData, {
            status: error.response?.status,
            contentType: String(error.response?.headers?.["content-type"] || ""),
            operation: fallback,
        });
        if (responseError) return responseError;
        const errorPayload = readErrorPayload(responseData);
        const message = formatImageApiError(errorPayload, "");
        if (message) return message;
        const topLevelError = detectTextApiResponseError({ error: responseData }, {
            status: error.response?.status,
            contentType: String(error.response?.headers?.["content-type"] || ""),
            operation: fallback,
        });
        if (topLevelError) return topLevelError;
        return readStatusError(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    if (status && status >= 500) return `${fallback}：后端或上游服务异常 (${status})，请稍后重试或查看后端日志`;
    return status ? `${fallback}：${status}` : fallback;
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readTextContent(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === "string") return item;
                if (!item || typeof item !== "object") return "";
                const record = item as Record<string, unknown>;
                return typeof record.text === "string" ? record.text : "";
            })
            .join("");
    }
    return "";
}

function extractChatText(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const payload = value as Record<string, unknown>;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
    const delta = firstChoice.delta && typeof firstChoice.delta === "object" ? (firstChoice.delta as Record<string, unknown>) : {};
    const message = firstChoice.message && typeof firstChoice.message === "object" ? (firstChoice.message as Record<string, unknown>) : {};
    const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
    const directCandidates = [delta.content, message.content, payload.delta, payload.text, payload.content, payload.output_text, data.text, data.content];

    for (const candidate of directCandidates) {
        const text = readTextContent(candidate);
        if (text.trim()) return text;
    }
    return "";
}

type ChatCompletionState = {
    finishReason?: string;
    hasReasoningContent: boolean;
};

function observeChatCompletionPayload(value: unknown, state?: ChatCompletionState) {
    if (!state || !value || typeof value !== "object") return;
    const payload = value as Record<string, unknown>;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
    const delta = firstChoice.delta && typeof firstChoice.delta === "object" ? (firstChoice.delta as Record<string, unknown>) : {};
    const message = firstChoice.message && typeof firstChoice.message === "object" ? (firstChoice.message as Record<string, unknown>) : {};
    if (typeof firstChoice.finish_reason === "string") state.finishReason = firstChoice.finish_reason;
    if (readTextContent(delta.reasoning_content) || readTextContent(message.reasoning_content)) {
        state.hasReasoningContent = true;
    }
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void, state?: ChatCompletionState) {
    let deltaText = "";
    // SSE permits either LF or CRLF line endings. Normalize both forms so
    // strict HTTP relays do not leave the response buffered and unread.
    for (const eventBlock of chunk.split(/\r?\n\r?\n/)) {
        const dataLines = eventBlock
            .split(/\r?\n/)
            .map((line) => line.match(/^data:\s?(.*)$/)?.[1])
            .filter((line): line is string => Boolean(line));
        for (const data of dataLines) {
            if (!data || data === "[DONE]") continue;
            try {
                const payload = JSON.parse(data) as unknown;
                observeChatCompletionPayload(payload, state);
                deltaText += extractChatText(payload);
            } catch {
                // Ignore malformed stream fragments; the final response handling still surfaces API errors.
            }
        }
    }
    if (deltaText) onDelta(deltaText);
}

function parseTextResponsePayload(value: unknown, state?: ChatCompletionState) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        const sseStart = trimmed.search(/(?:^|\r?\n)data:/);
        if (sseStart >= 0) {
            let streamed = "";
            parseStreamChunk(trimmed.slice(sseStart).trimStart(), (delta) => {
                streamed += delta;
            }, state);
            return streamed;
        }
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            observeChatCompletionPayload(parsed, state);
            return extractChatText(parsed) || trimmed;
        } catch {
            return trimmed;
        }
    }
    observeChatCompletionPayload(value, state);
    return extractChatText(value);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(route: ApiRequestRoute, path: string) {
    if (route.mode === "local" || route.mode === "localPool") return routedLocalApiUrl(route, path);
    return `/v1${path}`;
}

async function aiHeaders(config: AiConfig, route: ApiRequestRoute, contentType?: string) {
    if (route.mode === "local" || route.mode === "localPool") return routedLocalHeaders(route, contentType);
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function resolveImageRequestCapability(
    config: AiConfig,
    operation: ImageRequestOperation,
    boardRouteKey?: ApiBoardRouteKey,
): Promise<ResolvedImageRequestCapability> {
    // apiRouting / board routing is authoritative. The capability-specific
    // imageModel remains a legacy fallback inside resolveApiRequestRoute, while
    // the old global text model must never become an explicit image override.
    const route = resolveApiRequestRoute(config, "image", explicitMediaRequestModel(config, "image"), boardRouteKey);
    const civitaiCredential = route.mode === "local" && isCivitaiRoute(route)
        ? selectRelayCredential(route.provider)
        : undefined;
    const service = route.mode === "local" && isCivitaiRoute(route)
        ? await resolveCivitaiRouteService(
            route,
            route.model,
            civitaiCredential?.apiKey,
            civitaiCredential?.credentialId,
        )
        : undefined;
    const provider = route.mode === "local"
        ? { ...route.provider, displayName: providerDisplayName(route.provider, config.apiRelays || []) }
        : undefined;
    const capability = resolveImageModelCapability({
        model: route.model,
        operation,
        provider,
        service,
    });
    return {
        route,
        service,
        capability,
        ...(civitaiCredential?.apiKey ? { civitaiApiKey: civitaiCredential.apiKey } : {}),
        ...(civitaiCredential?.credentialId ? { civitaiCredentialId: civitaiCredential.credentialId } : {}),
    };
}

/**
 * Authoritative, side-effect-free request preflight. It may resolve the
 * read-only Civitai service catalogue, but never submits or creates paid work.
 */
export async function preflightImageRequest(
    config: AiConfig,
    operation: ImageRequestOperation,
    prompt: string,
    references: readonly ReferenceImage[] = [],
    mask?: ReferenceImage,
    boardRouteKey?: ApiBoardRouteKey,
    options: ImageRequestPreflightOptions = {},
): Promise<ImageRequestPreflight> {
    const resolved = await resolveImageRequestCapability(config, operation, boardRouteKey);
    const scope = {
        providerId: resolved.route.mode === "local" ? resolved.route.provider.id : resolved.route.mode,
        model: resolved.route.model,
        operation,
    };
    const scoped = readScopedImageGenerationSettings(config.imageAdvancedSettingsByScope, scope);
    const basic = {
        ...scoped,
        ...explicitImageRequestBasicSettings(config),
    };
    const outputCount = requestedImageOutputCount(basic.count || "");
    const advanced = resolveImageAdvancedOptions(config, resolved.route, resolved.capability, operation, options);
    const settings = prepareImageSettings(
        resolved.capability,
        {
            ...config,
            quality: basic.quality || "",
            size: basic.size || "",
        },
        advanced.outputFormat,
    );
    const labelledPrompt = operation === "edit" && options.useReferenceLabels !== false
        ? buildImageReferencePromptText(prompt, references as ReferenceImage[])
        : prompt;
    const wirePrompt = operation === "generate" || operation === "edit" ? withSystemPrompt(config, labelledPrompt) : labelledPrompt;
    const plan = requireValidImageRequest(
        resolved.capability,
        imageValidationInput(operation, outputCount, references.length, Boolean(mask), settings, advanced, wirePrompt),
    );
    assertScopedImageBasicSettings(basic, settings, resolved.capability, { sequential: advanced.sequential === true });
    if (resolved.capability.serialization.kind === "openai-images-variation") {
        if (references.length !== 1) throw new Error(`DALL-E 2 variation 必须且只能提交 1 张源图；当前为 ${references.length} 张`);
        const hydrated = { ...references[0], dataUrl: await imageToDataUrl(references[0]) };
        assertLegacyVariationPng(dataUrlToFile(hydrated), hydrated.dataUrl);
    }
    return { ...resolved, operation, prompt: wirePrompt, settings, advanced, plan };
}

function assertHydratedImageTransportReferences(
    references: readonly ReferenceImage[],
    mask?: ReferenceImage,
) {
    const media = [
        ...references.map((image, index) => ({ image, label: `参考图 ${index + 1}` })),
        ...(mask ? [{ image: mask, label: "蒙版" }] : []),
    ];
    for (const { image, label } of media) {
        const value = String(image.dataUrl || "").trim();
        if (!isLikelyImageDataUrl(value) || getDataUrlByteSize(value) <= 0) {
            throw new Error(`${label}内容为空或无法用于图片传输；已停止提交，未发送 HTTP 请求`);
        }
    }
}

export async function requestGeneration(
    config: AiConfig,
    prompt: string,
    boardRouteKey?: ApiBoardRouteKey,
    options: ImageGenerationOptions = {},
) {
    const references = options.references || [];
    const { route, service, capability, advanced, settings, prompt: requestPrompt, plan, civitaiApiKey, civitaiCredentialId } = await preflightImageRequest(config, "generate", prompt, references, undefined, boardRouteKey, options);
    const hydratedReferences = await Promise.all(references.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) })));
    assertHydratedImageTransportReferences(hydratedReferences);
    const images = await executeImageOutputPlan(plan, (providerOutputCount) => requestImageBatch({
        config,
        route,
        capability,
        service,
        prompt: requestPrompt,
        settings,
        advanced,
        references: hydratedReferences,
        providerOutputCount,
        civitaiApiKey,
        civitaiCredentialId,
    }), { outputCountIsMaximum: advanced.sequential === true });
    refreshRemoteUser(config);
    return images;
}

export async function requestEdit(
    config: AiConfig,
    prompt: string,
    references: ReferenceImage[],
    mask?: ReferenceImage,
    boardRouteKey?: ApiBoardRouteKey,
    options: ImageEditOptions = {},
) {
    const explicitAdvanced: ImageAdvancedOptions = {
        outputFormat: options.outputFormat,
        negativePrompt: options.negativePrompt,
        seed: options.seed,
        steps: options.steps,
        cfgScale: options.cfgScale,
        sampler: options.sampler,
        scheduler: options.scheduler,
        sequential: options.sequential,
        loras: options.loras,
        onNativeTaskSubmitted: options.onNativeTaskSubmitted,
    };
    const { route, service, capability, advanced, settings, prompt: wirePrompt, plan, civitaiApiKey, civitaiCredentialId } = await preflightImageRequest(
        config, "edit", prompt, references, mask, boardRouteKey, { ...explicitAdvanced, useReferenceLabels: options.useReferenceLabels },
    );
    const hydratedReferences = await Promise.all(references.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) })));
    const hydratedMask = mask ? { ...mask, dataUrl: await imageToDataUrl(mask) } : undefined;
    assertHydratedImageTransportReferences(hydratedReferences, hydratedMask);
    const images = await executeImageOutputPlan(plan, (providerOutputCount) => requestImageBatch({
        config,
        route,
        capability,
        service,
        prompt: wirePrompt,
        settings,
        advanced,
        references: hydratedReferences,
        mask: hydratedMask,
        providerOutputCount,
        civitaiApiKey,
        civitaiCredentialId,
    }), { outputCountIsMaximum: advanced.sequential === true });
    refreshRemoteUser(config);
    return images;
}

/** Execute an exact variation operation. It never falls back to image edit. */
export async function requestVariation(
    config: AiConfig,
    source: ReferenceImage,
    boardRouteKey?: ApiBoardRouteKey,
    options: ImageVariationOptions = {},
) {
    const prompt = options.prompt || "";
    const { route, service, capability, advanced, settings, plan, civitaiApiKey, civitaiCredentialId } = await preflightImageRequest(config, "variation", prompt, [source], undefined, boardRouteKey, options);
    const sourceData = capability.serialization.kind === "civitai-workflow"
        ? String(source.dataUrl || source.url || "").trim()
        : await imageToDataUrl(source);
    const hydratedSource = { ...source, dataUrl: sourceData };
    if (capability.serialization.kind !== "civitai-workflow") {
        assertHydratedImageTransportReferences([hydratedSource]);
    }
    const images = await executeImageOutputPlan(plan, (providerOutputCount) => requestImageBatch({
        config,
        route,
        capability,
        service,
        prompt,
        settings,
        advanced,
        references: [hydratedSource],
        providerOutputCount,
        civitaiApiKey,
        civitaiCredentialId,
    }));
    refreshRemoteUser(config);
    return images;
}

/** Execute the Responses API image_generation tool. It requires an explicit capability profile. */
export async function requestResponsesImage(
    config: AiConfig,
    prompt: string,
    references: ReferenceImage[] = [],
    mask?: ReferenceImage,
    boardRouteKey?: ApiBoardRouteKey,
    options: ImageResponsesToolOptions = {},
) {
    const { route, service, capability, advanced, settings, plan, civitaiApiKey, civitaiCredentialId } = await preflightImageRequest(config, "responses-tool", prompt, references, mask, boardRouteKey, options);
    const hydratedReferences = await Promise.all(references.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) })));
    const hydratedMask = mask ? { ...mask, dataUrl: await imageToDataUrl(mask) } : undefined;
    assertHydratedImageTransportReferences(hydratedReferences, hydratedMask);
    const images = await executeImageOutputPlan(plan, (providerOutputCount) => requestImageBatch({
        config,
        route,
        capability,
        service,
        prompt,
        settings,
        advanced,
        references: hydratedReferences,
        mask: hydratedMask,
        providerOutputCount,
        civitaiApiKey,
        civitaiCredentialId,
    }), { outputCountIsMaximum: true });
    refreshRemoteUser(config);
    return images;
}

/** Resume one persisted native task by exact provider revision and credential slot. Never creates work. */
export async function resumeNativeImageTask(config: AiConfig, snapshot: CanvasImageTaskSnapshot): Promise<GeneratedImageResult[]> {
    if (snapshot.provider === "platform") throw new Error("平台图片任务必须使用平台任务查询接口恢复");
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const provider = normalized.apiRelays.find((item) => item.id === snapshot.providerId);
    if (!provider) throw new Error("图片任务原 provider 已不存在，已停止恢复且不会切换 provider");
    const route: Extract<ApiRequestRoute, { mode: "local" }> = {
        mode: "local",
        capability: "image",
        model: snapshot.model,
        provider,
        timeoutMs: resolveApiRelayTimeoutMs(provider, normalized.apiRelayAdvanced.defaultTimeoutMs || IMAGE_REQUEST_TIMEOUT_MS),
    };
    const restored = restoreNativeImageTaskCredential(snapshot, route);
    if (restored.status !== "ready") {
        const reasons: Record<Exclude<typeof restored.status, "ready">, string> = {
            "provider-missing": "图片任务原 provider 已不存在",
            "provider-revision-mismatch": "图片任务原 provider 配置版本已变化",
            "adapter-mismatch": "图片任务原 provider 协议适配器已变化",
            "model-mismatch": "图片任务原模型路由已变化",
            "credential-missing": "图片任务原凭据槽已不存在",
        };
        throw new Error(`${reasons[restored.status]}，已停止恢复且不会切换 provider、凭据或重新提交`);
    }
    let urls: string[];
    if (snapshot.provider === "dashscope") {
        urls = await waitForDashscopeImageTask(route, {
            taskId: snapshot.taskId,
            credentialId: restored.credentialId,
            startedAt: snapshot.startedAt,
            expectedOutputs: snapshot.expectedOutputs,
        });
    } else if (snapshot.provider === "miaohua") {
        urls = await waitForMiaohuaImageTask(route, {
            taskId: snapshot.taskId,
            credentialId: restored.credentialId,
            startedAt: snapshot.startedAt,
            expectedOutputs: snapshot.expectedOutputs,
        });
    } else {
        const state = await waitCivitaiWorkflow(route, {
            workflowId: snapshot.taskId,
            taskId: snapshot.taskId,
            credentialId: restored.credentialId,
            startedAt: snapshot.startedAt,
        });
        if (state.status === "failed") throw new NativeImageTaskTerminalError(state.error);
        if (state.status === "pending") throw new Error("Civitai 图片任务仍在等待中");
        urls = state.blobs.map((blob) => blob.url);
    }
    if (snapshot.resultPolicy === "exact-count" && urls.length !== snapshot.expectedOutputs) {
        throw new Error(`恢复的图片任务应返回 ${snapshot.expectedOutputs} 张，实际返回 ${urls.length} 张`);
    }
    if (!urls.length) throw new Error("恢复的图片任务没有返回图片");
    return parseImagePayload({ data: urls.map((url) => ({ url })) });
}

type ImageBatchContext = {
    readonly config: AiConfig;
    readonly route: ApiRequestRoute;
    readonly capability: ResolvedImageModelCapability;
    readonly service?: CivitaiGenerationService;
    readonly prompt: string;
    readonly settings: PreparedImageSettings;
    readonly advanced: ImageAdvancedOptions;
    readonly references: readonly ReferenceImage[];
    readonly mask?: ReferenceImage;
    readonly providerOutputCount: number;
    readonly onNativeTaskSubmitted?: NativeImageTaskSubmissionObserver;
    readonly civitaiApiKey?: string;
    readonly civitaiCredentialId?: string;
};

async function requestImageBatch(context: ImageBatchContext): Promise<GeneratedImageResult[]> {
    const providerId = context.route.mode === "local" ? context.route.provider.id : "";
    const studioModel = STUDIO_PROVIDERS.some((item) => item.imageModels.includes(context.route.model));
    if (context.capability.serialization.kind !== "civitai-workflow" && (providerId.startsWith("preset-") || studioModel)) {
        const result = await generateStudioImage({
            relays: context.config.apiRelays,
            prompt: context.prompt,
            providerId: providerId || undefined,
            model: context.route.model,
            size: context.settings.size,
            aspectRatio: context.settings.aspectRatio,
            width: context.settings.width,
            height: context.settings.height,
            quality: context.settings.quality,
            operation: context.capability.operation === "edit" ? "edit" : "generate",
            imageUrl: context.references[0]?.dataUrl || context.references[0]?.url,
            imageUrls: context.references
                .map((item) => item.dataUrl || item.url)
                .filter((item): item is string => Boolean(item)),
            n: context.providerOutputCount,
            loras: context.advanced.loras,
            negativePrompt: context.advanced.negativePrompt,
            seed: typeof context.advanced.seed === "number" ? context.advanced.seed : undefined,
            workTitle: `画布 · ${context.prompt.slice(0, 32)}`,
        });
        return parseImagePayload({ data: (result.urls.length ? result.urls : [result.url]).map((url) => ({ url })) });
    }
    const { capability } = context;
    let images: GeneratedImageResult[];
    switch (capability.serialization.kind) {
        case "openai-images-generate":
            images = await requestOpenAIGenerationBatch(context);
            break;
        case "openai-images-edit":
            images = await requestOpenAIEditBatch(context);
            break;
        case "openai-images-variation":
            images = await requestOpenAIVariationBatch(context);
            break;
        case "openai-responses-image-tool":
            images = await requestOpenAIResponsesImageBatch(context);
            break;
        case "openai-chat-image-message":
            images = await requestOpenAIChatImageBatch(context);
            break;
        case "xai-imagine-edit":
            images = await requestXaiImagineEditBatch(context);
            break;
        case "agnes-images-generate":
            images = await requestAgnesImageBatch(context);
            break;
        case "dashscope-multimodal-image":
            images = await requestDashscopeImageBatch(context);
            break;
        case "ark-images-generate":
            images = await requestArkImageBatch(context);
            break;
        case "sensenova-images-generate":
            images = await requestSenseNovaImageBatch(context);
            break;
        case "sensenova-miaohua-image":
            images = await requestMiaohuaImageBatch(context);
            break;
        case "civitai-workflow":
            images = await requestCivitaiImageBatch(context);
            break;
        default:
            throw new Error("未知自定义图片 Endpoint 没有已验证的 wire contract；请显式配置 imageCapabilityProfiles");
    }
    if (typeof window !== "undefined" && images.length) {
        const { recordGeneratedWork } = await import("@/studio/history");
        const saved = await recordGeneratedWork({
            kind: "image",
            title: `画布 · ${context.prompt.slice(0, 32)}`,
            prompt: context.prompt,
            model: context.route.model,
            providerId: context.route.mode === "local" ? context.route.provider.id : context.route.mode,
            urls: images.map((item) => item.backendUrl || item.dataUrl).filter(Boolean),
        });
        if (saved?.persistError) {
            throw new Error(`作品库保存失败：${saved.persistError}`);
        }
    }
    return images;
}

async function requestOpenAIGenerationBatch(context: ImageBatchContext) {
    const payload = {
        model: context.route.model,
        prompt: context.prompt,
        n: context.providerOutputCount,
        ...(context.settings.quality ? { quality: context.settings.quality } : {}),
        ...(context.settings.size ? { size: context.settings.size } : {}),
        ...(context.settings.outputFormat ? { output_format: context.settings.outputFormat } : {}),
        ...(context.capability.serialization.responseEncodingField ? { response_format: "b64_json" } : {}),
    };
    return postImageJson(context, imageSerializerPath(context.capability), payload, "图片生成失败（OpenAI Images）");
}

async function requestOpenAIEditBatch(context: ImageBatchContext) {
    const formData = new FormData();
    formData.set("model", context.route.model);
    formData.set("prompt", context.prompt);
    formData.set("n", String(context.providerOutputCount));
    if (context.settings.quality) formData.set("quality", context.settings.quality);
    if (context.settings.size) formData.set("size", context.settings.size);
    if (context.settings.outputFormat) formData.set("output_format", context.settings.outputFormat);
    if (context.capability.serialization.responseEncodingField) formData.set("response_format", "b64_json");
    context.references.map((image) => dataUrlToFile(image)).forEach((file) => formData.append("image[]", file, file.name));
    if (context.mask) {
        const mask = dataUrlToFile(context.mask);
        formData.set("mask", mask, mask.name);
    }
    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(context.route, imageSerializerPath(context.capability)), formData, {
            headers: await aiHeaders(context.config, context.route),
            timeout: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
        });
        return parseImagePayload(response.data, context.settings.outputFormat);
    } catch (error) {
        throw new Error(readAxiosError(error, "图片编辑失败（OpenAI Images）"));
    }
}

async function requestOpenAIVariationBatch(context: ImageBatchContext) {
    if (context.references.length !== 1) throw new Error(`DALL-E 2 variation 必须且只能提交 1 张源图；当前为 ${context.references.length} 张`);
    if (context.prompt.trim()) throw new Error("DALL-E 2 variation 不接受 prompt");
    const source = dataUrlToFile(context.references[0]);
    assertLegacyVariationPng(source, context.references[0].dataUrl);
    const formData = new FormData();
    formData.set("image", source, source.name || "variation.png");
    formData.set("model", context.route.model);
    formData.set("n", String(context.providerOutputCount));
    if (context.settings.size) formData.set("size", context.settings.size);
    formData.set("response_format", context.advanced.responseFormat || "b64_json");
    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(context.route, imageSerializerPath(context.capability)), formData, {
            headers: await aiHeaders(context.config, context.route),
            timeout: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
        });
        return parseImagePayload(response.data, context.settings.outputFormat);
    } catch (error) {
        throw new Error(readAxiosError(error, "图片变体失败（DALL-E 2 legacy variation）"));
    }
}

function assertLegacyVariationPng(file: File, dataUrl: string) {
    if (file.type.toLowerCase() !== "image/png") throw new Error("DALL-E 2 variation 源图必须是 PNG");
    if (file.size >= 4 * 1024 * 1024) throw new Error("DALL-E 2 variation 源图必须小于 4MB");
    const encoded = dataUrl.match(/^data:image\/png;base64,(.+)$/i)?.[1] || "";
    let bytes: Uint8Array;
    try {
        const binary = atob(encoded);
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
        throw new Error("DALL-E 2 variation 源图不是有效 PNG DataURL");
    }
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
        throw new Error("DALL-E 2 variation 源图不是有效 PNG");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || width !== height) throw new Error(`DALL-E 2 variation 源图必须是正方形 PNG；当前为 ${width}x${height}`);
}

async function requestOpenAIResponsesImageBatch(context: ImageBatchContext) {
    if (!context.capability.profileConfigured) throw new Error("Responses image_generation tool 必须显式配置 imageCapabilityProfiles");
    const tool = buildResponsesImageGenerationTool(context);
    const content = [
        { type: "input_text", text: context.prompt },
        ...context.references.map((image) => ({ type: "input_image", image_url: image.dataUrl })),
    ];
    const payload = {
        model: context.route.model,
        input: [{ role: "user", content }],
        tools: [tool],
    };
    try {
        const response = await axios.post<unknown>(aiApiUrl(context.route, imageSerializerPath(context.capability)), payload, {
            headers: await aiHeaders(context.config, context.route, "application/json"),
            timeout: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
        });
        return parseResponsesImagePayload(response.data, context.settings.outputFormat || "png");
    } catch (error) {
        throw new Error(readAxiosError(error, "图片生成失败（Responses image_generation tool）"));
    }
}

function buildResponsesImageGenerationTool(context: ImageBatchContext) {
    const { advanced, settings } = context;
    assertResponsesEnum("background", advanced.background, ["auto", "opaque", "transparent"]);
    assertResponsesEnum("input_fidelity", advanced.inputFidelity, ["low", "high"]);
    assertResponsesEnum("moderation", advanced.moderation, ["auto", "low"]);
    if (advanced.outputCompression !== undefined && (!Number.isInteger(advanced.outputCompression) || advanced.outputCompression < 0 || advanced.outputCompression > 100)) {
        throw new Error("Responses image_generation output_compression 必须是 0..100 的整数");
    }
    if (advanced.partialImages !== undefined && (!Number.isInteger(advanced.partialImages) || advanced.partialImages < 0 || advanced.partialImages > 3)) {
        throw new Error("Responses image_generation partial_images 必须是 0..3 的整数");
    }
    return {
        type: "image_generation",
        ...(settings.size ? { size: settings.size } : {}),
        ...(settings.quality ? { quality: settings.quality } : {}),
        ...(settings.outputFormat ? { output_format: settings.outputFormat } : {}),
        ...(advanced.background ? { background: advanced.background } : {}),
        ...(advanced.inputFidelity ? { input_fidelity: advanced.inputFidelity } : {}),
        ...(advanced.moderation ? { moderation: advanced.moderation } : {}),
        ...(advanced.outputCompression !== undefined ? { output_compression: advanced.outputCompression } : {}),
        ...(advanced.partialImages !== undefined ? { partial_images: advanced.partialImages } : {}),
        ...(context.mask ? { input_image_mask: { image_url: context.mask.dataUrl } } : {}),
    };
}

function assertResponsesEnum(label: string, value: string | undefined, values: readonly string[]) {
    if (value !== undefined && !values.includes(value)) throw new Error(`Responses image_generation ${label} 不支持 ${value}；允许值：${values.join(", ")}`);
}

function parseResponsesImagePayload(payload: unknown, outputFormat: string): GeneratedImageResult[] {
    if (!payload || typeof payload !== "object") throw new Error("Responses API 没有返回有效对象");
    const record = payload as Record<string, unknown>;
    const responseId = typeof record.id === "string" ? record.id : undefined;
    const output = Array.isArray(record.output) ? record.output : [];
    const mimeType = outputFormat.toLowerCase() === "jpeg" ? "image/jpeg" : outputFormat.toLowerCase() === "webp" ? "image/webp" : "image/png";
    const images = output.flatMap((item): GeneratedImageResult[] => {
        if (!item || typeof item !== "object") return [];
        const call = item as Record<string, unknown>;
        if (call.type !== "image_generation_call" || typeof call.result !== "string" || !call.result.trim()) return [];
        return [{
            id: nanoid(),
            dataUrl: `data:${mimeType};base64,${call.result.trim()}`,
            metadata: {
                ...(responseId ? { responseId } : {}),
                ...(typeof call.id === "string" && call.id ? { callId: call.id } : {}),
            },
        }];
    });
    if (!images.length) throw new Error("Responses API 没有返回 image_generation_call.result");
    return images;
}

/**
 * Gemini image models on OpenAI-compatible relays generate and edit through
 * /chat/completions instead of /images/generations (live-verified on
 * api.klong.lat 2026-08-15: /images/generations rejects gemini-*-image* models
 * with "only imagen models are supported", while chat/completions returns
 * `![image](data:image/...;base64,...)` for both text-to-image and
 * text+image_url editing, including multi-reference input).
 */
async function requestOpenAIChatImageBatch(context: ImageBatchContext) {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: context.prompt }];
    for (const image of context.references) {
        content.push({ type: "image_url", image_url: { url: image.dataUrl } });
    }
    const payload = {
        model: context.route.model,
        messages: [{ role: "user", content }],
        // Always stream: Gemini image models "think" for minutes before the
        // image arrives, and relay gateways kill idle non-stream requests
        // (live-verified 2026-08-15: sub3 openresty 504s non-stream at exactly
        // 60s while stream:true returns the image in ~180s; api.klong.lat
        // accepts both). SSE chunks are reassembled below, so relays that
        // ignore stream:true and answer with plain JSON still work.
        stream: true,
    };
    const operationLabel = context.capability.operation === "edit" ? "图片编辑" : "图片生成";
    try {
        const response = await axios.post<unknown>(aiApiUrl(context.route, imageSerializerPath(context.capability)), payload, {
            headers: await aiHeaders(context.config, context.route, "application/json"),
            timeout: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
            responseType: "text",
        });
        return parseChatImageResponse(response.data, operationLabel);
    } catch (error) {
        throw new Error(readAxiosError(error, `${operationLabel}失败（chat/completions 图片）`));
    }
}

const CHAT_IMAGE_MARKDOWN_PATTERN = /!\[[^\]]*\]\(\s*(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+?)\s*\)/gi;

function parseChatImageResponse(data: unknown, operationLabel: string): GeneratedImageResult[] {
    // Axios mock in tests and non-streaming relays hand back a parsed object.
    if (data && typeof data === "object") return parseChatImagePayload(data, operationLabel);
    const text = typeof data === "string" ? data.trim() : "";
    if (!text) throw new Error(`${operationLabel}失败：上游没有返回有效内容`);
    if (text.startsWith("{")) {
        // Relay ignored stream:true and answered with one plain JSON completion.
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error(`${operationLabel}失败：上游返回的内容无法解析`);
        }
        return parseChatImagePayload(parsed, operationLabel);
    }
    return parseChatImageStream(text, operationLabel);
}

function parseChatImageStream(text: string, operationLabel: string): GeneratedImageResult[] {
    let content = "";
    const parts: Array<Record<string, unknown>> = [];
    let sawChunk = false;
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let chunk: unknown;
        try {
            chunk = JSON.parse(data);
        } catch {
            continue;
        }
        sawChunk = true;
        const record = chunk as Record<string, unknown>;
        if (record.error) {
            throw new Error(
                detectTextApiResponseError(record as ImageApiResponse, { operation: `${operationLabel}失败` }) ||
                `${operationLabel}失败：上游返回错误，请检查请求配置后重试`,
            );
        }
        const choices = Array.isArray(record.choices) ? record.choices : [];
        for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            const holder = choice as Record<string, unknown>;
            const delta = (holder.delta && typeof holder.delta === "object" ? holder.delta : holder.message) as Record<string, unknown> | undefined;
            if (!delta) continue;
            // reasoning_content (model "thinking") is deliberately ignored.
            const deltaContent = delta.content;
            if (typeof deltaContent === "string") content += deltaContent;
            else if (Array.isArray(deltaContent)) {
                for (const part of deltaContent) {
                    if (part && typeof part === "object") parts.push(part as Record<string, unknown>);
                }
            }
        }
    }
    if (!sawChunk) throw new Error(`${operationLabel}失败：流式响应中没有有效数据`);
    // Some relays re-emit the finished image as a corrected encode in a later
    // chunk (same response id / choice index, both complete files — verified
    // live on sub3 Antigravity 2026-08-15, which sends the same scene twice).
    // The last emission supersedes earlier ones; without this the strict
    // output-count check would reject the response as "2 images for count 1".
    if (!parts.length) {
        const matches = [...content.matchAll(CHAT_IMAGE_MARKDOWN_PATTERN)];
        if (matches.length > 1) content = matches[matches.length - 1][0];
    }
    return parseChatImagePayload({ choices: [{ message: { content: parts.length ? parts : content } }] }, operationLabel);
}

function parseChatImagePayload(payload: unknown, operationLabel: string): GeneratedImageResult[] {
    if (!payload || typeof payload !== "object") throw new Error(`${operationLabel}失败：上游没有返回有效对象`);
    const record = payload as Record<string, unknown>;
    if (record.error) {
        throw new Error(
            detectTextApiResponseError(record as ImageApiResponse, { operation: `${operationLabel}失败` }) ||
            `${operationLabel}失败：上游返回错误，请检查请求配置后重试`,
        );
    }
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const images: GeneratedImageResult[] = [];
    for (const choice of choices) {
        if (!choice || typeof choice !== "object") continue;
        const message = (choice as Record<string, unknown>).message;
        if (!message || typeof message !== "object") continue;
        const content = (message as Record<string, unknown>).content;
        if (typeof content === "string") {
            for (const match of content.matchAll(CHAT_IMAGE_MARKDOWN_PATTERN)) {
                const dataUrl = match[1].replace(/\s+/g, "");
                if (dataUrl) images.push({ id: nanoid(), dataUrl });
            }
        } else if (Array.isArray(content)) {
            for (const part of content) {
                if (!part || typeof part !== "object") continue;
                const item = part as Record<string, unknown>;
                const imageUrl = item.image_url;
                const url = typeof imageUrl === "string" ? imageUrl : imageUrl && typeof imageUrl === "object" ? (imageUrl as Record<string, unknown>).url : undefined;
                if ((item.type === "image_url" || item.type === "image") && typeof url === "string" && url.startsWith("data:image/")) {
                    images.push({ id: nanoid(), dataUrl: url });
                }
            }
        }
    }
    if (!images.length) throw new Error(`${operationLabel}失败：chat/completions 响应中没有图片`);
    return images;
}

/**
 * xAI Imagine edit contract (official OpenAPI, checked 2026-08-15):
 * POST /v1/images/edits with a JSON body — NOT OpenAI multipart edits.
 * `image {url}` (single) and `images [{url}]` (multi, max 3) are mutually
 * exclusive; prompt is required; url accepts base64 data URIs.
 */
async function requestXaiImagineEditBatch(context: ImageBatchContext) {
    const references = context.references;
    if (!references.length) throw new Error("xAI Imagine 编辑至少需要 1 张参考图；未发送 HTTP 请求");
    const payload = {
        model: context.route.model,
        prompt: context.prompt,
        n: context.providerOutputCount,
        ...(references.length === 1
            ? { image: { url: references[0].dataUrl } }
            : { images: references.map((image) => ({ url: image.dataUrl })) }),
        response_format: "b64_json",
    };
    return postImageJson(context, imageSerializerPath(context.capability), payload, "图片编辑失败（xAI Imagine）");
}

async function requestAgnesImageBatch(context: ImageBatchContext) {
    if (!isAgnesRoute(context.route)) throw new Error("Agnes serializer 与当前 provider 路由不匹配");
    const hasReferences = context.references.length > 0;
    const payload = {
        model: context.route.model,
        prompt: context.prompt,
        size: context.settings.size,
        ...(context.settings.aspectRatio ? { ratio: context.settings.aspectRatio } : {}),
        // Agnes documents different Base64 switches for text-to-image and
        // image-to-image. Keeping results inline also prevents a generated
        // image URL from bypassing the provider's selected network path.
        ...(hasReferences
            ? {
                  extra_body: {
                      image: context.references.map((image) => image.dataUrl),
                      response_format: "b64_json",
                  },
              }
            : { return_base64: true }),
    };
    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(context.route, "/images/generations"), payload, {
            headers: await aiHeaders(context.config, context.route, "application/json"),
            timeout: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
        });
        return parseImagePayload(response.data, context.settings.outputFormat);
    } catch (error) {
        // Agnes has no verified idempotency key. Once dispatched, a transport/5xx
        // failure is ambiguous and replaying this POST can create another paid job.
        throw new Error(readAxiosError(error, hasReferences ? "图片编辑失败（Agnes）" : "图片生成失败（Agnes）"));
    }
}

async function requestDashscopeImageBatch(context: ImageBatchContext) {
    if (!isDashscopeRoute(context.route)) throw new Error("DashScope serializer 与当前 provider 路由不匹配");
    try {
        const taskTimeoutMs = context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS;
        const urls = await requestDashscopeImages(context.route, {
            model: context.route.model,
            prompt: context.prompt,
            references: context.references.map((image) => image.dataUrl),
            size: context.settings.size,
            count: context.providerOutputCount,
            sequential: context.advanced.sequential,
            timeoutMs: Math.min(taskTimeoutMs, 120_000),
            taskTimeoutMs,
            onTaskSubmitted: context.advanced.onNativeTaskSubmitted
                ? (task) => context.advanced.onNativeTaskSubmitted?.({ provider: "dashscope", ...task })
                : undefined,
        });
        return parseImagePayload({ data: urls.map((url) => ({ url })) });
    } catch (error) {
        throw new Error(readAxiosError(error, "图片生成失败（阿里云百炼）"));
    }
}

async function requestArkImageBatch(context: ImageBatchContext) {
    const payload = {
        model: context.route.model,
        prompt: context.prompt,
        ...(context.references.length ? { image: context.references.map((image) => image.dataUrl) } : {}),
        ...(context.settings.size ? { size: context.settings.size } : {}),
        response_format: "url",
    };
    return postImageJson(context, imageSerializerPath(context.capability), payload, "图片生成失败（Ark Seedream）");
}

async function requestSenseNovaImageBatch(context: ImageBatchContext) {
    const size = normalizeSenseNovaImageSize(context.settings.size || "");
    const payload = {
        model: context.route.model,
        prompt: context.prompt,
        n: context.providerOutputCount,
        ...(size ? { size } : {}),
    };
    return postImageJson(context, imageSerializerPath(context.capability), payload, "图片生成失败（SenseNova）");
}

async function requestMiaohuaImageBatch(context: ImageBatchContext) {
    if (context.capability.operation === "edit" && context.references.length !== 1) {
        throw new Error(`秒画参考图编辑必须且只能提交 1 张原图；当前为 ${context.references.length} 张`);
    }
    const imageUrl = context.capability.operation === "edit"
        ? await resolveMiaohuaPublicReference(context.config, context.references[0])
        : undefined;
    try {
        const urls = await requestMiaohuaImages(context.route, {
            model: context.route.model,
            prompt: context.prompt,
            count: context.providerOutputCount,
            width: context.settings.width,
            height: context.settings.height,
            format: context.settings.outputFormat === "JPG" ? "JPG" : "PNG",
            imageUrl,
            timeoutMs: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
            onTaskSubmitted: context.advanced.onNativeTaskSubmitted
                ? (task) => context.advanced.onNativeTaskSubmitted?.({ provider: "miaohua", ...task })
                : undefined,
        });
        return parseImagePayload({ data: urls.map((url) => ({ url })) });
    } catch (error) {
        throw new Error(readAxiosError(error, "图片生成失败（秒画）"));
    }
}

async function requestCivitaiImageBatch(context: ImageBatchContext) {
    if (context.route.mode !== "local" || !isCivitaiRoute(context.route) || !context.service) throw new Error("Civitai serializer 与当前 provider 路由不匹配");
    const sizeField = civitaiSizeField(context.capability);
    const workflow = buildCivitaiImageWorkflow({
        model: context.route.model,
        service: context.service,
        prompt: context.prompt,
        ...(context.settings.width !== undefined ? { width: context.settings.width } : {}),
        ...(context.settings.height !== undefined ? { height: context.settings.height } : {}),
        ...(context.settings.size ? { size: context.settings.size } : {}),
        ...(context.settings.aspectRatio
            || (sizeField === "aspectRatio" && context.settings.size)
            ? { aspectRatio: context.settings.aspectRatio || context.settings.size }
            : {}),
        ...(sizeField === "imageSize" && context.settings.size ? { imageSize: context.settings.size } : {}),
        quantity: context.providerOutputCount,
        images: context.references.map((image) => image.dataUrl),
        maskImage: context.mask?.dataUrl,
        negativePrompt: context.advanced.negativePrompt,
        seed: safeCivitaiSeed(context.advanced.seed),
        steps: context.advanced.steps,
        cfgScale: context.advanced.cfgScale,
        sampler: context.advanced.sampler as Parameters<typeof buildCivitaiImageWorkflow>[0]["sampler"],
        scheduler: context.advanced.scheduler as Parameters<typeof buildCivitaiImageWorkflow>[0]["scheduler"],
        clipSkip: context.advanced.clipSkip,
        denoiseStrength: context.advanced.strength,
        outputFormat: context.settings.outputFormat as Parameters<typeof buildCivitaiImageWorkflow>[0]["outputFormat"],
        loras: context.advanced.loras,
        checkpointAir: context.advanced.checkpointAir,
        strength: context.advanced.strength,
        vaeAir: context.advanced.vaeAir,
        embeddings: context.advanced.embeddings,
        uCache: context.advanced.uCache,
        allowMatureContent: civitaiAllowsMatureContent(context.route.provider),
    });
    return requestCivitaiImages(
        context.route,
        workflow,
        context.providerOutputCount,
        context.advanced.onNativeTaskSubmitted,
        context.civitaiApiKey,
        context.civitaiCredentialId,
    );
}

async function postImageJson(context: ImageBatchContext, path: string, payload: object, fallback: string) {
    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(context.route, path), payload, {
            headers: await aiHeaders(context.config, context.route, "application/json"),
            timeout: context.route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
        });
        return parseImagePayload(response.data, context.settings.outputFormat);
    } catch (error) {
        throw new Error(readAxiosError(error, fallback));
    }
}

function imageSerializerPath(capability: ResolvedImageModelCapability) {
    const endpoint = capability.serialization.endpoint;
    if (capability.serialization.kind === "ark-images-generate") return endpoint.replace(/^\/api\/v3/i, "") || "/images/generations";
    if (capability.serialization.kind === "sensenova-miaohua-image") return endpoint.replace(/^\/v1/i, "") || "/imgenstd/imgen";
    return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

function safeCivitaiSeed(value: number | string | undefined) {
    if (value === undefined || value === "") return undefined;
    const seed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(seed)) throw new Error(`Civitai seed ${String(value)} 无法由当前客户端精确序列化；请使用 JavaScript 安全整数范围内的值`);
    return seed;
}

async function requestCivitaiImages(
    route: Extract<ApiRequestRoute, { mode: "local" }>,
    workflow: object,
    expectedOutputs: number,
    onTaskSubmitted?: NativeImageTaskSubmissionObserver,
    pinnedApiKey?: string,
    pinnedCredentialId?: string,
) {
    try {
        const created = await createCivitaiWorkflow(route, workflow, 60, pinnedApiKey, pinnedCredentialId);
        const state: CivitaiWorkflowState = await waitCivitaiWorkflow(route, created, {
            initialState: created.state,
            onTaskSubmitted: onTaskSubmitted
                ? (task) => onTaskSubmitted({
                      provider: "civitai",
                      taskId: task.taskId,
                      credentialId: task.credentialId,
                      startedAt: task.startedAt,
                      expectedOutputs,
                  })
                : undefined,
        });
        if (state.status === "failed") throw new Error(state.error);
        if (state.status === "pending") throw new Error("Civitai 图片生成超时，可稍后在工作流记录中查询");
        return parseImagePayload({ data: state.blobs.map((blob) => ({ url: blob.url })) });
    } catch (error) {
        throw new Error(readAxiosError(error, "Civitai 图片生成失败"));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta?: (text: string) => void, options: ChatCompletionOptions = {}) {
    let buffer = "";
    let answer = "";
    let processedLength = 0;
    const stream = options.stream ?? true;
    const completionState: ChatCompletionState = { hasReasoningContent: false };
    const route = resolveApiRequestRoute(config, "text", explicitTextRequestModel(config, options.boardRouteKey), options.boardRouteKey);
    const maxTokens = storyCompletionBudget(route, options.requestPurpose);
    const payload = {
        model: route.model,
        messages: withSystemMessage(config, messages),
        stream,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
        ...(options.disableFileGeneration ? { disable_file_generation: true } : {}),
    };

    try {
        const response = await axios.post(
            aiApiUrl(route, "/chat/completions"),
            payload,
            {
                headers: {
                    ...(await aiHeaders(config, route, "application/json")),
                } as Record<string, string>,
                timeout: route.timeoutMs,
                ...(stream
                    ? {
                          responseType: "text" as const,
                          onDownloadProgress: (event) => {
                              const responseText = String(event.event?.target?.responseText || "");
                              const nextText = responseText.slice(processedLength);
                              processedLength = responseText.length;
                              buffer += nextText;
                              const chunks = buffer.split(/\r?\n\r?\n/);
                              buffer = chunks.pop() || "";
                              for (const chunk of chunks) {
                                  parseStreamChunk(chunk, (delta) => {
                                      answer += delta;
                                      onDelta?.(answer);
                                  }, completionState);
                              }
                          },
                      }
                    : {}),
            },
        );
        const responseError = detectTextApiResponseError(response.data, {
            status: response.status,
            contentType: String(response.headers?.["content-type"] || ""),
            operation: "文本生成失败",
        });
        if (responseError) throw new Error(responseError);
        if (buffer) {
            parseStreamChunk(buffer, (delta) => {
                answer += delta;
                onDelta?.(answer);
            }, completionState);
        }
        // Progress callbacks can expose only a prefix of an XHR response.
        // Re-parse the completed payload so a partial answer cannot reach
        // JSON consumers when the final response is available.
        if (stream) {
            const fullAnswer = parseTextResponsePayload(response.data, completionState);
            if (fullAnswer && fullAnswer !== answer) {
                answer = fullAnswer;
                onDelta?.(answer);
            }
        }
        // Some OpenAI-compatible relays ignore `stream` and return one JSON
        // response. Recover that payload before reporting a false empty result.
        if (stream && !answer.trim()) {
            const fallbackAnswer = parseTextResponsePayload(response.data, completionState);
            if (fallbackAnswer) {
                answer = fallbackAnswer;
                onDelta?.(answer);
            }
        }
        if (!stream) {
            answer = parseTextResponsePayload(response.data, completionState);
            if (answer) onDelta?.(answer);
        }
    } catch (error) {
        throw new Error(readAxiosError(error, "文本生成失败"));
    }
    refreshRemoteUser(config);
    if (maxTokens && completionState.finishReason === "length") {
        throw new Error(`Agnes 故事导演已耗尽 ${maxTokens} max_tokens 输出预算，未返回完整正文`);
    }
    if (maxTokens && !answer.trim() && completionState.hasReasoningContent) {
        throw new Error("Agnes 故事导演仅返回推理内容，未返回完整正文");
    }
    if (!answer.trim()) throw new Error("文本生成没有返回内容");
    return answer;
}

export async function fetchImageModels(config: AiConfig) {
    let route: ApiRequestRoute;
    try {
        route = resolveApiRequestRoute(config, "image");
    } catch (routeError) {
        if (config.channelMode === "remote") return config.models;
        throw routeError;
    }
    if (route.mode === "local") return fetchRelayProviderModels(route.provider);
    return config.models;
}

export async function fetchRelayProviderModels(provider: ApiRelayProvider, _overrideKey?: string) {
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildLocalRelayProxyUrl("/models"), {
            headers: buildLocalRelayProxyHeaders(provider),
            timeout: 20_000,
        });
        return normalizeRelayModelResponse((response.data.data || []).map((model) => model.id || ""));
    } catch (error) {
        throw toRelayModelDiscoveryError(error);
    }
}

function normalizeRelayModelResponse(models: readonly string[]) {
    return [...new Set(models.map((model) => String(model || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
