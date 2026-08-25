import type { ReferenceImage } from "@/types/image";
import {
  writeImageAdvancedSettings,
  type ImageAdvancedSettings,
} from "@/stores/image-advanced-settings";
import type { AiConfig } from "@/stores/use-config-store";
import type { UploadedImage } from "@/services/image-storage";
import type { CanvasNodeMetadata } from "../types";
import type { ResolvedImageModelCapability } from "@/services/api/image-model-capabilities";

export type DurableCanvasMaskReference = {
  storageKey: string;
  name: string;
  type: string;
};

/**
 * Decide whether a retry must hydrate its recorded references. Optional-image
 * generate requests keep every recorded reference; text-only generate and
 * Responses requests do not manufacture a source-image requirement.
 */
export function shouldReplayCanvasImageReferences(
  operation: CanvasNodeMetadata["imageOperation"],
  metadata:
    | Pick<
        CanvasNodeMetadata,
        "references"
      >
    | undefined,
) {
  if (operation === "edit" || operation === "variation") return true;
  return Boolean(metadata?.references?.length);
}

export function retryImageReferenceSnapshotError(
  _operation: CanvasNodeMetadata["imageOperation"],
  _metadata:
    | Pick<CanvasNodeMetadata, "references">
    | undefined,
  _isStoryImage: boolean,
) {
  return undefined;
}

export function snapshotCanvasImageReferenceUrls(
  references: readonly ReferenceImage[],
) {
  return references.map((image, index) => {
    const value = image.storageKey || image.url;
    if (!value) {
      throw new Error(
        `参考图 ${index + 1} 无法持久化重试快照；已停止提交`,
      );
    }
    return value;
  });
}

/** Replay the exact recorded image route even when another provider now exposes the same model id. */
export function restoreCanvasImageRetryConfig(
  config: AiConfig,
  metadata:
    | Pick<CanvasNodeMetadata, "imageAdvancedScope" | "imageAdvancedSettings">
    | undefined,
): AiConfig {
  const scope = metadata?.imageAdvancedScope;
  if (!scope?.providerId || !scope.model) return config;

  const imageAdvancedSettingsByScope = metadata?.imageAdvancedSettings
    ? writeImageAdvancedSettings(
        config.imageAdvancedSettingsByScope,
        scope,
        metadata.imageAdvancedSettings,
      )
    : config.imageAdvancedSettingsByScope;
  return {
    ...config,
    model: scope.model,
    imageModel: scope.model,
    requestModelSelections: {
      ...config.requestModelSelections,
      image: { providerId: scope.providerId, model: scope.model },
    },
    apiRouting: {
      ...config.apiRouting,
      image: {
        source: "relay",
        providerId: scope.providerId,
        model: scope.model,
      },
    },
    apiBoardRouting: {
      ...config.apiBoardRouting,
      imageGeneration: {
        mode: "custom",
        providerId: scope.providerId,
        model: scope.model,
      },
    },
    imageAdvancedSettingsByScope,
  };
}

/**
 * Existing-image edits always submit edit targets first, then connected/@mentioned
 * references. The composer numbers only the latter, so its labels are shifted by
 * the exact target prefix length.
 */
export function buildCanvasImageEditPlan(
  prompt: string,
  editTargets: readonly ReferenceImage[],
  additionalReferences: readonly ReferenceImage[],
) {
  const targets = stableUniqueReferences(editTargets);
  const targetKeys = new Set(targets.map(referenceIdentity));
  const distinctAdditionalReferences = stableUniqueReferences(
    additionalReferences,
  ).filter((reference) => !targetKeys.has(referenceIdentity(reference)));
  const references = stableUniqueReferences([
    ...targets,
    ...distinctAdditionalReferences,
  ]);
  return {
    references,
    prompt:
      targets.length && distinctAdditionalReferences.length
        ? shiftImageReferenceLabels(prompt, targets.length)
        : prompt,
  };
}

export function buildCanvasMaskReferenceMetadata(
  uploaded: Pick<UploadedImage, "storageKey" | "mimeType">,
  name: string,
): DurableCanvasMaskReference {
  return {
    storageKey: uploaded.storageKey,
    name,
    type: uploaded.mimeType || "image/png",
  };
}

export function restoreCanvasMaskReference(
  metadata: DurableCanvasMaskReference | undefined,
): ReferenceImage | undefined {
  if (!metadata?.storageKey) return undefined;
  return {
    id: `${metadata.storageKey}:mask`,
    name: metadata.name || "mask.png",
    type: metadata.type || "image/png",
    dataUrl: "",
    storageKey: metadata.storageKey,
  };
}

export function canvasImageBatchResultPolicy(
  capability: ResolvedImageModelCapability,
  settings: ImageAdvancedSettings | undefined,
): "exact-count" | "partial-valid" {
  return settings?.sequential === true &&
    capability.advancedFields.sequential.state === "supported"
    ? "partial-valid"
    : "exact-count";
}

function stableUniqueReferences(references: readonly ReferenceImage[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const identity = referenceIdentity(reference);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function referenceIdentity(reference: ReferenceImage) {
  return (
    reference.storageKey ||
    reference.url ||
    reference.dataUrl ||
    `id:${reference.id}`
  );
}

function shiftImageReferenceLabels(prompt: string, offset: number) {
  if (offset < 1) return prompt;
  return prompt.replace(/图片(\d+)/g, (_match, rawIndex: string) => {
    const index = Number(rawIndex);
    return Number.isSafeInteger(index) && index > 0
      ? `图片${index + offset}`
      : `图片${rawIndex}`;
  });
}
