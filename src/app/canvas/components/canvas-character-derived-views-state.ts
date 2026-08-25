import { hasCompleteCharacterDerivedViews } from "../utils/character-turnaround-views";
import type { CanvasNodeMetadata, CharacterDerivedView } from "../types";

export type CharacterDerivedViewsUiState = "hidden" | "ready" | "error";

export async function resolveCharacterDerivedViewUrls(
  views: readonly Pick<CharacterDerivedView, "id" | "storageKey">[],
  resolve: (storageKey: string) => Promise<string>,
): Promise<Map<string, string>> {
  return new Map(
    await Promise.all(
      views.map(
        async (view) => [view.id, await resolve(view.storageKey)] as const,
      ),
    ),
  );
}

/**
 * Keeps the parent image's affordance tied to persisted, complete crops. The
 * caller resolves crop URLs only after the user asks to view them.
 */
export function characterDerivedViewsUiState(
  metadata:
    | Pick<
        CanvasNodeMetadata,
        | "storyCharacterAssetKind"
        | "characterDerivedViews"
        | "characterDerivedViewsStatus"
        | "storageKey"
      >
    | undefined,
  nodeId: string,
): CharacterDerivedViewsUiState {
  if (metadata?.storyCharacterAssetKind !== "turnaround_sheet") return "hidden";
  if (metadata.characterDerivedViewsStatus === "error") return "error";
  if (!metadata.storageKey) return "hidden";
  return hasCompleteCharacterDerivedViews(
    metadata.characterDerivedViews,
    metadata.storageKey,
    nodeId,
  )
    ? "ready"
    : "hidden";
}
