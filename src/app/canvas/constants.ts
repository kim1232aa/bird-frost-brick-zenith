import { CanvasNodeType } from "./types";
import type { CanvasNodeMetadata } from "./types";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "New Generation" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "Note" },
    [CanvasNodeType.Config]: { width: 400, height: 520, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "Video" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "Audio" },
    [CanvasNodeType.StoryDirector]: { width: 520, height: 640, title: "故事导演" },
    [CanvasNodeType.Seedance2Workflow]: { width: 520, height: 640, title: "分镜视频工作流" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.StoryDirector]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.StoryDirector],
        metadata: { status: "idle", storyText: "", content: "", storyStyle: "电影感写实", storyShotCount: 5, storyAspectRatio: "16:9", storyWorkflow: "idle", storyStoryboardMode: "single" },
    },
    [CanvasNodeType.Seedance2Workflow]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow],
        metadata: {
            status: "idle",
            seedanceWorkflowRole: "controller",
            seedanceWorkflowMode: "continuous",
            seedanceShotCount: 4,
            seedanceGenerateCount: 1,
            seedanceContinuous: true,
            seedanceApiProvider: "local",
            seedanceApiEndpoint: "",
            seedanceModel: "grok-imagine-video",
            seedanceResolution: "720p",
            seedanceRatio: "16:9",
            seedanceDuration: "5",
            seedanceReferenceOrder: ["上游高清参考帧", "当前分镜图", "角色图", "场景图"],
            seedanceRequiredReferences: ["当前分镜图", "角色图", "场景图"],
            seedancePromptTemplate: "故事全局设定 + 当前分镜内容 + 角色/场景资产 + 参考图内容 + 上游参考帧分析 + Seedance 视频提示词模板 = 当前视频提示词",
        },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
