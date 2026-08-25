import type { CanvasNodeMetadata } from "../types";

type StoryImageQuality = NonNullable<CanvasNodeMetadata["storyImageQuality"]>;

export function normalizeStoryImageQuality(
  quality: string | undefined,
  explicit = false,
): "" | "low" | "medium" | "high" {
  const normalized = String(quality || "").trim().toLowerCase();
  if ((normalized === "low" || normalized === "1k") && explicit) return "low";
  if (normalized === "medium" || normalized === "2k") return "medium";
  if (normalized === "high" || normalized === "4k") return "high";
  return "";
}

export function storyImageQualityPatch(
  quality: StoryImageQuality,
): Pick<CanvasNodeMetadata, "storyImageQuality" | "storyImageQualityExplicit"> {
  const normalized = normalizeStoryImageQuality(quality, true);
  return {
    storyImageQuality: normalized || undefined,
    storyImageQualityExplicit: Boolean(normalized),
  };
}
