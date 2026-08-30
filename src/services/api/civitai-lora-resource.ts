export type CivitaiLoraResourceKind = "air" | "model-id" | "version-id";

export type CivitaiLoraCompatibilityTarget = {
    readonly label: string;
    readonly ecosystems: readonly string[];
    readonly baseModels: readonly string[];
};

export type ParsedCivitaiLoraAir = {
    readonly air: string;
    readonly ecosystem: string;
    readonly modelId: string;
    readonly modelVersionId: string;
};

export type CivitaiLoraVersionOption = {
    readonly modelVersionId: string;
    readonly name: string;
    readonly baseModel?: string;
    readonly compatible: boolean | null;
    readonly compatibilityError?: string;
};

export type ResolvedCivitaiLoraResource = ParsedCivitaiLoraAir & {
    readonly sourceKind: CivitaiLoraResourceKind;
    readonly sourceValue: string;
    readonly baseModel?: string;
    readonly baseModelType?: string;
    readonly modelName?: string;
    readonly versionName?: string;
};

export type CivitaiLoraResolution =
    | { readonly status: "resolved"; readonly resource: ResolvedCivitaiLoraResource }
    | {
          readonly status: "version-selection-required";
          readonly sourceKind: "model-id";
          readonly sourceValue: string;
          readonly modelId: string;
          readonly modelName?: string;
          readonly versions: readonly CivitaiLoraVersionOption[];
      };

export type CivitaiLoraResolveInput = {
    readonly kind: CivitaiLoraResourceKind;
    readonly value: string;
    readonly targetModel: string;
    readonly selectedVersionId?: string;
    readonly forceRefresh?: boolean;
};

type CivitaiLoraJsonRequest = (path: string) => Promise<unknown>;

type CivitaiLoraResolverOptions = {
    readonly request?: CivitaiLoraJsonRequest;
    readonly cacheTtlMs?: number;
    readonly now?: () => number;
};

type CachedRequest = {
    readonly expiresAt: number;
    readonly promise: Promise<unknown>;
};

const CIVITAI_API_BASE_URL = "https://civitai.com/api/v1";
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const FULL_LORA_AIR_PATTERN = /^urn:air:([a-z0-9][a-z0-9._-]*):lora:civitai:(\d+)@(\d+)$/i;
const MAP_LORA_PREFIX_EXAMPLE = "urn:air:zimageturbo:lora:civitai:<id>@<ver>";
const ARRAY_LORA_MESSAGE = "需要 array {air,strength}，当前不会改成 map 乱发";

/**
 * Resolve only ecosystems verified for the selected Civitai service.
 * Live Turbo LoRA AIR uses `zimageturbo`; the recipe placeholder `zImage` is
 * not a live Turbo ecosystem, and Z-Image Base remains unmapped.
 */
export function resolveCivitaiLoraCompatibilityTarget(targetModel: string): CivitaiLoraCompatibilityTarget | undefined {
    const normalized = String(targetModel || "").trim().toLowerCase();
    if (/\/(?:zimage|z-image)\/turbo(?:\/|$)/.test(normalized)) {
        return { label: "Z-Image Turbo", ecosystems: ["zimageturbo"], baseModels: ["ZImageTurbo"] };
    }
    if (/\/anima(?:\/|$)/.test(normalized)) {
        return { label: "Anima", ecosystems: ["anima"], baseModels: ["Anima"] };
    }
    if (/\/ernie(?:\/|$)/.test(normalized)) {
        return { label: "ERNIE", ecosystems: ["ernie"], baseModels: ["Ernie"] };
    }
    if (/\/sdcpp\/qwen\/20b(?:\/|$)/.test(normalized)) {
        return { label: "Qwen 20B", ecosystems: ["qwen"], baseModels: ["Qwen"] };
    }
    if (/\/sdxl(?:\/|$)/.test(normalized)) {
        return { label: "SDXL", ecosystems: ["sdxl"], baseModels: ["SDXL 1.0", "Pony", "Illustrious", "NoobAI"] };
    }
    if (/\/flux2\/klein(?:\/|$)/.test(normalized)) {
        return { label: "Flux 2 Klein", ecosystems: ["flux2"], baseModels: ["Flux.2 D", "Flux.2 Klein 4B", "Flux.2 Klein 9B"] };
    }
    if (/\/krea2(?:\/|$)/.test(normalized)) {
        return { label: "Krea 2", ecosystems: ["krea2"], baseModels: ["Krea 2"] };
    }
    if (/\/hidream(?:-o1)?(?:\/|$)/.test(normalized)) {
        return { label: "HiDream", ecosystems: ["hidream"], baseModels: ["HiDream"] };
    }
    return undefined;
}

