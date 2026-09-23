export function needsCanvasImageUrlResolution(source: string | undefined) {
    if (!source) return false;
    if (source.startsWith("image:")) return true;
    if (source.startsWith("blob:")) return true;
    return false;
}

/** Resolve retained image keys for presentation only; all other browser-safe URLs pass through unchanged. */
export async function resolveCanvasImagePreviewSource(
    source: string | undefined,
    resolveImageUrl: (storageKey?: string, fallback?: string) => Promise<string | null>,
) {
    if (!source) return "";
    if (source.startsWith("image:")) {
        return (await resolveImageUrl(source, "")) || "";
    }
    if (source.startsWith("blob:")) {
        try {
            const check = await fetch(source, { method: "HEAD" });
            if (check.ok) return source;
        } catch {}
        return (await resolveImageUrl(source, "")) || "";
    }
    return source;
}
