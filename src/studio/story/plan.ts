import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { splitModel } from "@/studio/split";
import { analysisPrompt, analysisRepairPrompt } from "./prompts";

export type StoryCast = {
  id: string;
  name: string;
  look: string;
  appearance?: string;
  personality?: string;
  visualPrompt?: string;
  negativePrompt?: string;
  roleType?: string;
  aliases?: string[];
  importance: "main" | "supporting" | "extra";
  url?: string;
  locked?: boolean;
  status?: string;
};

export type StoryScene = {
  id: string;
  name: string;
  description?: string;
  mood?: string;
};

export type StoryShot = {
  id: string;
  index: number;
  title: string;
  prompt: string;
  imagePrompt?: string;
  visualContent?: string;
  action?: string;
  emotion?: string;
  camera: string;
  scene: string;
  sceneId?: string;
  characters: string[];
  appearingCharacterIds?: string[];
  excludedCharacterIds?: string[];
  continuityNote?: string;
  dialogue?: string;
  duration?: number;
  url?: string;
  videoUrl?: string;
  status?: string;
  error?: string;
};

export type StoryPlan = {
  logline: string;
  style: string;
  development: string;
  scenes: string[];
  sceneBoard: StoryScene[];
  cast: StoryCast[];
  shots: StoryShot[];
};

const FALLBACK: StoryPlan = {
  logline: "",
  style: "电影感写实",
  development: "",
  scenes: [],
  sceneBoard: [],
  cast: [],
  shots: [],
};

function parseAnalysis(raw: string, count: number, style: string): StoryPlan {
  const text = raw.replace(/```json|```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text) as {
    logline?: string;
    characters?: Array<Partial<StoryCast> & { id?: string }>;
    scenes?: Array<Partial<StoryScene>>;
    shots?: Array<Partial<StoryShot> & { imagePrompt?: string }>;
  };
  const sceneBoard: StoryScene[] = (parsed.scenes || []).map((scene, index) => ({
    id: scene.id || `scene_${String(index + 1).padStart(3, "0")}`,
    name: scene.name || `场景 ${index + 1}`,
    description: scene.description,
    mood: scene.mood,
  }));
  const cast: StoryCast[] = (parsed.characters || []).slice(0, 8).map((person, index) => {
    const look = person.visualPrompt || person.appearance || person.look || "cinematic portrait, locked wardrobe";
    return {
      id: person.id || `char_${String(index + 1).padStart(3, "0")}`,
      name: person.name || `角色${index + 1}`,
      look,
      appearance: person.appearance || look,
      personality: person.personality,
      visualPrompt: person.visualPrompt || look,
      negativePrompt: person.negativePrompt || "复杂背景、额外人物、文字水印",
      roleType: person.roleType,
      aliases: person.aliases,
      importance: person.importance === "supporting" || person.importance === "extra" ? person.importance : "main",
      status: "pending",
    };
  });
  const shots: StoryShot[] = (parsed.shots || []).slice(0, count).map((shot, index): StoryShot => {
    const appearing = shot.appearingCharacterIds || [];
    const names = appearing.map((id) => cast.find((person) => person.id === id)?.name).filter(Boolean) as string[];
    const prompt = shot.imagePrompt || shot.visualContent || shot.prompt || "";
    const scene = sceneBoard.find((item) => item.id === shot.sceneId);
    return {
      id: shot.id || `shot_${String(index + 1).padStart(3, "0")}`,
      index: shot.index || index + 1,
      title: shot.title || `镜头 ${index + 1}`,
      prompt,
      imagePrompt: shot.imagePrompt || prompt,
      visualContent: shot.visualContent || prompt,
      action: shot.action,
      emotion: shot.emotion,
      camera: shot.camera || "35mm 中景",
      scene: scene?.name || shot.scene || "",
      sceneId: shot.sceneId || scene?.id,
      characters: names.length ? names : shot.characters || [],
      appearingCharacterIds: appearing,
      excludedCharacterIds: shot.excludedCharacterIds || [],
      continuityNote: shot.continuityNote,
      dialogue: shot.dialogue || "",
      duration: shot.duration || 5,
      status: "pending",
    };
  });
  if (!cast.length && !shots.length) throw new Error("分析 JSON 没有角色和镜头");
  if (shots.length !== count) {
    throw new Error("故事分析失败，上游未返回有效分镜");
  }
  return {
    logline: parsed.logline || "",
    style,
    development: "",
    scenes: sceneBoard.map((item) => item.name),
    sceneBoard,
    cast,
    shots,
  };
}