export function isCivitaiArrayLoraService(targetModel: string) {
    const normalized = String(targetModel || "").trim().toLowerCase();
    return /\/flux2\/dev(?:\/|$)/.test(normalized) || /\/wan\//.test(normalized);
}

export function civitaiLoraUnsupportedMessage(targetModel: string) {
    const service = String(targetModel || "").trim() || "（空）";
    if (isCivitaiArrayLoraService(service)) {
        return `Civitai / ${service} 的 loras ${ARRAY_LORA_MESSAGE}`;
    }
    return `该服务不接受 LoRA。已验证 map 服务请使用完整 AIR，例如 ${MAP_LORA_PREFIX_EXAMPLE}（anima、ernie、qwen、sdxl、flux2 Klein、krea2、hidream 把生态段换成对应值）；Flux2 Dev / WAN ${ARRAY_LORA_MESSAGE}`;
}

function civitaiLoraMismatchMessage(
    resource: Pick<ParsedCivitaiLoraAir, "air" | "ecosystem"> & { readonly baseModel?: string },
    target: CivitaiLoraCompatibilityTarget,
) {
    const requiredAir = `urn:air:${target.ecosystems[0]}:lora:civitai:<id>@<ver>`;
    const allowedBases = target.baseModels.join("、");
    if (resource.baseModel) {
        return `${resource.air} 的官方 baseModel=${resource.baseModel}，与当前 ${target.label} 不兼容；需要 ${requiredAir}，允许的 baseModel：${allowedBases}`;
    }
    return `${resource.air} 属于 ${resource.ecosystem}，与当前 ${target.label} 不兼容；需要 ${requiredAir}，允许的 baseModel：${allowedBases}`;
}

export function parseCivitaiLoraAir(value: string): ParsedCivitaiLoraAir | undefined {
    const air = String(value || "").trim();
    const match = FULL_LORA_AIR_PATTERN.exec(air);
    if (!match) return undefined;
    const ecosystem = match[1].toLowerCase();
    const modelId = normalizePositiveIntegerString(match[2]);
    const modelVersionId = normalizePositiveIntegerString(match[3]);
    if (!modelId || !modelVersionId) return undefined;
    return {
        // This is a wire identifier, not a value to reconstruct or normalize.
        // In particular, `air` from model-versions/{id} must reach loras intact.
        air,
        ecosystem,
        modelId,
        modelVersionId,
    };
}

export function assertCivitaiLoraCompatibility(
    resource: Pick<ParsedCivitaiLoraAir, "air" | "ecosystem"> & { readonly baseModel?: string },
    targetModel: string,
) {
    // Flux2 Dev / WAN image live schemas take `{air,strength}[]` and do not
    // publish an ecosystem/baseModel allow-list. Complete AIR is still required.
    if (isCivitaiArrayLoraService(targetModel)) return;
    const target = resolveCivitaiLoraCompatibilityTarget(targetModel);
    if (!target) {
        throw new Error(civitaiLoraUnsupportedMessage(targetModel));
    }
    if (!target.ecosystems.some((value) => normalizeComparable(value) === normalizeComparable(resource.ecosystem))) {
        throw new Error(civitaiLoraMismatchMessage(resource, target));
    }
    const baseModel = resource.baseModel;
    if (baseModel && !target.baseModels.some((value) => normalizeComparable(value) === normalizeComparable(baseModel))) {
        throw new Error(civitaiLoraMismatchMessage(resource, target));
    }
}

