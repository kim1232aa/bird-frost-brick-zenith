export function needsCanvasImageUrlResolution(source) {
  return Boolean(source?.startsWith("image:"));
}

export async function resolveCanvasImagePreviewSource(source, resolveImageUrl) {
  if (!source) return "";
  return needsCanvasImageUrlResolution(source)
    ? (await resolveImageUrl(source, "")) || ""
    : source;
}
