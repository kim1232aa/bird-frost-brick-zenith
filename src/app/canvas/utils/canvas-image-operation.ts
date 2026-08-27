import { resolveImageSettingsContext } from "@/components/provider-settings-context";
import { readCivitaiCatalogServiceSnapshot } from "@/services/api/civitai-client";
import { CIVITAI_FALLBACK_SERVICES, resolveCivitaiService } from "@/services/api/civitai-services";
import {
  nativeImageAdapterType,
  validateImageModelRequest,
  type ResolvedImageModelCapability,
} from "@/services/api/image-model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasImageOperation, CanvasNodeMetadata } from "../types";

export const CANVAS_IMAGE_OPERATION_OPTIONS: Array<{ label: string; value: CanvasImageOperation }> = [
  { label: "生成图片", value: "generate" },
  { label: "编辑图片", value: "edit" },
  { label: "创建变体", value: "variation" },
  { label: "Responses 图片工具", value: "responses-tool" },
];

export const CANVAS_IMAGE_OPERATION_EMPTY_HINT = "当前模型不支持此参考图组合，请改选编辑服务";

function providerFamilyOps(config: AiConfig): CanvasImageOperation[] {
  try {
    const context = resolveImageSettingsContext(config, "generate");
    const adapter = nativeImageAdapterType(context.provider);
    const model = String(context.capability?.model || "").toLowerCase();
    if (adapter === "civitai") return ["generate", "edit", "variation"];
    if (adapter === "agnes" || adapter === "dashscope" || adapter === "ark" || adapter === "sensenova-miaohua") {
      return ["generate", "edit"];
    }
    if (adapter === "sensenova") return ["generate"];
    if (model.includes("dall-e-2") || model.includes("dalle-2")) return ["generate", "edit", "variation"];
    if (model.includes("gpt-image") || model.includes("grok-imagine-image") || (model.includes("gemini") && model.includes("image")) || model.includes("agnes-image") || model.includes("seedream") || model.includes("qwen-image") || model.includes("wan2")) {
      return ["generate", "edit"];
    }
    if (adapter === "openai") return ["generate", "edit"];
  } catch {
    /* keep generate visible */
  }
  return ["generate", "edit"];
}

export function resolveCanvasImageOperationOptions(
  config: AiConfig,
  referenceCount?: number,
  options?: { readonly compatibleOnly?: boolean },
) {
  const family = new Set(providerFamilyOps(config));
  const filtered = CANVAS_IMAGE_OPERATION_OPTIONS.filter((option) => {
    if (!family.has(option.value)) return false;
    if (options?.compatibleOnly === true) {
      return !canvasImageOperationCapabilityError(config, option.value, referenceCount);
    }
    return true;
  });
  if (filtered.length) return filtered;
  return CANVAS_IMAGE_OPERATION_OPTIONS.filter((option) => option.value === "generate");
}

export function resolveStoryWorkflowImageOperation(
  capabilities: {
    readonly generate: ResolvedImageModelCapability;
    readonly edit?: ResolvedImageModelCapability;
  },
  referenceIntent?: boolean,
): CanvasImageOperation {
  const referenceCount = referenceIntent ? 1 : 0;
  const candidates: ResolvedImageModelCapability[] = [
    capabilities.generate,
    ...(referenceIntent && capabilities.edit ? [capabilities.edit] : []),
  ];
  const checked = candidates.map((capability) => ({
    capability,
    validation: validateImageModelRequest(capability, {
      operation: capability.operation,
      referenceCount,
      prompt: "Story image",
    }),
  }));
  const selected = checked.find(({ capability, validation }) =>
    capability.availability.state === "supported" &&
    (!referenceIntent || capability.referenceCount.state === "supported") &&
    !validation.errors.some((issue) =>
      issue.field === "operation" || issue.field === "referenceCount"
    ),
  );
  if (selected) return selected.capability.operation;

  const reasons = checked.flatMap(({ capability, validation }) => [
    ...(capability.availability.state === "supported"
      ? []
      : [capability.availability.reason]),
    ...(referenceIntent && capability.referenceCount.state !== "supported"
      ? [capability.referenceCount.reason]
      : []),
    ...validation.errors
      .filter((issue) => issue.field === "operation" || issue.field === "referenceCount")
      .map((issue) => issue.message),
  ]);
  throw new Error(
    [...new Set(reasons)].join("；") ||
      "当前 provider/model 没有可用于 Story 图片工作流的已验证 operation",
  );
}

