/** Character turnaround / 四象图 must never occupy a video reference slot. */

const DERIVED_VIEW_ID = /:(front|side|back|portrait)$/i;

export function isCharacterAssetForbiddenForVideo(node: {
  id?: string;
  title?: string;
  metadata?: Record<string, unknown> | null;
} | null | undefined) {
  if (!node) return false;
  if (DERIVED_VIEW_ID.test(String(node.id || ""))) return true;
  const metadata = node.metadata || {};
  if (metadata.characterDerivedViewAngle) return true;
  if (metadata.storyCharacterAssetKind === "turnaround_sheet") return true;
  if (Array.isArray(metadata.characterDerivedViews) && metadata.characterDerivedViews.length > 0) return true;
  const text = `${node.title || ""}\n${metadata.source || ""}\n${metadata.storyLabel || ""}`;
  return /四象|四视|turnaround/i.test(text);
}
