import type { CanvasNodeMetadata } from "../types";

export const STORY_DIRECTOR_TEXT_MODEL_INHERIT =
  "__inherit_story_director_text_model__";

export type StoryDirectorTextModelSelection = {
  providerId: string;
  model: string;
};

export type StoryDirectorTextModelSourceOption = StoryDirectorTextModelSelection & {
  value: string;
  label: string;
  providerName?: string;
};

export type StoryDirectorTextModelOption = {
  value: string;
  label: string;
  model?: string;
  providerId?: string;
};

export type AvailableProviderModelResolution = {
  status: "resolved" | "ambiguous" | "unavailable" | "empty";
  selection: StoryDirectorTextModelSelection | null;
  legacyModel: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isProviderModelSelection(
  value: unknown,
): value is StoryDirectorTextModelSelection {
  return Boolean(
    value &&
      typeof value === "object" &&
      cleanText((value as StoryDirectorTextModelSelection).providerId) &&
      cleanText((value as StoryDirectorTextModelSelection).model),
  );
}

function normalizedProviderOptions(
  availableTextModels: readonly unknown[] | undefined,
) {
  const options: StoryDirectorTextModelSourceOption[] = [];
  const seen = new Set<string>();
  for (const candidate of availableTextModels || []) {
    if (!candidate || typeof candidate !== "object") continue;
    const source = candidate as Partial<StoryDirectorTextModelSourceOption>;
    const providerId = cleanText(source.providerId);
    const model = cleanText(source.model);
    if (!providerId || !model) continue;
    const key = `${providerId}\u0000${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      providerId,
      model,
      value: cleanText(source.value) || key,
      label:
        cleanText(source.label) ||
        `${cleanText(source.providerName) || providerId} · ${model}`,
      providerName: cleanText(source.providerName) || providerId,
    });
  }
  return options;
}

function normalizedLegacyTextModels(
  availableTextModels: readonly unknown[] | undefined,
) {
  const models = (availableTextModels || [])
    .map((model) => cleanText(model))
    .filter(Boolean);
  return Array.from(new Set(models));
}

function usesProviderOptions(availableTextModels: readonly unknown[] | undefined) {
  return normalizedProviderOptions(availableTextModels).length > 0;
}

function savedStoryDirectorTextModel(metadata?: Partial<CanvasNodeMetadata>) {
  return cleanText(metadata?.storyDirectorTextModel);
}

function savedStoryDirectorTextModelSelection(
  metadata?: Partial<CanvasNodeMetadata>,
): StoryDirectorTextModelSelection | string {
  const model = savedStoryDirectorTextModel(metadata);
  const providerId = cleanText(metadata?.storyDirectorTextModelProviderId);
  return model && providerId ? { providerId, model } : model;
}

export function resolveAvailableProviderModelSelection(
  requested: StoryDirectorTextModelSelection | string | null | undefined,
  availableTextModels: readonly unknown[] = [],
): AvailableProviderModelResolution {
  const options = normalizedProviderOptions(availableTextModels);
  if (isProviderModelSelection(requested)) {
    const selection = {
      providerId: cleanText(requested.providerId),
      model: cleanText(requested.model),
    };
    const exact = options.find(
      (option) =>
        option.providerId === selection.providerId &&
        option.model === selection.model,
    );
    return exact
      ? { status: "resolved", selection, legacyModel: "" }
      : { status: "unavailable", selection: null, legacyModel: selection.model };
  }

  const model = cleanText(requested);
  if (!model) return { status: "empty", selection: null, legacyModel: "" };
  const owners = options.filter((option) => option.model === model);
  if (owners.length === 1) {
    return {
      status: "resolved",
      selection: { providerId: owners[0].providerId, model: owners[0].model },
      legacyModel: "",
    };
  }
  if (owners.length > 1) {
    return { status: "ambiguous", selection: null, legacyModel: model };
  }
  return {
    status: "unavailable",
    selection: null,
    legacyModel: model,
  };
}

export function resolveStoryDirectorTextModelSelection(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedTextModel: StoryDirectorTextModelSelection | string | null | undefined,
  availableTextModels: readonly unknown[] = [],
) {
  const requested =
    metadata?.storyDirectorTextModelMode === "custom"
      ? savedStoryDirectorTextModelSelection(metadata)
      : inheritedTextModel;
  return resolveAvailableProviderModelSelection(requested, availableTextModels);
}

export function hasCustomStoryDirectorTextModel(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  availableTextModels: readonly unknown[] = [],
) {
  if (metadata?.storyDirectorTextModelMode !== "custom") return false;
  if (!usesProviderOptions(availableTextModels)) {
    return normalizedLegacyTextModels(availableTextModels).includes(
      savedStoryDirectorTextModel(metadata),
    );
  }
  return (
    resolveStoryDirectorTextModelSelection(
      metadata,
      null,
      availableTextModels,
    ).status === "resolved"
  );
}

export function resolveStoryDirectorTextModel(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedTextModel: StoryDirectorTextModelSelection | string | null | undefined,
  availableTextModels: readonly unknown[] = [],
) {
  if (!usesProviderOptions(availableTextModels)) {
    const models = normalizedLegacyTextModels(availableTextModels);
    if (metadata?.storyDirectorTextModelMode === "custom") {
      const savedModel = savedStoryDirectorTextModel(metadata);
      return models.includes(savedModel) ? savedModel : "";
    }
    const inherited = cleanText(inheritedTextModel);
    return models.includes(inherited) ? inherited : "";
  }
  return (
    resolveStoryDirectorTextModelSelection(
      metadata,
      inheritedTextModel,
      availableTextModels,
    ).selection?.model || ""
  );
}

function unresolvedOption(
  requested: StoryDirectorTextModelSelection | string,
  status: AvailableProviderModelResolution["status"],
): StoryDirectorTextModelOption {
  const selection = isProviderModelSelection(requested) ? requested : null;
  const model = selection?.model || cleanText(requested);
  const provider = selection?.providerId;
  const reason = status === "ambiguous" ? "请选择 provider" : "provider 不可用";
  return {
    value: `__unresolved_story_director_text_model__:${encodeURIComponent(
      JSON.stringify([provider || "", model]),
    )}`,
    label: `${provider ? `${provider} · ` : ""}${model}（${reason}）`,
    model,
    ...(provider ? { providerId: provider } : {}),
  };
}

export function resolveStoryDirectorTextModelPresentation(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedTextModel: StoryDirectorTextModelSelection | string | null | undefined,
  availableTextModels: readonly unknown[] = [],
) {
  if (!usesProviderOptions(availableTextModels)) {
    const models = normalizedLegacyTextModels(availableTextModels);
    const requestedInherited = cleanText(inheritedTextModel);
    const inheritedAvailable = models.includes(requestedInherited);
    const inheritLabel = requestedInherited
      ? `继承：${requestedInherited}${inheritedAvailable ? "" : "（provider 不可用）"}`
      : "";
    const savedModel = savedStoryDirectorTextModel(metadata);
    const customMode = metadata?.storyDirectorTextModelMode === "custom";
    const customAvailable = models.includes(savedModel);
    const unresolvedCustom =
      customMode && savedModel && !customAvailable
        ? unresolvedOption(savedModel, "unavailable")
        : undefined;
    const selectedValue =
      customMode
        ? customAvailable
          ? savedModel
          : unresolvedCustom?.value || ""
        : requestedInherited
          ? STORY_DIRECTOR_TEXT_MODEL_INHERIT
          : "";
    const options: StoryDirectorTextModelOption[] = [
      ...(requestedInherited
        ? [
            {
              value: STORY_DIRECTOR_TEXT_MODEL_INHERIT,
              label: inheritLabel,
              model: requestedInherited,
            },
          ]
        : []),
      ...(unresolvedCustom ? [unresolvedCustom] : []),
      ...models.map((model) => ({ value: model, label: model, model })),
    ];
    return {
      selectedValue,
      options,
      title:
        options.find((option) => option.value === selectedValue)?.label ||
        "选择模型",
    };
  }

  const sourceOptions = normalizedProviderOptions(availableTextModels);
  const inheritedResolution = resolveAvailableProviderModelSelection(
    inheritedTextModel,
    sourceOptions,
  );
  const inheritedOption = inheritedResolution.selection
    ? sourceOptions.find(
        (option) =>
          option.providerId === inheritedResolution.selection?.providerId &&
          option.model === inheritedResolution.selection?.model,
      )
    : undefined;
  const unresolvedInherited =
    !inheritedOption && inheritedResolution.status !== "empty"
      ? unresolvedOption(
          inheritedTextModel as StoryDirectorTextModelSelection | string,
          inheritedResolution.status,
        )
      : undefined;
  const inheritedDisplayOption = inheritedOption || unresolvedInherited;
  const inheritLabel = inheritedDisplayOption
    ? `继承：${inheritedDisplayOption.label}`
    : "";
  const customRequested = savedStoryDirectorTextModelSelection(metadata);
  const customResolution = resolveAvailableProviderModelSelection(
    customRequested,
    sourceOptions,
  );
  const customOption = customResolution.selection
    ? sourceOptions.find(
        (option) =>
          option.providerId === customResolution.selection?.providerId &&
          option.model === customResolution.selection?.model,
      )
    : undefined;
  const unresolvedCustom =
    metadata?.storyDirectorTextModelMode === "custom" &&
    customRequested &&
    !customOption
      ? unresolvedOption(customRequested, customResolution.status)
      : undefined;
  const selectedValue =
    metadata?.storyDirectorTextModelMode === "custom"
      ? customOption?.value || unresolvedCustom?.value || ""
      : inheritedDisplayOption
        ? STORY_DIRECTOR_TEXT_MODEL_INHERIT
        : "";
  const options: StoryDirectorTextModelOption[] = [
    ...(inheritedDisplayOption
      ? [
          {
            value: STORY_DIRECTOR_TEXT_MODEL_INHERIT,
            label: inheritLabel,
            model: inheritedDisplayOption.model,
            providerId: inheritedDisplayOption.providerId,
          },
        ]
      : []),
    ...(unresolvedCustom ? [unresolvedCustom] : []),
    ...sourceOptions,
  ];
  return {
    selectedValue,
    options,
    title:
      options.find((option) => option.value === selectedValue)?.label ||
      "选择模型",
  };
}

export const STORY_DIRECTOR_IMAGE_MODEL_INHERIT =
  "__inherit_story_director_image_model__";

export function resolveStoryDirectorImageModelPresentation(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedImageModel: StoryDirectorTextModelSelection | string | null | undefined,
  availableImageModels: readonly unknown[] = [],
) {
  return resolveStoryDirectorTextModelPresentation(
    {
      ...metadata,
      storyDirectorTextModel: metadata?.storyDirectorImageModel,
      storyDirectorTextModelProviderId: metadata?.storyDirectorImageModelProviderId,
      storyDirectorTextModelMode: metadata?.storyDirectorImageModelMode,
    },
    inheritedImageModel,
    availableImageModels,
  );
}

export function resolveStoryDirectorImageModelSelection(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedImageModel: StoryDirectorTextModelSelection | string | null | undefined,
  availableImageModels: readonly unknown[] = [],
) {
  return resolveStoryDirectorTextModelSelection(
    {
      ...metadata,
      storyDirectorTextModel: metadata?.storyDirectorImageModel,
      storyDirectorTextModelProviderId: metadata?.storyDirectorImageModelProviderId,
      storyDirectorTextModelMode: metadata?.storyDirectorImageModelMode,
    },
    inheritedImageModel,
    availableImageModels,
  );
}

export function storyDirectorImageModelPatchForValue(
  value: string,
  availableImageModels: readonly unknown[] = [],
): Pick<
  CanvasNodeMetadata,
  | "storyDirectorImageModelMode"
  | "storyDirectorImageModel"
  | "storyDirectorImageModelProviderId"
> | null {
  const patch = storyDirectorTextModelPatchForValue(value, availableImageModels);
  if (!patch) return null;
  return {
    storyDirectorImageModelMode: patch.storyDirectorTextModelMode,
    storyDirectorImageModel: patch.storyDirectorTextModel,
    storyDirectorImageModelProviderId: patch.storyDirectorTextModelProviderId,
  };
}

export function storyDirectorTextModelPatchForValue(
  value: string,
  availableTextModels: readonly unknown[] = [],
): Pick<
  CanvasNodeMetadata,
  | "storyDirectorTextModelMode"
  | "storyDirectorTextModel"
  | "storyDirectorTextModelProviderId"
> | null {
  if (value === STORY_DIRECTOR_TEXT_MODEL_INHERIT) {
    return {
      storyDirectorTextModelMode: "inherit",
      storyDirectorTextModel: "",
      storyDirectorTextModelProviderId: "",
    };
  }
  const option = normalizedProviderOptions(availableTextModels).find(
    (candidate) => candidate.value === value,
  );
  return option
    ? {
        storyDirectorTextModelMode: "custom",
        storyDirectorTextModelProviderId: option.providerId,
        storyDirectorTextModel: option.model,
      }
    : null;
}
