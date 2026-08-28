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

const STORY_QUALITY_LABELS: Record<"low" | "medium" | "high", string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function storyDirectorQualityOptions(
  capability: { quality?: { state?: string; values?: readonly string[] } } | null | undefined,
): Array<{ value: "low" | "medium" | "high"; label: string }> {
  if (!capability?.quality || capability.quality.state !== "supported") return [];
  const options: Array<{ value: "low" | "medium" | "high"; label: string }> = [];
  for (const raw of capability.quality.values || []) {
    const normalized = normalizeStoryImageQuality(raw, true);
    if (!normalized || options.some((item) => item.value === normalized)) continue;
    options.push({ value: normalized, label: STORY_QUALITY_LABELS[normalized] });
  }
  return options;
}