export function createCivitaiLoraResolver(options: CivitaiLoraResolverOptions = {}) {
    const request = options.request || requestCivitaiJson;
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const now = options.now || Date.now;
    const cache = new Map<string, CachedRequest>();

    const cachedRequest = (path: string, forceRefresh = false) => {
        const currentTime = now();
        const cached = cache.get(path);
        if (!forceRefresh && cached && cached.expiresAt > currentTime) return cached.promise;

        const promise = Promise.resolve()
            .then(() => request(path))
            .catch((error) => {
                if (cache.get(path)?.promise === promise) cache.delete(path);
                throw error;
            });
        cache.set(path, { expiresAt: currentTime + Math.max(0, cacheTtlMs), promise });
        return promise;
    };

    const resolveVersion = async (
        versionId: string,
        sourceKind: CivitaiLoraResourceKind,
        sourceValue: string,
        targetModel: string,
        forceRefresh: boolean,
        expectedModelId?: string,
    ): Promise<CivitaiLoraResolution> => {
        const value = await cachedRequest(`/model-versions/${encodeURIComponent(versionId)}`, forceRefresh);
        const version = parseModelVersionResponse(value, versionId);
        if (expectedModelId && version.modelId !== expectedModelId) {
            throw new Error(`版本 ID ${versionId} 不属于模型 ID ${expectedModelId}；不会改用其它版本`);
        }
        assertCivitaiLoraCompatibility(version, targetModel);
        return {
            status: "resolved",
            resource: {
                ...version,
                sourceKind,
                sourceValue,
            },
        };
    };

    const resolve = async (input: CivitaiLoraResolveInput): Promise<CivitaiLoraResolution> => {
        const value = String(input.value || "").trim();
        if (!value) throw new Error("请填写 Civitai LoRA AIR、模型 ID 或版本 ID");
        if (/^https?:\/\//i.test(value)) {
            throw new Error("Civitai 官方没有下载 URL → AIR 的确定性反查合同；请改用 AIR、模型 ID 或版本 ID");
        }

        if (input.kind === "air") {
            const parsed = parseCivitaiLoraAir(value);
            if (!parsed) throw new Error("AIR 必须是完整的 Civitai LoRA model-version AIR，例如 urn:air:<生态>:lora:civitai:<modelId>@<versionId>");
            assertCivitaiLoraCompatibility(parsed, input.targetModel);
            return {
                status: "resolved",
                resource: {
                    ...parsed,
                    sourceKind: "air",
                    sourceValue: value,
                },
            };
        }

        const id = normalizePositiveIntegerString(value);
        if (!id) throw new Error(`${input.kind === "model-id" ? "模型" : "版本"} ID 必须是正整数；下载 URL 不受支持`);
        if (input.kind === "version-id") {
            return resolveVersion(id, "version-id", value, input.targetModel, Boolean(input.forceRefresh));
        }

        const modelValue = await cachedRequest(`/models/${encodeURIComponent(id)}`, Boolean(input.forceRefresh));
        const model = parseModelResponse(modelValue, id, input.targetModel);
        if (input.selectedVersionId) {
            const selectedVersionId = normalizePositiveIntegerString(input.selectedVersionId);
            if (!selectedVersionId) throw new Error("选择的模型版本 ID 无效");
            if (!model.versions.some((version) => version.modelVersionId === selectedVersionId)) {
                throw new Error(`版本 ID ${selectedVersionId} 不属于模型 ID ${id}`);
            }
            return resolveVersion(selectedVersionId, "model-id", value, input.targetModel, Boolean(input.forceRefresh), id);
        }
        if (model.versions.length === 1) {
            return resolveVersion(model.versions[0].modelVersionId, "model-id", value, input.targetModel, Boolean(input.forceRefresh), id);
        }
        return {
            status: "version-selection-required",
            sourceKind: "model-id",
            sourceValue: value,
            modelId: id,
            modelName: model.name,
            versions: model.versions,
        };
    };

    return {
        resolve,
        clearCache() {
            cache.clear();
        },
    };
}

const defaultCivitaiLoraResolver = createCivitaiLoraResolver();

export function resolveCivitaiLoraResource(input: CivitaiLoraResolveInput) {
    return defaultCivitaiLoraResolver.resolve(input);
}

