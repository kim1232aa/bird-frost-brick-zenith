import type { Edge, Node } from "@xyflow/react";
import { DEFAULT_IMAGE, DEFAULT_TEXT, DEFAULT_VIDEO } from "./nodes";
import { draftPlan } from "@/studio/story/plan";
import type { CanvasData } from "./types";

export function storyWorkflowTemplate(): { nodes: Node<CanvasData>[]; edges: Edge[] } {
  const idea = "雨夜码头，女警探林晚追踪一枚会发光的铜铃。克制、潮湿、霓虹，电影感写实。";
  const plan = draftPlan(idea, "电影感写实", 5);
  return {
    nodes: [
      {
        id: "story-1",
        type: "story",
        position: { x: 220, y: 40 },
        data: {
          kind: "story",
          text: idea,
          development: plan.development,
          textModel: DEFAULT_TEXT,
          imageModel: DEFAULT_IMAGE,
          videoModel: DEFAULT_VIDEO,
          style: "电影感写实",
          mode: "single",
          shotCount: 5,
          ratio: "16:9",
          quality: "2K",
          status: "已分析",
          logline: plan.logline,
          scenes: plan.scenes,
          cast: plan.cast,
          shots: plan.shots,
        },
      },
      {
        id: "char-1",
        type: "character",
        position: { x: -140, y: 120 },
        data: { kind: "character", name: plan.cast[0]?.name || "林晚", look: plan.cast[0]?.look || "湿风衣", model: DEFAULT_IMAGE, status: "角色资产" },
      },
      {
        id: "img-1",
        type: "image",
        position: { x: 820, y: -40 },
        data: { kind: "image", prompt: plan.shots[0]?.prompt || "", model: DEFAULT_IMAGE, status: "第1镜", ratio: "16:9", style: "电影感写实" },
      },
      {
        id: "vid-1",
        type: "seedance",
        position: { x: 820, y: 360 },
        data: {
          kind: "seedance",
          prompt: "故事全局设定 + 当前分镜内容 + 角色/场景资产 + 参考图内容 + 上游参考帧分析 + Seedance 视频提示词模板 = 当前视频提示词",
          model: DEFAULT_VIDEO,
          duration: 5,
          ratio: "16:9",
          generateAudio: true,
          shotCount: plan.shots.length,
          status: "分镜式",
        },
      },
    ],
    edges: [
      { id: "e-char-story", source: "char-1", target: "story-1", sourceHandle: "out", targetHandle: "char", style: { stroke: "#6ea8ff" } },
      { id: "e-story-img", source: "story-1", target: "img-1", sourceHandle: "out", targetHandle: "in", style: { stroke: "#6ea8ff" } },
      { id: "e-story-vid", source: "story-1", target: "vid-1", sourceHandle: "out", targetHandle: "in", style: { stroke: "#f97316" } },
    ],
  };
}
