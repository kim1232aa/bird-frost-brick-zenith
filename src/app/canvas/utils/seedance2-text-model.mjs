function normalizeModel(model) {
  return typeof model === "string" ? model.trim() : "";
}

export function buildSeedance2PromptTextModelValues(input, isTextModel) {
  const configuredModels = (Array.isArray(input.configuredTextModels)
    ? input.configuredTextModels
    : [])
    .map(normalizeModel)
    .filter((model, index, all) =>
      Boolean(model) && isTextModel(model) && all.indexOf(model) === index,
    );
  const configuredSet = new Set(configuredModels);
  const candidates = [
    input.savedModel,
    input.currentTextModel,
    input.defaultTextModel,
    ...configuredModels,
  ];

  return candidates
    .map(normalizeModel)
    .filter(
      (model, index, all) =>
        configuredSet.has(model) && all.indexOf(model) === index,
    );
}

export function resolveSeedance2PromptTextModel(input, isTextModel) {
  return buildSeedance2PromptTextModelValues(input, isTextModel)[0] || "";
}
