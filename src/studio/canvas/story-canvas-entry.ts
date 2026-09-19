import type {
  CanvasConnection,
  CanvasNodeData,
  ViewportTransform,
} from "../../app/canvas/types.ts";

const STORY_DIRECTOR_NODE_TYPE = "story_director" as CanvasNodeData["type"];
const STORY_DIRECTOR_NODE_WIDTH = 520;
const STORY_DIRECTOR_NODE_HEIGHT = 640;

export type StoryCanvasEntryProject = {
  title: string;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  viewport: ViewportTransform;
};

export function buildStoryDirectorEntryProject(
  options: { id?: string; title?: string } = {},
): StoryCanvasEntryProject {
  const node: CanvasNodeData = {
    id:
      options.id ||
      `story-director-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: STORY_DIRECTOR_NODE_TYPE,
    title: "故事导演",
    position: { x: 0, y: 0 },
    width: STORY_DIRECTOR_NODE_WIDTH,
    height: STORY_DIRECTOR_NODE_HEIGHT,
    metadata: {
      content: "",
      storyText: "",
      storyStyle: "电影感写实",
      storyShotCount: 5,
      storyAspectRatio: "16:9",
      storyStoryboardMode: "single",
      storyWorkflow: "idle",
      storyAnalysisStatus: "idle",
      storyGenerationStatus: "idle",
      storyCharacters: [],
      storyScenes: [],
      storyShots: [],
      status: "idle",
    },
  };

  return {
    title: options.title || "故事导演",
    nodes: [node],
    connections: [],
    viewport: { x: 0, y: 0, k: 0.85 },
  };
}
