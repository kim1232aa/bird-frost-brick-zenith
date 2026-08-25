import type { StoryReferenceSnapshot, StoryStageId, StoryStagedDraft } from "../types";

const GLOBAL_CONSTRAINTS = `你是故事导演工作流中的结构化生成模块。
只使用用户故事和已确认的上游结果。
不要补充用户未要求的主要人物、时代、地点或剧情结局。
保持角色身份、服装、发型、年龄和关键道具在后续阶段一致。
输出必须是合法 JSON，不要输出 Markdown、解释文字或代码块。`;

const json = (value: unknown) => JSON.stringify(value ?? null, null, 2);
const confirmedOutput = (draft: StoryStagedDraft, id: StoryStageId) => {
  const stage = draft.stages.find((item) => item.id === id);
  return stage?.status === "confirmed" ? stage.output : undefined;
};
const orderedSnapshots = (draft: StoryStagedDraft, roles?: StoryReferenceSnapshot["role"][]) =>
  draft.referenceSnapshots
    .filter((item) => !roles || roles.includes(item.role))
    .sort((left, right) => left.stableOrder - right.stableOrder)
    .map((item) => `${item.stableOrder + 1}. ${item.name} [${item.role}] snapshot=${item.snapshotId} sha256=${item.sha256}`)
    .join("\n") || "无";

export function buildStoryStagePrompt(draft: StoryStagedDraft, stageId: StoryStageId): string {
  const input = draft.inputSnapshot;
  const requirements = confirmedOutput(draft, "requirements");
  const characters = confirmedOutput(draft, "characters");
  const scenes = confirmedOutput(draft, "scenes");
  const props = confirmedOutput(draft, "props");
  const images = confirmedOutput(draft, "images");
  const storyboard = confirmedOutput(draft, "storyboard");
  const header = `${GLOBAL_CONSTRAINTS}\n\n故事文本：\n${input.storyText}\n`;

  const body: Record<StoryStageId, string> = {
    requirements: `请整理短剧制作需求。\n视觉风格：${input.style || "未指定"}\n画面比例：${input.aspectRatio || "16:9"}\n镜头数量：${input.shotCount || 5}\n单镜头时长：${input.durationSeconds || 5}\n声音设置：${input.audioRules || "未指定"}\n输出 title、synopsis、genre、style、aspectRatio、shotCount、durationSeconds、continuityRules、audioRules、userConstraints。`,
    characters: `根据已确认的项目需求整理主要人物与重要配角。\n项目需求：${json(requirements)}\n人物参考图快照：\n${orderedSnapshots(draft, ["story", "character"])}\nvisualPrompt 只描述人物本体，不写背景、镜头、构图或其他人物。`,
    scenes: `整理可复用场景资产。\n项目需求：${json(requirements)}\n人物结果：${json(characters)}\n场景参考图快照：\n${orderedSnapshots(draft, ["story", "scene"])}\n描述时间、天气、空间锚点、光线、色彩、氛围和连续性。`,
    props: `提取真正需要保持一致的关键道具。\n需求：${json(requirements)}\n人物：${json(characters)}\n场景：${json(scenes)}\n道具参考图快照：\n${orderedSnapshots(draft, ["story", "prop"])}\n给出形状、材质、时代感、剧情作用和出现镜头范围。`,
    images: `为已确认的人物、场景和道具组装图片生成任务。\n需求：${json(requirements)}\n人物：${json(characters)}\n场景：${json(scenes)}\n道具：${json(props)}\n参考图快照：\n${orderedSnapshots(draft)}`,
    storyboard: `生成 ${input.shotCount || 5} 个镜头。\n需求：${json(requirements)}\n人物：${json(characters)}\n场景：${json(scenes)}\n道具：${json(props)}\n图片资产：${json(images)}\n参考图快照：\n${orderedSnapshots(draft)}\n每个镜头包含 appearingCharacterIds、excludedCharacterIds、action、camera、emotion、visualContent、imagePrompt、durationSeconds 和 landingState。`,
    videos: `为每个确认分镜组装单镜头视频任务。\n需求：${json(requirements)}\n人物：${json(characters)}\n场景：${json(scenes)}\n道具：${json(props)}\n图片资产：${json(images)}\n分镜：${json(storyboard)}\n参考图快照：\n${orderedSnapshots(draft)}\n保持前后镜头 landingState 连续，不生成字幕、Logo 或水印。`,
  };
  return `${header}\n${body[stageId]}`;
}
