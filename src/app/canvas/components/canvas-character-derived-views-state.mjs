import { hasCompleteCharacterDerivedViews } from "../utils/character-turnaround-views.mjs";

export async function resolveCharacterDerivedViewUrls(views, resolve) {
  return new Map(
    await Promise.all(
      views.map(async (view) => [view.id, await resolve(view.storageKey)]),
    ),
  );
}

export function characterDerivedViewsUiState(metadata, nodeId) {
  if (metadata?.storyCharacterAssetKind !== "turnaround_sheet") return "hidden";
  if (metadata.characterDerivedViewsStatus === "error") return "error";
  if (
    !metadata.storageKey ||
    !hasCompleteCharacterDerivedViews(
      metadata.characterDerivedViews,
      metadata.storageKey,
      nodeId,
    )
  ) {
    return "hidden";
  }
  return "ready";
}