export function canvasImageOperationCapabilityError(
  config: AiConfig,
  operation: CanvasImageOperation | undefined,
  referenceCount?: number,
) {
  if (!operation) return undefined;
  const context = resolveImageSettingsContext(config, operation);
  if (context.routeError) return context.routeError;
  const availability = context.capability.availability;
  if (availability.state !== "supported") {
    return `${context.capability.providerLabel} / ${context.capability.model || "未命名模型"}：${availability.reason}`;
  }
  if (referenceCount === undefined) return undefined;
  return validateImageModelRequest(context.capability, {
    operation,
    referenceCount,
    prompt: operation === "responses-tool" ? "reference image request" : undefined,
  }).errors.find((issue) => issue.field === "operation" || issue.field === "referenceCount")?.message;
}

function isCanvasImageOperation(value: unknown): value is CanvasImageOperation {
  return CANVAS_IMAGE_OPERATION_OPTIONS.some((option) => option.value === value);
}

export function resolveCanvasImageOperation(
  metadata: CanvasNodeMetadata | undefined,
  _input: { referenceCount: number; hasImageContent?: boolean },
): CanvasImageOperation | undefined {
  if (isCanvasImageOperation(metadata?.imageOperation)) return metadata.imageOperation;
  if (metadata?.generationType === "edit") return "edit";
  if (metadata?.generationType === "generation") return "generate";
  return undefined;
}

export function canvasImageOperationInputError(
  operation: CanvasImageOperation | undefined,
  input: { prompt: string; referenceCount: number },
): string | undefined {
  if (!operation) return "缺少已持久化的图片 operation；请选择图片操作。所有参考图保持原样。";
  if (operation === "variation" && input.referenceCount !== 1) return `创建变体必须且只能连接 1 张源图；当前为 ${input.referenceCount} 张`;
  if (operation === "responses-tool" && !input.prompt.trim()) return "Responses 图片工具需要非空提示词";
  if ((operation === "generate" || operation === "edit") && !input.prompt.trim()) return operation === "edit" ? "编辑图片需要提示词" : "生成图片需要提示词";
  return undefined;
}

export function legacyCanvasImageGenerationType(operation: CanvasImageOperation) {
  return operation === "edit" || operation === "variation" || operation === "responses-tool" ? "edit" as const : "generation" as const;
}

function currentImageModelId(config: AiConfig) {
  return String(resolveImageSettingsContext(config, "generate").capability.model || "").trim();
}

function civitaiSiblingCandidate(currentId: string, target: "editImage" | "createVariant") {
  if (currentId.includes("/createImage/")) return currentId.replace("/createImage/", `/${target}/`);
  if (currentId.endsWith("/createImage")) return currentId.replace(/\/createImage$/u, `/${target}`);
  return "";
}

function lookupCivitaiService(id: string) {
  return readCivitaiCatalogServiceSnapshot(id) || resolveCivitaiService(id);
}

function civitaiServiceFamilyKey(service: { readonly parameters: Readonly<Record<string, string>> }) {
  return [
    String(service.parameters.engine || "").toLowerCase(),
    String(service.parameters.ecosystem || "").toLowerCase(),
    String(service.parameters.model || "").toLowerCase(),
    String(service.parameters.modelVersion || service.parameters.version || "").toLowerCase(),
  ].join("\0");
}

export function resolveCivitaiCanvasOperationSibling(
  config: AiConfig,
  operation: Extract<CanvasImageOperation, "edit" | "variation">,
) {
  const currentId = currentImageModelId(config);
  const target = operation === "edit" ? "editImage" : "createVariant";
  const candidate = civitaiSiblingCandidate(currentId, target);
  if (candidate && candidate !== currentId) {
    const sibling = lookupCivitaiService(candidate);
    if (sibling?.id) return sibling.id;
  }
  const current = lookupCivitaiService(currentId);
  if (!current) return undefined;
  const wanted = target.toLowerCase();
  const family = civitaiServiceFamilyKey(current);
  const match = CIVITAI_FALLBACK_SERVICES.find((service) => {
    if (service.step !== "imageGen" || service.id === current.id) return false;
    if (String(service.parameters.operation || "").toLowerCase() !== wanted) return false;
    return civitaiServiceFamilyKey(service) === family;
  });
  return match?.id;
}

export function resolveCanvasImageOperationChange(
  config: AiConfig,
  operation: CanvasImageOperation,
): { imageOperation: CanvasImageOperation; model?: string } {
  if (operation !== "edit" && operation !== "variation") return { imageOperation: operation };
  if (!canvasImageOperationCapabilityError(config, operation, 1)) return { imageOperation: operation };
  const sibling = resolveCivitaiCanvasOperationSibling(config, operation);
  return sibling ? { imageOperation: operation, model: sibling } : { imageOperation: operation };
}
