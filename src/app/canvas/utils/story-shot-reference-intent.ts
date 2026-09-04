import type { CanvasNodeData, StoryShot } from "../types";

export type StoryDirectorReferenceSource = Pick<CanvasNodeData, "metadata">;

/** Shot-local reference intent. Director character inputs do not force establishing shots into edit. */
export function storyShotHasReferenceIntent(
  director: StoryDirectorReferenceSource,
  shots: readonly Pick<StoryShot, "appearingCharacterIds">[],
) {
  return (
    shots.some((shot) => (shot.appearingCharacterIds || []).length > 0) ||
    storyDirectorSourceIdsForKind(director, "reference").length > 0 ||
    storyDirectorSourceIdsForKind(director, "scene").length > 0 ||
    storyDirectorSourceIdsForKind(director, "prop").length > 0
  );
}

function storyDirectorSourceIdsForKind(
  director: StoryDirectorReferenceSource,
  kind: "reference" | "character" | "scene" | "prop",
) {
  if (kind === "character") return director.metadata?.storyCharacterSourceImageNodeIds || [];
  if (kind === "scene") return director.metadata?.storySceneSourceImageNodeIds || [];
  if (kind === "prop") return director.metadata?.storyPropSourceImageNodeIds || [];
  return director.metadata?.storySourceImageNodeIds?.length
    ? director.metadata.storySourceImageNodeIds
    : director.metadata?.storySourceImageNodeId
      ? [director.metadata.storySourceImageNodeId]
      : [];
}
