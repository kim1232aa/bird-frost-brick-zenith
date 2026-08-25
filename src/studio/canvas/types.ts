import type { StoryCast, StoryShot } from "@/studio/story/plan";

export type CanvasKind =
  | "prompt"
  | "image"
  | "video"
  | "character"
  | "upscale"
  | "story"
  | "audio"
  | "upload"
  | "seedance";

export type CanvasData = {
  kind: CanvasKind;
  text?: string;
  prompt?: string;
  name?: string;
  look?: string;
  model?: string;
  textModel?: string;
  imageModel?: string;
  videoModel?: string;
  url?: string;
  status?: string;
  duration?: number;
  ratio?: string;
  quality?: string;
  size?: string;
  generateAudio?: boolean;
  style?: string;
  mode?: "single" | "grid9";
  shotCount?: number;
  logline?: string;
  development?: string;
  scenes?: string[];
  cast?: StoryCast[];
  shots?: StoryShot[];
  negative?: string;
  seed?: string;
  width?: number;
  height?: number;
};

export const STYLE_PRESETS = [
  "电影感写实",
  "国风仙侠",
  "暗黑奇幻",
  "赛博朋克",
  "日系动画",
  "美式漫画",
  "水彩绘本",
  "黏土动画",
  "像素游戏",
  "黑白分镜",
];

export const GRAPH_KEY = "boundless-studio:canvas-graph-v6";
