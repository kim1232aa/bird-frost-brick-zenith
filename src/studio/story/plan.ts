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
  /** true when the AI analysis failed and this is the locally drafted board. */
  degraded?: boolean;
  /** why the board is degraded (the original analysis error). */
  degradedReason?: string;
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

function pickCastNames(text: string) {
  const known = ["李火旺", "林晚", "铜铃"];
  const hits = known.filter((name) => text.includes(name));
  if (hits.length) return hits.slice(0, 3);
  if (/写真|NWSF|nwsf|泳装|清凉/i.test(text)) return ["成年模特"];
  return ["主角"];
}

export function draftPlan(idea: string, style = "电影感写实", shotCount = 5): StoryPlan {
  const text = idea.trim() || "雨夜码头，女警探林晚追踪一枚会发光的铜铃。克制、潮湿、霓虹。";
  const castNames = pickCastNames(text);
  const sceneBoard: StoryScene[] = text.includes("码头")
    ? [
        { id: "scene_001", name: "雨夜码头", description: "潮湿水泥、霓虹倒影、货箱", mood: "克制潮湿" },
        { id: "scene_002", name: "巷口霓虹", description: "窄巷、灯牌、积水", mood: "压迫" },
        { id: "scene_003", name: "室内对峙", description: "低灯仓库、铜铃反光", mood: "对峙" },
      ]
    : [
        { id: "scene_001", name: "开场", description: "建立人物与空间", mood: "铺垫" },
        { id: "scene_002", name: "对峙", description: "冲突升级", mood: "紧张" },
        { id: "scene_003", name: "收束", description: "同一空间收束", mood: "余韵" },
      ];
  const cameras = ["35mm 中景慢推", "50mm 过肩近景", "24mm 环境远景", "85mm 面部特写", "40mm 跟拍"];
  const count = Math.max(1, Math.min(9, shotCount));
  const hero = castNames[0];
  const cast: StoryCast[] = castNames.map((name, index) => {
    const photoshoot = /写真|NWSF|nwsf|泳装|清凉/i.test(text);
    const look = photoshoot
      ? "24岁成年东亚女性时尚模特，明确成年，不是未成年人，锁骨清晰，高颤骨，锁骨到锁骨，黑色长直发，自信表情，时尚写真妆容"
      : name === "林晚"
        ? "短发，湿风衣，冷白皮，三十岁上下，锐利下颌"
        : name === "李火旺"
          ? "灰袍，瘦削，黑发，风尘"
          : "与主角同一世界观的人物，服装锁定";
    return {
      id: `char_${String(index + 1).padStart(3, "0")}`,
      name,
      look,
      appearance: look,
      visualPrompt: look,
      personality: index === 0 ? "克制、警觉" : "推动冲突",
      negativePrompt: "复杂背景、室内透视、额外人物、文字水印、不同画风",
      importance: (index === 0 ? "main" : "supporting") as StoryCast["importance"],
      status: "pending",
    };
  });
  const shots: StoryShot[] = Array.from({ length: count }, (_, index) => {
    const scene = sceneBoard[index % sceneBoard.length];
    const camera = cameras[index % cameras.length];
    const title = index === 0 ? `${scene.name}的${hero}` : `镜头 ${index + 1}`;
    const appearing = [cast[0].id];
    const excluded = cast.slice(1).map((person) => person.id);
    const photoshoot = /写真|NWSF|nwsf|泳装|清凉/i.test(text);
    const visual = photoshoot
      ? [
          `${hero} 泳池边时尚泳装写真，成年24+，阳光，水波，电影感时尚静帧`,
          `${hero} 海边礁石上的清凉写真，成年24+，侧光，风吹发丝，锁定同一模特`,
          `${hero} 城市天台黄昏写真，成年24+，金色小时，锁定同一服装系列`,
          `${hero} 室内棚拍泳装特写，成年24+，柔光，锁骨与面容，同一模特`,
          `${hero} 夜间霓虹泳池走位，成年24+，倒影，时尚大片，同一模特收束`,
        ][index % 5]
      : `${hero} 在${scene.name}，${camera}，${style}，电影静帧，服装锁定`;
    return {
      id: `shot_${String(index + 1).padStart(3, "0")}`,
      index: index + 1,
      title,
      camera,
      scene: scene.name,
      sceneId: scene.id,
      characters: [hero],
      appearingCharacterIds: appearing,
      excludedCharacterIds: excluded,
      action: index === 0 ? `${hero}观察现场` : "冲突推进",
      emotion: index === 0 ? "警觉" : "紧继",
      visualContent: visual,
      imagePrompt: visual,
      prompt: visual,
      dialogue: index === 0 ? `${hero}：先把现场看清楚。` : "",
      duration: 5,
      status: "pending",
    };
  });
  const development = `【故事总结】
原始故事输入：${text}
整体风格：${style}
画面比例：16:9
故事从什么状态开始：第1镜《${shots[0].title}》。
核心冲突：${hero}与目标形成对峙。
剧情如何升级：从环境推进到人物。
最终走向：在同一空间收束。`;
  return {
    logline: text.replace(/\s+/g, " ").slice(0, 72),
    style,
    development,
    scenes: sceneBoard.map((item) => item.name),
    sceneBoard,
    cast,
    shots,
  };
}

function parseAnalysis(raw: string, count: number, fallback: StoryPlan, style: string): StoryPlan {
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
    const prompt = shot.imagePrompt || shot.visualContent || shot.prompt || fallback.shots[index]?.prompt || "";
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
  // Pad missing shots from the local draft instead of throwing the whole board
  // away — a short AI answer must never silently drop 分镜 2、3.
  const paddedShots = shots.length ? [...shots] : [];
  for (let index = paddedShots.length; index < count; index += 1) {
    const draft = fallback.shots[index];
    paddedShots.push(
      draft
        ? {
            ...draft,
            imagePrompt: draft.imagePrompt || draft.prompt,
            visualContent: draft.visualContent || draft.prompt,
            status: "pending" as const,
          }
        : {
            id: `shot_${String(index + 1).padStart(3, "0")}`,
            index: index + 1,
            title: `镜头 ${index + 1}`,
            prompt: fallback.shots[0]?.prompt || "",
            imagePrompt: fallback.shots[0]?.prompt || "",
            visualContent: fallback.shots[0]?.prompt || "",
            action: undefined,
            emotion: undefined,
            camera: "35mm 中景",
            scene: fallback.scenes[0] || "",
            characters: [],
            dialogue: "",
            duration: 5,
            status: "pending" as const,
          },
    );
  }
  return {
    logline: parsed.logline || fallback.logline,
    style,
    development: fallback.development,
    scenes: sceneBoard.length ? sceneBoard.map((item) => item.name) : fallback.scenes,
    sceneBoard: sceneBoard.length ? sceneBoard : fallback.sceneBoard,
    cast: cast.length ? cast : fallback.cast,
    shots: paddedShots,
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
  const fallback = draftPlan(idea, style, count);
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
      return parseAnalysis(raw, count, fallback, style);
    } catch (err) {
      const repaired = await ask(
        analysisRepairPrompt(count, style, aspectRatio, idea, raw, err instanceof Error ? err.message : "JSON 解析失败"),
      );
      return parseAnalysis(repaired, count, fallback, style);
    }
  } catch (err) {
    // 分析失败不能悄悄变成空结果或错误结果：退回本地分镜，并明确标记降级原因，
    // 让 UI 告诉用户这是本地草稿而不是 AI 分析结果。
    const reason = err instanceof Error ? err.message : "故事分析失败";
    return { ...fallback, degraded: true, degradedReason: reason };
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
