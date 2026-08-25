export function needsCanvasImageUrlResolution(source: string | undefined) {
    return Boolean(source?.startsWith("image:"));
}

/** Resolve retained image keys for presentation only; all other browser-safe URLs pass through unchanged. */
export async function resolveCanvasImagePreviewSource(
    source: string | undefined,
    resolveImageUrl: (storageKey?: string, fallback?: string) => Promise<string | null>,
) {
    if (!source) return "";
    return needsCanvasImageUrlResolution(source)
        ? (await resolveImageUrl(source, "")) || ""
        : source;
}
