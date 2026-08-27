import type { ResolvedImageModelCapability } from "@/services/api/image-model-capabilities";
import type { CanvasNodeMetadata } from "../types";

const QUALITY_LABELS: Record<string, string> = {
  auto: "交给模型",
  low: "低",
  medium: "中",
  high: "高",
  hd: "高清",
  standard: "普通",
  eco: "省一点",
};

/** Keep the user's pick. Only remap old 1K/2K/4K aliases. */
export function normalizeStoryImageQuality(
  quality: string | undefined,
  explicit = false,
): string {
  const normalized = String(quality || "").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "1k") return explicit ? "low" : "";
  if (lower === "2k") return "medium";
  if (lower === "4k") return "high";
  if ((lower === "low" || lower === "medium" || lower === "high") && !explicit) return "";
  return normalized;
}

export function storyImageQualityPatch(
  quality: string,
): Pick<CanvasNodeMetadata, "storyImageQuality" | "storyImageQualityExplicit"> {
  const normalized = String(quality || "").trim();
  return {
    storyImageQuality: normalized || undefined,
    storyImageQualityExplicit: Boolean(normalized),
  };
}

export function storyDirectorQualityOptions(capability?: ResolvedImageModelCapability | null) {
  if (!capability) return [];
  if (capability.quality.state === "supported" && capability.quality.requestable !== false) {
    return capability.quality.values.map((value) => ({
      value,
      label: QUALITY_LABELS[value.toLowerCase()] || value,
    }));
  }
  if (capability.size.state === "supported" && capability.size.kind === "tier-and-ratio") {
    return capability.size.tiers.map((value) => ({ value, label: value }));
  }
  return [];
}
