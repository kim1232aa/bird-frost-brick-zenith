import { nanoid } from "nanoid";
import { useCanvasStore } from "@/app/canvas/stores/use-canvas-store";
import { getNodeSpec, NODE_DEFAULT_SIZE } from "@/app/canvas/constants";
import { CanvasNodeType, type CanvasNodeData, type StoryCharacter, type StoryShot } from "@/app/canvas/types";
import type { StoryCast, StoryShot as DirectorShot } from "@/studio/story/plan";
import { buildMediaCanvasProject, type MediaCanvasPayload } from "./media-workspace-project";

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

function mapShots(shots: DirectorShot[], resultNodeIdsByShot: string[][]): StoryShot[] {
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
    resultNodeIds: resultNodeIdsByShot[index] || [],
    status: shot.videoUrl ? "done" : shot.url ? "done" : "pending",
  }));
}

function imageNode(input: {
  title: string;
  url: string;
  prompt?: string;
  x: number;
  y: number;
  storyLabel?: string;
}): CanvasNodeData {
  const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
  return {
    id: nanoid(),
    type: CanvasNodeType.Image,
    title: input.title,
    position: { x: input.x, y: input.y },
    width: spec.width,
    height: spec.height,
    metadata: {
      content: input.url,
      backendUrl: input.url,
      prompt: input.prompt,
      status: "success",
      storyLabel: input.storyLabel,
    },
  };
}

function videoNode(input: {
  title: string;
  url: string;
  prompt?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  x: number;
  y: number;
}): CanvasNodeData {
  const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
  return {
    id: nanoid(),
    type: CanvasNodeType.Video,
    title: input.title,
    position: { x: input.x, y: input.y },
    width: spec.width,
    height: spec.height,
    metadata: {
      content: input.url,
      backendUrl: input.url,
      prompt: input.prompt,
      status: "success",
      references: [input.firstFrameUrl, input.lastFrameUrl].filter(Boolean) as string[],
    },
  };
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
  const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
  const extraNodes: CanvasNodeData[] = [];
  const resultNodeIdsByShot: string[][] = (payload.shots || []).map(() => []);

  (payload.cast || []).forEach((person, index) => {
    if (!person.url) return;
    extraNodes.push(
      imageNode({
        title: `角色 ${person.name}`,
        url: person.url,
        prompt: person.look,
        x: 80 + spec.width + 80 + (index % 3) * (imageSpec.width + 48),
        y: 40 + Math.floor(index / 3) * (imageSpec.height + 48),
        storyLabel: person.name,
      }),
    );
  });

  const portraitCount = extraNodes.length;
  (payload.shots || []).forEach((shot, index) => {
    if (!shot.url) return;
    const node = imageNode({
      title: shot.title || `第${index + 1}镜`,
      url: shot.url,
      prompt: shot.prompt,
      x: 80 + spec.width + 80 + (index % 5) * (imageSpec.width + 36),
      y: 40 + 280 + Math.floor(portraitCount / 3) * (imageSpec.height + 48) + Math.floor(index / 5) * (imageSpec.height + 36),
      storyLabel: `第${index + 1}镜`,
    });
    extraNodes.push(node);
    resultNodeIdsByShot[index] = [node.id];
  });

  (payload.shots || []).forEach((shot, index) => {
    if (!shot.videoUrl) return;
    extraNodes.push(
      videoNode({
        title: `${shot.title || `第${index + 1}镜`} 视频`,
        url: shot.videoUrl,
        prompt: shot.prompt,
        firstFrameUrl: shot.url,
        lastFrameUrl: payload.shots?.[payload.shots.length - 1]?.url,
        x: 80 + spec.width + 80 + (index % 3) * 460,
        y: 720,
      }),
    );
  });

  const characters = mapCast(payload.cast || []);
  const shots = mapShots(payload.shots || [], resultNodeIdsByShot);
  const analyzed = characters.length > 0 || shots.length > 0;
  const hasMedia = extraNodes.length > 0;
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
      storyStyle: payload.style || "",
      storyShotCount: payload.shotCount || shots.length || 5,
      storyAspectRatio: payload.aspectRatio || "16:9",
      storyWorkflow: analyzed ? "analysis" : "idle",
      status: "success",
      storyAnalysisStatus: analyzed ? "success" : "idle",
      storyGenerationStatus: hasMedia ? "success" : "idle",
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
    nodes: [node, ...extraNodes],
    viewport: { x: 0, y: 0, k: 0.85 },
  });
}

function mediaCanvasType(type: "image" | "video" | "text") {
  if (type === "video") return CanvasNodeType.Video;
  if (type === "text") return CanvasNodeType.Text;
  return CanvasNodeType.Image;
}

function mediaNodesToCanvas(nodes: ReturnType<typeof buildMediaCanvasProject>["nodes"]): CanvasNodeData[] {
  return nodes.map((node) => ({
    id: node.id,
    type: mediaCanvasType(node.type),
    title: node.title,
    position: node.position,
    width: node.width,
    height: node.height,
    metadata: node.metadata,
  }));
}

export function pushMediaToCanvasWorkspace(payload: MediaCanvasPayload) {
  const project = buildMediaCanvasProject(payload);
  return useCanvasStore.getState().importProject({
    title: project.title,
    nodes: mediaNodesToCanvas(project.nodes),
    viewport: project.viewport,
  });
}