export async function planStory(input: {
  relays: ApiRelayProvider[];
  idea: string;
  textModel?: string;
  style?: string;
  shotCount?: number;
  aspectRatio?: string;
}): Promise<StoryPlan> {
  const idea = input.idea.trim();
  if (!idea) throw new Error("先写故事");
  const count = Math.max(1, Math.min(12, input.shotCount || 5));
  const style = input.style || "电影感写实";
  const aspectRatio = input.aspectRatio || "16:9";
  const selection = splitModel(input.textModel || "");
  const ask = async (prompt: string) => {
    const { generateStudioText } = await import("@/studio/generate/text");
    const result = await generateStudioText({
      relays: input.relays,
      json: true,
      providerId: selection.providerId || undefined,
      model: selection.model || undefined,
      system: "You are a film director and continuity supervisor. Return compact JSON only. No markdown.",
      prompt,
      timeoutMs: 180_000,
    });
    return result.text;
  };
  try {
    const raw = await ask(analysisPrompt(count, style, aspectRatio, idea));
    try {
      return parseAnalysis(raw, count, style);
    } catch (err) {
      if (err instanceof Error && err.message === "故事分析失败，上游未返回有效分镜") throw err;
      const repaired = await ask(
        analysisRepairPrompt(count, style, aspectRatio, idea, raw, err instanceof Error ? err.message : "JSON 解析失败"),
      );
      return parseAnalysis(repaired, count, style);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "故事分析失败，上游未返回有效分镜") throw err;
    throw new Error("故事分析失败，上游未返回有效分镜");
  }
}

function promptScriptHint(text: string): "zh" | "en" {
  const cjk = (text.match(/[\u3400-\u9FFF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return cjk > 0 && cjk >= latin ? "zh" : "en";
}

export async function enhancePrompt(input: {
  relays: ApiRelayProvider[];
  prompt: string;
  textModel?: string;
  kind?: "image" | "video";
}) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("先写提示词");
  const selection = splitModel(input.textModel || "");
  const { generateStudioText } = await import("@/studio/generate/text");
  const lang = promptScriptHint(prompt);
  const kindLabel = input.kind === "video" ? "视频" : "图像";
  const kindEn = input.kind === "video" ? "video" : "image";
  const system =
    lang === "zh"
      ? "你负责把用户的图像/视频提示词写顺。只输出润色后的提示词。必须使用用户原文的语言：中文输入就输出中文，禁止翻译成英文。可补充镜头、光线、材质和连续性锁定，但仍用中文。不要引号、不要前言、不要解释。"
      : "You polish the user's image/video prompt for production models. Return only the polished prompt. Keep the same language as the user input. Do not translate. You may add camera, lighting, materials, and continuity locks in that same language. No quotes, no preamble.";
  const task =
    lang === "zh"
      ? `把下面这段${kindLabel}提示词写顺，补上镜头、光线、材质和连续性锁定。必须保持中文，不要翻译成英文。只输出提示词本身。\n\n${prompt}`
      : `Polish this ${kindEn} generation prompt. Keep the user's language and intent. Add camera, lighting, materials, and continuity locks. Return the prompt only.\n\n${prompt}`;
  const result = await generateStudioText({
    relays: input.relays,
    providerId: selection.providerId || undefined,
    model: selection.model || undefined,
    system,
    prompt: task,
  });
  return result.text.trim().replace(/^["'`]+|["'`]+$/g, "");
}

export function characterLock(cast: StoryCast[]) {
  return cast
    .map((person) => `${person.name}: ${person.visualPrompt || person.appearance || person.look}`)
    .join("; ");
}

export function emptyPlan(): StoryPlan {
  return { ...FALLBACK, cast: [], shots: [], scenes: [], sceneBoard: [] };
}
