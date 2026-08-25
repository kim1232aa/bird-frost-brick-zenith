export function resolveCanvasImagePlaceholderModel(
  savedModel: unknown,
  configuredModels: readonly unknown[] = [],
) {
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
