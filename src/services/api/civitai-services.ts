export type CivitaiGenerationStep = "imageGen" | "videoGen";

export type CivitaiGenerationService = {
    readonly id: string;
    readonly step: CivitaiGenerationStep;
    readonly parameters: Readonly<Record<string, string>>;
    readonly modalities: {
        readonly input: readonly string[];
        readonly output: readonly string[];
    };
    readonly status: "available" | "degraded" | "unknown";
};

export type CivitaiGenerationCatalog = {
    readonly services: readonly CivitaiGenerationService[];
    readonly source: "live" | "bundled";
    readonly snapshot: boolean;
};

export type CivitaiGenerationServicePage = {
    readonly services: readonly CivitaiGenerationService[];
    readonly totalCount: number;
    readonly limit: number;
    readonly offset: number;
};

export class CivitaiCatalogUnavailableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "CivitaiCatalogUnavailableError";
    }
}

export class CivitaiCatalogContractError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "CivitaiCatalogContractError";
    }
}

type ServiceTuple = readonly [
    id: string,
    step: CivitaiGenerationStep,
    parameters: Readonly<Record<string, string>>,
    inputModalities: readonly string[],
    status: "available" | "degraded",
];

const SERVICE_DEFINITIONS: readonly ServiceTuple[] = [
    ["image/comfy/anima/createImage", "imageGen", { operation: "createImage", engine: "comfy", ecosystem: "anima" }, ["text"], "available"],
    ["image/comfy/ernie/ernie/createImage", "imageGen", { operation: "createImage", model: "ernie", engine: "comfy", ecosystem: "ernie" }, ["text"], "degraded"],
    ["image/comfy/flux1/createImage", "imageGen", { operation: "createImage", engine: "comfy", ecosystem: "flux1" }, ["text"], "available"],
    ["image/comfy/flux1/createVariant", "imageGen", { operation: "createVariant", engine: "comfy", ecosystem: "flux1" }, ["image"], "available"],
    ["image/comfy/hidream-o1/HiDream-O1-Image-dev/editImage", "imageGen", { operation: "editImage", model: "HiDream-O1-Image-dev", engine: "comfy", ecosystem: "hidream-o1" }, ["text", "image"], "available"],
    ["image/comfy/krea2/raw/createImage", "imageGen", { operation: "createImage", model: "raw", engine: "comfy", ecosystem: "krea2" }, ["text"], "degraded"],
    ["image/comfy/krea2/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "comfy", ecosystem: "krea2" }, ["text"], "available"],
    ["image/comfy/sdxl/createImage", "imageGen", { operation: "createImage", engine: "comfy", ecosystem: "sdxl" }, ["text"], "degraded"],
    ["image/fal/qwen2/createImage", "imageGen", { operation: "createImage", model: "qwen2", engine: "fal" }, ["text"], "available"],
    ["image/fal/qwen2/editImage", "imageGen", { operation: "editImage", model: "qwen2", engine: "fal" }, ["text", "image"], "available"],
    ["image/flux1-kontext/pro", "imageGen", { model: "pro", engine: "flux1-kontext" }, ["text", "image"], "available"],
    ["image/flux2/dev/createImage", "imageGen", { operation: "createImage", model: "dev", engine: "flux2" }, ["text"], "available"],
    ["image/flux2/dev/editImage", "imageGen", { operation: "editImage", model: "dev", engine: "flux2" }, ["text", "image"], "degraded"],
    ["image/flux2/klein/createImage/4b", "imageGen", { operation: "createImage", model: "klein", modelVersion: "4b", engine: "flux2" }, ["text"], "available"],
    ["image/flux2/klein/createImage/9b-base", "imageGen", { operation: "createImage", model: "klein", modelVersion: "9b-base", engine: "flux2" }, ["text"], "available"],
    ["image/flux2/klein/createImage/9b", "imageGen", { operation: "createImage", model: "klein", modelVersion: "9b", engine: "flux2" }, ["text"], "available"],
    ["image/flux2/klein/editImage/4b", "imageGen", { operation: "editImage", model: "klein", modelVersion: "4b", engine: "flux2" }, ["text", "image"], "available"],
    ["image/flux2/klein/editImage/9b-base", "imageGen", { operation: "editImage", model: "klein", modelVersion: "9b-base", engine: "flux2" }, ["text", "image"], "available"],
    ["image/flux2/klein/editImage/9b", "imageGen", { operation: "editImage", model: "klein", modelVersion: "9b", engine: "flux2" }, ["text", "image"], "available"],
    ["image/gemini/2.5-flash/createImage", "imageGen", { operation: "createImage", model: "2.5-flash", engine: "gemini" }, ["text"], "degraded"],
    ["image/google/nano-banana-2-lite", "imageGen", { model: "nano-banana-2-lite", engine: "google" }, ["text", "image"], "degraded"],
    ["image/google/nano-banana-2", "imageGen", { model: "nano-banana-2", engine: "google" }, ["text", "image"], "degraded"],
    ["image/grok/v1.0/createImage", "imageGen", { operation: "createImage", version: "v1.0", engine: "grok" }, ["text"], "degraded"],
    ["image/grok/v1.0/editImage", "imageGen", { operation: "editImage", version: "v1.0", engine: "grok" }, ["text", "image"], "degraded"],
    ["image/openai/gpt-image-2/createImage", "imageGen", { operation: "createImage", model: "gpt-image-2", engine: "openai" }, ["text"], "degraded"],
    ["image/openai/gpt-image-2/editImage", "imageGen", { operation: "editImage", model: "gpt-image-2", engine: "openai" }, ["text", "image"], "degraded"],
    ["image/qwen/createImage/3.0-pro", "imageGen", { operation: "createImage", model: "3.0-pro", engine: "qwen" }, ["text"], "available"],
    ["image/qwen/editImage/3.0-pro", "imageGen", { operation: "editImage", model: "3.0-pro", engine: "qwen" }, ["text", "image"], "available"],
    ["image/sdcpp/anima/createImage", "imageGen", { operation: "createImage", engine: "sdcpp", ecosystem: "anima" }, ["text"], "available"],
    ["image/sdcpp/flux2Klein/createVariant/9b", "imageGen", { operation: "createVariant", engine: "sdcpp", ecosystem: "flux2Klein", modelVersion: "9b" }, ["image"], "available"],
    ["image/sdcpp/qwen/20b/createImage", "imageGen", { operation: "createImage", model: "20b", engine: "sdcpp", ecosystem: "qwen" }, ["text"], "available"],
    ["image/sdcpp/qwen/20b/editImage", "imageGen", { operation: "editImage", model: "20b", engine: "sdcpp", ecosystem: "qwen" }, ["text", "image"], "degraded"],
    ["image/sdcpp/sdxl/createImage", "imageGen", { operation: "createImage", engine: "sdcpp", ecosystem: "sdxl" }, ["text"], "available"],
    ["image/sdcpp/sdxl/createVariant", "imageGen", { operation: "createVariant", engine: "sdcpp", ecosystem: "sdxl" }, ["image"], "available"],
    ["image/sdcpp/zImage/base/createImage", "imageGen", { operation: "createImage", model: "base", engine: "sdcpp", ecosystem: "zImage" }, ["text"], "available"],
    ["image/sdcpp/zImage/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "sdcpp", ecosystem: "zImage" }, ["text"], "available"],
    ["image/seedream/v4", "imageGen", { version: "v4", engine: "seedream" }, ["text", "image"], "available"],
    ["image/seedream/v4.5", "imageGen", { version: "v4.5", engine: "seedream" }, ["text", "image"], "available"],
    ["image/seedream/v5.0-lite", "imageGen", { version: "v5.0-lite", engine: "seedream" }, ["text", "image"], "available"],
    ["image/seedream/v5.0-pro", "imageGen", { version: "v5.0-pro", engine: "seedream" }, ["text", "image"], "degraded"],
    ["image/wan/v2.7/fal/createImage", "imageGen", { operation: "createImage", version: "v2.7", provider: "fal", engine: "wan" }, ["text"], "available"],
    ["image/wan/v2.7/fal/editImage", "imageGen", { operation: "editImage", version: "v2.7", provider: "fal", engine: "wan" }, ["text", "image"], "available"],
    ["video/grok/image-to-video", "videoGen", { operation: "image-to-video", engine: "grok" }, ["text", "image"], "degraded"],
    ["video/happyHorse/v1.1/imageToVideo", "videoGen", { operation: "imageToVideo", version: "v1.1", engine: "happyHorse" }, ["text", "image"], "available"],
    ["video/happyHorse/v1.1/referenceToVideo", "videoGen", { operation: "referenceToVideo", version: "v1.1", engine: "happyHorse" }, ["text", "image"], "available"],
    ["video/hunyuan", "videoGen", { engine: "hunyuan" }, ["text"], "available"],
    ["video/kling", "videoGen", { engine: "kling" }, ["text"], "degraded"],
    ["video/kling-v3", "videoGen", { engine: "kling-v3" }, ["text"], "degraded"],
    ["video/ltx2.3/createVideo", "videoGen", { operation: "createVideo", engine: "ltx2.3" }, ["text"], "available"],
    ["video/ltx2.3/firstLastFrameToVideo", "videoGen", { operation: "firstLastFrameToVideo", engine: "ltx2.3" }, ["text", "image"], "available"],
    ["video/minimax-h3", "videoGen", { engine: "minimax-h3" }, ["text", "image", "video", "audio"], "degraded"],
    ["video/seedance", "videoGen", { engine: "seedance" }, ["text", "image", "video", "audio"], "degraded"],
    ["video/sora/image-to-video", "videoGen", { operation: "image-to-video", engine: "sora" }, ["text", "image"], "degraded"],
    ["video/vidu-q3", "videoGen", { engine: "vidu-q3" }, ["text"], "degraded"],
    ["video/vidu", "videoGen", { engine: "vidu" }, ["text"], "degraded"],
    ["video/wan/v2.1/civitai", "videoGen", { version: "v2.1", provider: "civitai", engine: "wan" }, ["text", "image"], "degraded"],
    ["video/wan/v2.2-5b/fal/image-to-video", "videoGen", { operation: "image-to-video", version: "v2.2-5b", provider: "fal", engine: "wan" }, ["text", "image"], "available"],
    ["video/wan/v2.2/fal/image-to-video", "videoGen", { operation: "image-to-video", version: "v2.2", provider: "fal", engine: "wan" }, ["text", "image"], "available"],
    ["video/wan/v2.5/fal/image-to-video", "videoGen", { operation: "image-to-video", version: "v2.5", provider: "fal", engine: "wan" }, ["text", "image"], "available"],
    ["video/wan/v2.7/fal/image-to-video", "videoGen", { operation: "image-to-video", version: "v2.7", provider: "fal", engine: "wan" }, ["text", "image"], "available"],
    ["video/wan/v2.7/fal/reference-to-video", "videoGen", { operation: "reference-to-video", version: "v2.7", provider: "fal", engine: "wan" }, ["text", "video"], "degraded"],
] as const;

/**
 * Last verified service snapshot for offline/error fallback only. The live
 * `/v2/services` response is authoritative and may contain additional services.
 */
const NON_SELECTABLE_VIDEO_SERVICES_AT_LAST_LIVE_CHECK = new Set([
    "video/happyHorse/v1.1/referenceToVideo",
    "video/kling",
    "video/sora/image-to-video",
    "video/vidu-q3",
    "video/vidu",
    "video/wan/v2.7/fal/reference-to-video",
]);

export const CIVITAI_FALLBACK_SERVICES: readonly CivitaiGenerationService[] = SERVICE_DEFINITIONS
    .filter(([id]) => !NON_SELECTABLE_VIDEO_SERVICES_AT_LAST_LIVE_CHECK.has(id))
    .map(
    ([id, step, parameters, input, status]) => ({
        id,
        step,
        parameters,
        modalities: { input, output: [step === "imageGen" ? "image" : "video"] },
        status,
    }),
    );

export const CIVITAI_IMAGE_SERVICE_IDS = CIVITAI_FALLBACK_SERVICES.filter((service) => service.step === "imageGen").map((service) => service.id);
export const CIVITAI_VIDEO_SERVICE_IDS = CIVITAI_FALLBACK_SERVICES.filter((service) => service.step === "videoGen").map((service) => service.id);

export async function loadCivitaiGenerationCatalog(
    loadLiveServices: () => Promise<readonly CivitaiGenerationService[]>,
    options: { readonly fallbackWhen?: (error: unknown) => boolean } = {},
): Promise<CivitaiGenerationCatalog> {
    try {
        return { services: await loadLiveServices(), source: "live", snapshot: false };
    } catch (error) {
        const fallbackWhen = options.fallbackWhen ?? ((failure: unknown) => failure instanceof CivitaiCatalogUnavailableError);
        if (!fallbackWhen(error)) throw error;
        return { services: CIVITAI_FALLBACK_SERVICES, source: "bundled", snapshot: true };
    }
}

export async function collectCivitaiGenerationServicePages(
    loadPage: (offset: number) => Promise<CivitaiGenerationServicePage>,
    pageLimit: number,
    maxPages: number,
) {
    const firstPage = await loadPage(0);
    assertCatalogPageMetadata(firstPage, 0, firstPage.totalCount, pageLimit);
    const pageCount = Math.ceil(firstPage.totalCount / pageLimit);
    if (pageCount > maxPages) {
        throw new CivitaiCatalogContractError(`Civitai /v2/services 声明 ${firstPage.totalCount} 项，超过客户端安全分页上限`);
    }
    const pages = [firstPage];
    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
        const expectedOffset = pageIndex * pageLimit;
        const page = await loadPage(expectedOffset);
        assertCatalogPageMetadata(page, expectedOffset, firstPage.totalCount, pageLimit);
        pages.push(page);
    }
    const byId = new Map<string, CivitaiGenerationService>();
    pages.flatMap((page) => page.services).forEach((service) => byId.set(service.id, service));
    return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function createService(
    id: string,
    step: CivitaiGenerationStep,
    parameters: Readonly<Record<string, string>>,
    input: readonly string[],
    status: "available" | "degraded" | "unknown" = "available",
): CivitaiGenerationService {
    return {
        id,
        step,
        parameters,
        modalities: { input, output: [step === "imageGen" ? "image" : "video"] },
        status,
    };
}

const LEGACY_SERVICE_ALIASES: Readonly<Record<string, CivitaiGenerationService>> = {
    "krea2-turbo": createService("image/comfy/krea2/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "comfy", ecosystem: "krea2" }, ["text", "image"]),
    "krea2-raw": createService("image/comfy/krea2/raw/createImage", "imageGen", { operation: "createImage", model: "raw", engine: "comfy", ecosystem: "krea2" }, ["text", "image"]),
    "krea2": createService("image/comfy/krea2/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "comfy", ecosystem: "krea2" }, ["text", "image"]),
    "krea": createService("image/comfy/krea2/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "comfy", ecosystem: "krea2" }, ["text", "image"]),
    "turbo": createService("image/comfy/krea2/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "comfy", ecosystem: "krea2" }, ["text", "image"]),
    "seedream-v4": createService("image/seedream/v4", "imageGen", { engine: "seedream", version: "v4" }, ["text", "image"]),
    "seedream-v4.5": createService("image/seedream/v4.5", "imageGen", { engine: "seedream", version: "v4.5" }, ["text", "image"]),
    "seedream-v5.0-lite": createService("image/seedream/v5.0-lite", "imageGen", { engine: "seedream", version: "v5.0-lite" }, ["text", "image"]),
    "kling-v3": createService("video/kling-v3", "videoGen", { engine: "kling-v3" }, ["text", "image", "video"]),
    "image/grok/createimage": createService("image/grok/v1.0/createImage", "imageGen", { operation: "createImage", version: "v1.0", engine: "grok" }, ["text"]),
    "image/grok/editimage": createService("image/grok/v1.0/editImage", "imageGen", { operation: "editImage", version: "v1.0", engine: "grok" }, ["text", "image"]),
};

export function parseCivitaiGenerationServices(payload: unknown): CivitaiGenerationService[] {
    if (!isRecord(payload) || !Array.isArray(payload.items)) throw new Error("Civitai /v2/services 返回格式无效");
    const services: CivitaiGenerationService[] = [];
    for (const value of payload.items) {
        const parsed = parseService(value);
        if (parsed) services.push(parsed);
    }
    return services;
}

export function parseCivitaiGenerationServicePage(payload: unknown): CivitaiGenerationServicePage {
    if (!isRecord(payload)) throw new CivitaiCatalogContractError("Civitai /v2/services 返回格式无效");
    const totalCount = catalogInteger(payload.totalCount, "totalCount");
    const limit = catalogInteger(payload.limit, "limit");
    const offset = catalogInteger(payload.offset, "offset");
    if (limit < 1) throw new CivitaiCatalogContractError("Civitai /v2/services 的 limit 必须大于 0");
    if (offset > totalCount && totalCount !== 0) throw new CivitaiCatalogContractError("Civitai /v2/services 的 offset 超出 totalCount");
    try {
        return { services: parseCivitaiGenerationServices(payload), totalCount, limit, offset };
    } catch (error) {
        throw new CivitaiCatalogContractError("Civitai /v2/services 的 items 不符合服务目录合同", { cause: error });
    }
}

export function resolveCivitaiService(model: string, services: readonly CivitaiGenerationService[] = CIVITAI_FALLBACK_SERVICES) {
    const normalized = model.trim();
    const exact = services.find((item) => item.id === normalized);
    if (exact) return exact;
    const alias = LEGACY_SERVICE_ALIASES[normalized.toLowerCase()];
    if (alias) {
        return services.find((item) => item.id === alias.id) ?? alias;
    }
    const lower = normalized.toLowerCase();
    const fallbackList = services === CIVITAI_FALLBACK_SERVICES ? services : [...services, ...CIVITAI_FALLBACK_SERVICES];
    const fuzzy = fallbackList.find((item) => {
        const idLower = item.id.toLowerCase();
        if (idLower === lower) return true;
        if (lower.includes("krea") && (idLower.includes("krea") || item.parameters.ecosystem === "krea2")) {
            if (lower.includes("raw") && idLower.includes("raw")) return true;
            if (!lower.includes("raw") && (idLower.includes("turbo") || item.parameters.model === "turbo")) return true;
            return true;
        }
        if (lower.includes("flux") && (idLower.includes("flux") || item.parameters.ecosystem === "flux1")) return true;
        if (lower.includes("sdxl") && (idLower.includes("sdxl") || item.parameters.ecosystem === "sdxl")) return true;
        return false;
    });
    if (fuzzy) return fuzzy;
    return undefined;
}

export function requireCivitaiCatalogService(catalog: CivitaiGenerationCatalog, model: string) {
    const service = resolveCivitaiService(model, catalog.services) ?? resolveCivitaiService(model, CIVITAI_FALLBACK_SERVICES);
    if (service) return service;
    const lower = model.toLowerCase();
    if (lower.includes("krea")) {
        return createService("image/comfy/krea2/turbo/createImage", "imageGen", { operation: "createImage", model: "turbo", engine: "comfy", ecosystem: "krea2" }, ["text", "image"]);
    }
    return createService("image/comfy/sdxl/createImage", "imageGen", { operation: "createImage", engine: "comfy", ecosystem: "sdxl" }, ["text"]);
}

export function civitaiCatalogModelLists(catalog: CivitaiGenerationCatalog) {
    const imageModels = catalog.services.filter((service) => service.step === "imageGen").map((service) => service.id);
    const videoModels = catalog.services.filter((service) => service.step === "videoGen").map((service) => service.id);
    return { models: [...imageModels, ...videoModels], imageModels, videoModels };
}

type CivitaiCatalogCapability = "text" | "image" | "video" | "audio";

type CivitaiCatalogDiscoveryProvider<TMetadata> = {
    readonly models: readonly string[];
    readonly textModels: readonly string[];
    readonly imageModels: readonly string[];
    readonly videoModels: readonly string[];
    readonly audioModels: readonly string[];
    readonly capabilities: readonly CivitaiCatalogCapability[];
    readonly modelCatalogMetadata?: TMetadata;
};

/**
 * Merge a Civitai catalog into provider discovery state.
 * A successful live `/v2/services` response is authoritative, so a service
 * removed upstream must not survive merely because it was in a prior refresh.
 * The bundled offline snapshot is additive and must not delete manually
 * configured media models. Explicit text/audio/unassigned entries are outside
 * this catalog's scope and are preserved in either mode.
 */
export function mergeCivitaiCatalogDiscovery<TMetadata>(
    provider: CivitaiCatalogDiscoveryProvider<TMetadata>,
    discovered: {
        readonly models: readonly string[];
        readonly imageModels: readonly string[];
        readonly videoModels: readonly string[];
    },
    source: "live" | "bundled" = "bundled",
) {
    const previousMediaModels = new Set([...provider.imageModels, ...provider.videoModels]);
    const explicitlyNonMediaModels = new Set([...provider.textModels, ...provider.audioModels]);
    const preservedModels = source === "live"
        ? provider.models.filter(
            (model) => !previousMediaModels.has(model) || explicitlyNonMediaModels.has(model),
        )
        : provider.models;
    const imageModels = source === "live"
        ? uniqueCivitaiModelIds(discovered.imageModels)
        : uniqueCivitaiModelIds([...provider.imageModels, ...discovered.imageModels]);
    const videoModels = source === "live"
        ? uniqueCivitaiModelIds(discovered.videoModels)
        : uniqueCivitaiModelIds([...provider.videoModels, ...discovered.videoModels]);
    const capabilities: CivitaiCatalogCapability[] = provider.capabilities.filter(
        (capability) => capability !== "image" && capability !== "video",
    );
    if (imageModels.length) capabilities.push("image");
    if (videoModels.length) capabilities.push("video");
    return {
        models: uniqueCivitaiModelIds([
            ...preservedModels,
            ...provider.textModels,
            ...provider.audioModels,
            ...imageModels,
            ...videoModels,
            ...discovered.models,
        ]),
        textModels: uniqueCivitaiModelIds(provider.textModels),
        imageModels,
        videoModels,
        audioModels: uniqueCivitaiModelIds(provider.audioModels),
        capabilities,
        ...(provider.modelCatalogMetadata ? { modelCatalogMetadata: provider.modelCatalogMetadata } : {}),
    };
}

function parseService(value: unknown): CivitaiGenerationService | undefined {
    if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.parameters)) return undefined;
    const step = value.step;
    const status = value.status;
    if ((step !== "imageGen" && step !== "videoGen") || !isSelectableCatalogStatus(status)) return undefined;
    if (value.category !== (step === "imageGen" ? "image" : "video")) return undefined;
    const parameters: Record<string, string> = {};
    for (const [key, parameter] of Object.entries(value.parameters)) {
        if (typeof parameter === "string" && parameter.trim()) parameters[key] = parameter;
    }
    if (!parameters.engine) return undefined;
    const modalities = isRecord(value.modalities) ? value.modalities : {};
    return {
        id: value.id,
        step,
        parameters,
        modalities: {
            input: catalogInputModalities(parameters, stringArray(modalities.input)),
            output: catalogOutputModalities(step, stringArray(modalities.output)),
        },
        status,
    };
}

function isSelectableCatalogStatus(status: unknown): status is CivitaiGenerationService["status"] {
    return status === "available" || status === "degraded" || status === "unknown";
}

function catalogInputModalities(parameters: Readonly<Record<string, string>>, listed: readonly string[]): readonly string[] {
    if (listed.length) return listed;
    const operation = parameters.operation || "";
    if (operation === "editImage" || operation === "proEditImage") return ["text", "image"];
    if (operation === "createVariant" || operation === "image-to-image") return ["image"];
    if (!operation || operation === "createImage" || operation === "text-to-image" || operation === "proCreateImage") return ["text"];
    return listed;
}

function catalogOutputModalities(step: CivitaiGenerationStep, listed: readonly string[]): readonly string[] {
    if (listed.length) return listed;
    return [step === "imageGen" ? "image" : "video"];
}

function service(id: string, step: CivitaiGenerationStep, parameters: Readonly<Record<string, string>>, input: readonly string[]): CivitaiGenerationService {
    return { id, step, parameters, modalities: { input, output: [step === "imageGen" ? "image" : "video"] }, status: "available" };
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function uniqueCivitaiModelIds(values: readonly string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function catalogInteger(value: unknown, name: string) {
    if (!Number.isInteger(value) || Number(value) < 0) {
        throw new CivitaiCatalogContractError(`Civitai /v2/services 的 ${name} 必须是非负整数`);
    }
    return Number(value);
}

function assertCatalogPageMetadata(page: CivitaiGenerationServicePage, expectedOffset: number, totalCount: number, pageLimit: number) {
    if (page.totalCount !== totalCount || page.limit !== pageLimit || page.offset !== expectedOffset) {
        throw new CivitaiCatalogContractError("Civitai /v2/services 分页元数据在刷新过程中发生变化，请重新刷新目录");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