async function requestCivitaiJson(path: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${CIVITAI_API_BASE_URL}${path}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        const text = await response.text();
        let payload: unknown;
        try {
            payload = text ? JSON.parse(text) : undefined;
        } catch {
            throw new Error(`Civitai 资源接口返回了非 JSON 响应（HTTP ${response.status}）`);
        }
        if (!response.ok) {
            const detail = isRecord(payload) && typeof payload.error === "string" ? `：${payload.error}` : "";
            if (response.status === 429) throw new Error(`Civitai 资源接口请求过于频繁（HTTP 429）${detail}；请稍后重试`);
            throw new Error(`Civitai 资源解析失败（HTTP ${response.status}）${detail}`);
        }
        return payload;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw new Error("Civitai 资源解析超时，请检查网络后重试");
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function parseModelVersionResponse(value: unknown, requestedVersionId: string): Omit<ResolvedCivitaiLoraResource, "sourceKind" | "sourceValue"> {
    if (!isRecord(value)) throw new Error("Civitai model-version 响应格式无效");
    const modelVersionId = normalizePositiveIntegerString(value.id);
    const modelId = normalizePositiveIntegerString(value.modelId);
    if (!modelVersionId || modelVersionId !== requestedVersionId || !modelId) {
        throw new Error("Civitai model-version 响应的 model/version identity 无效或与请求不一致");
    }
    const model = isRecord(value.model) ? value.model : undefined;
    if (String(model?.type || "").trim().toUpperCase() !== "LORA") {
        throw new Error(`Civitai 版本 ${modelVersionId} 不是 LoRA（model.type=${String(model?.type || "未返回")}）`);
    }
    const parsedAir = typeof value.air === "string" ? parseCivitaiLoraAir(value.air) : undefined;
    if (!parsedAir) throw new Error(`Civitai 版本 ${modelVersionId} 未返回有效的完整 LoRA AIR；不会自行拼接`);
    if (parsedAir.modelId !== modelId || parsedAir.modelVersionId !== modelVersionId) {
        throw new Error(`Civitai 版本 ${modelVersionId} 返回的 AIR 与 model/version identity 不一致`);
    }
    return {
        ...parsedAir,
        baseModel: optionalString(value.baseModel),
        baseModelType: optionalString(value.baseModelType),
        modelName: optionalString(model?.name),
        versionName: optionalString(value.name),
    };
}

function parseModelResponse(value: unknown, requestedModelId: string, targetModel: string) {
    if (!isRecord(value)) throw new Error("Civitai model 响应格式无效");
    const modelId = normalizePositiveIntegerString(value.id);
    if (!modelId || modelId !== requestedModelId) throw new Error("Civitai model 响应的模型 identity 与请求不一致");
    if (String(value.type || "").trim().toUpperCase() !== "LORA") {
        throw new Error(`Civitai 模型 ${modelId} 不是 LoRA（type=${String(value.type || "未返回")}）`);
    }
    if (!Array.isArray(value.modelVersions) || !value.modelVersions.length) {
        throw new Error(`Civitai 模型 ${modelId} 没有可选择的 modelVersions`);
    }
    const target = resolveCivitaiLoraCompatibilityTarget(targetModel);
    if (!target && !isCivitaiArrayLoraService(targetModel)) throw new Error(civitaiLoraUnsupportedMessage(targetModel));
    const versions = value.modelVersions.map((entry, index): CivitaiLoraVersionOption => {
        if (!isRecord(entry)) throw new Error(`Civitai 模型 ${modelId} 的第 ${index + 1} 个 modelVersion 格式无效`);
        const modelVersionId = normalizePositiveIntegerString(entry.id);
        if (!modelVersionId) throw new Error(`Civitai 模型 ${modelId} 的第 ${index + 1} 个 modelVersion 缺少有效 ID`);
        const baseModel = optionalString(entry.baseModel);
        const compatible = !target
            ? null
            : baseModel
              ? target.baseModels.some((candidate) => normalizeComparable(candidate) === normalizeComparable(baseModel))
              : null;
        return {
            modelVersionId,
            name: optionalString(entry.name) || `版本 ${modelVersionId}`,
            ...(baseModel ? { baseModel } : {}),
            compatible,
            ...(compatible === false && target ? { compatibilityError: `baseModel=${baseModel} 与 ${target.label} 不兼容` } : {}),
        };
    });
    return { modelId, name: optionalString(value.name), versions };
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

function normalizeComparable(value: string) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
