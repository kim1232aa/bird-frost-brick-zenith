export function resolveCanvasImagePlaceholderModel(savedModel, configuredModels = []) {
  const models = Array.from(
    new Set(
      configuredModels
        .map((model) => (typeof model === "string" ? model.trim() : ""))
        .filter(Boolean),
    ),
  );
  const saved = typeof savedModel === "string" ? savedModel.trim() : "";
  return saved && models.includes(saved) ? saved : models[0] || "";
}
