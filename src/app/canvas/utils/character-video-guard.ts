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
  if (metadata.storyCharacterAssetKind) return true;
  if (metadata.storyAssetKind === "character") return true;
  if (metadata.storyRole === "character") return true;
  if (Array.isArray(metadata.characterDerivedViews) && metadata.characterDerivedViews.length > 0) return true;
  const text = `${node.title || ""}\n${metadata.source || ""}\n${metadata.storyLabel || ""}`;
  return /四象|四视|三视|turnaround|4个角度|多角度|角色图|角色卡|角色设定|角度图/i.test(text);
}
