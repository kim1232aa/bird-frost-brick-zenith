import { useCanvasStore } from "@/app/canvas/stores/use-canvas-store";
import { getNodeSpec } from "@/app/canvas/constants";
import { CanvasNodeType, type CanvasNodeData, type StoryCharacter, type StoryShot } from "@/app/canvas/types";
import type { StoryCast, StoryShot as DirectorShot } from "@/studio/story/plan";

function mapCast(cast: StoryCast[]): StoryCharacter[] {
  return cast.map((person, index) => ({
    id: person.id || `char-${index}`,
    name: person.name,
    aliases: person.aliases,
    roleType: person.roleType,
    importance:
      person.importance === "extra" ? "minor" : person.importance === "supporting" ? "supporting" : "main",
    appearance: person.appearance || person.look,
    personality: person.personality,
    visualPrompt: person.visualPrompt || person.look,
    negativePrompt: person.negativePrompt,
    referenceImageUrl: person.url,
    assetSource: person.url ? "generated" : undefined,
    assetLocked: Boolean(person.locked),
    status: person.url ? "ready" : "draft",
  }));
}

function mapShots(shots: DirectorShot[]): StoryShot[] {
  return shots.map((shot, index) => ({
    id: shot.id || `shot-${index}`,
    index: shot.index || index + 1,
    title: shot.title,
    sceneId: shot.sceneId,
    appearingCharacterIds: shot.appearingCharacterIds || [],
    excludedCharacterIds: shot.excludedCharacterIds || [],
    action: shot.action || shot.prompt,
    camera: shot.camera,
    emotion: shot.emotion,
    continuityNote: shot.continuityNote,
    visualContent: shot.visualContent,
    voiceover: shot.dialogue,
    imagePrompt: shot.imagePrompt || shot.prompt,
    resultNodeIds: [],
    status: shot.url ? "done" : "pending",
  }));
}

export function pushStoryToCanvasWorkspace(payload: {
  text: string;
  style?: string;
  shotCount?: number;
  aspectRatio?: string;
  logline?: string;
  scenes?: string[];
  cast?: StoryCast[];
  shots?: DirectorShot[];
}) {
  const spec = getNodeSpec(CanvasNodeType.StoryDirector);
  const characters = mapCast(payload.cast || []);
  const shots = mapShots(payload.shots || []);
  const analyzed = characters.length > 0 || shots.length > 0;
  const node: CanvasNodeData = {
    id: `${CanvasNodeType.StoryDirector}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: CanvasNodeType.StoryDirector,
    title: spec.title,
    position: { x: 80, y: 40 },
    width: spec.width,
    height: spec.height,
    metadata: {
      ...spec.metadata,
      storyText: payload.text,
      content: payload.text,
      storyStyle: payload.style || "电影感写实",
      storyShotCount: payload.shotCount || shots.length || 5,
      storyAspectRatio: payload.aspectRatio || "16:9",
      storyWorkflow: analyzed ? "analysis" : "idle",
      status: "success",
      storyAnalysisStatus: analyzed ? "success" : "idle",
      storyGenerationStatus: "idle",
      storyCharacters: characters,
      storyScenes: (payload.scenes || []).map((name, index) => ({
        id: `scene-${index}`,
        name,
        description: name,
      })),
      storyShots: shots,
      storyAnalysisRenderedText: payload.logline || "",
    },
  };
  return useCanvasStore.getState().importProject({
    title: `故事 ${payload.text.slice(0, 12) || "导演"}`,
    nodes: [node],
    viewport: { x: 0, y: 0, k: 1 },
  });
}
