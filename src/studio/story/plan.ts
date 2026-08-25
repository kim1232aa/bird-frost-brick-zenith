import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { generateStudioText } from "@/studio/generate/text";
import { splitModel } from "@/studio/split";

export type StoryCast = {
  name: string;
  look: string;
  importance: "main" | "supporting" | "extra";
  url?: string;
  locked?: boolean;
  status?: string;
};

export type StoryShot = {
  title: string;
  prompt: string;
  camera: string;
  scene: string;
  characters: string[];
  url?: string;
  videoUrl?: string;
  status?: string;
};

export type StoryPlan = {
  logline: string;
  style: string;
  development: string;
  scenes: string[];
  cast: StoryCast[];
  shots: StoryShot[];
};

const FALLBACK: StoryPlan = {
  logline: "",
  style: "电影感写实",
  development: "",
  scenes: [],
  cast: [],
  shots: [],
};

function pickCastNames(text: string) {
  const known = ["李火旺", "林晚", "铜铃"];
  const hits = known.filter((name) => text.includes(name));
  if (hits.length) return hits.slice(0, 3);
  return ["主角"];
}

export function draftPlan(idea: string, style = "电影感写实", shotCount = 5): StoryPlan {
  const text = idea.trim() || "雨夜码头，女警探林晚追踪一枚会发光的铜铃。克制、潮湿、霓虹。";
  const castNames = pickCastNames(text);
  const scenes = text.includes("码头") ? ["雨夜码头", "巷口霓虹", "室内对峙"] : ["开场", "对峙", "收束"];
  const cameras = ["35mm 慢推", "50mm 过肩", "24mm 环境", "85mm 特写", "40mm 跟拍"];
  const count = Math.max(1, Math.min(9, shotCount));
  const hero = castNames[0];
  const shots = Array.from({ length: count }, (_, index) => ({
    title: index === 0 ? `${scenes[0]}的${hero}` : `镜头 ${index + 1}`,
    camera: cameras[index % cameras.length],
    scene: scenes[index % scenes.length],
    characters: [hero],
    prompt: `${hero}，${scenes[index % scenes.length]}，${cameras[index % cameras.length]}，${style}，电影静帧，服装锁定`,
    status: "pending",
  }));
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
    scenes,
    cast: castNames.map((name, index) => ({
      name,
      look: name === "林晚" ? "短发，湿风衣，冷白皮，三十岁上下" : name === "李火旺" ? "灰袍，瘦削，黑发，风尘" : "与主角同一世界观的人物，服装锁定",
      importance: (index === 0 ? "main" : "supporting") as StoryCast["importance"],
      status: "pending",
    })),
    shots,
  };
}

export async function planStory(input: {
  relays: ApiRelayProvider[];
  idea: string;
  textModel?: string;
  style?: string;
  shotCount?: number;
}): Promise<StoryPlan> {
  const idea = input.idea.trim();
  if (!idea) throw new Error("先写故事");
  const count = Math.max(1, Math.min(12, input.shotCount || 5));
  const style = input.style || "电影感写实";
  const fallback = draftPlan(idea, style, count);
  try {
    const selection = splitModel(input.textModel || "");
    const result = await generateStudioText({
      relays: input.relays,
      json: true,
      providerId: selection.providerId || undefined,
      model: selection.model || undefined,
      system: "You are a film director and continuity supervisor. Return compact JSON only. No markdown.",
      prompt: `Break this story into a production board.
Style: ${style}
Shot count: ${count}
Story: ${idea}

JSON shape:
{
  "logline": "zh one sentence",
  "style": "${style}",
  "scenes": ["zh location"],
  "cast": [{"name":"zh","look":"english visual bible: age, face, hair, wardrobe lock","importance":"main|supporting|extra"}],
  "shots": [{"title":"zh","camera":"lens and move","scene":"from scenes","characters":["names"],"prompt":"english photoreal cinematic still, include wardrobe lock and character names"}]
}
Keep identity consistent. Max ${count} shots, max 6 cast.`,
    });
    const parsed = JSON.parse(result.text.replace(/```json|```/g, "").trim()) as Partial<StoryPlan>;
    const cast: StoryCast[] = (parsed.cast || []).slice(0, 6).map((person) => ({
      name: person.name || "角色",
      look: person.look || "cinematic portrait",
      importance: person.importance === "supporting" || person.importance === "extra" ? person.importance : "main",
      status: "pending",
    }));
    const shots = (parsed.shots || []).slice(0, count).map((shot) => ({
      title: shot.title || "镜头",
      prompt: shot.prompt || idea,
      camera: shot.camera || "35mm, slow push in",
      scene: shot.scene || (parsed.scenes && parsed.scenes[0]) || "",
      characters: shot.characters || [],
      status: "pending",
    }));
    if (!cast.length && !shots.length) return fallback;
    return {
      logline: parsed.logline || fallback.logline,
      style: parsed.style || style,
      development: fallback.development.replace(fallback.logline, parsed.logline || fallback.logline),
      scenes: (parsed.scenes || fallback.scenes).slice(0, 8).map(String),
      cast: cast.length ? cast : fallback.cast,
      shots: shots.length ? shots : fallback.shots,
    };
  } catch {
    return fallback;
  }
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
  const result = await generateStudioText({
    relays: input.relays,
    providerId: selection.providerId || undefined,
    model: selection.model || undefined,
    system: "You rewrite user prompts for production image/video models. Return the rewritten prompt only.",
    prompt: `Rewrite as a ${input.kind || "image"} generation prompt. Keep the user's intent, add camera, lighting, materials, and continuity locks. No quotes.\n\n${prompt}`,
  });
  return result.text.trim();
}

export function characterLock(cast: StoryCast[]) {
  return cast.map((person) => `${person.name}: ${person.look}`).join("; ");
}

export function emptyPlan(): StoryPlan {
  return { ...FALLBACK, cast: [], shots: [], scenes: [] };
}
