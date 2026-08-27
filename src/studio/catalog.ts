import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { CIVITAI_ENGINES } from "./adapters/civitai";
import { STUDIO_PROVIDERS } from "./wiring";

export type ModelCard = {
  providerId: string;
  provider: string;
  model: string;
  kind: "image" | "video" | "text" | "audio";
  tags: string[];
  nsfw: boolean;
  cost: string;
  size: string;
  docs: string;
  blurb: string;
  wired: boolean;
  verified?: boolean;
  region?: "us" | "cn" | "eu" | "mix";
};

const META: Record<string, Partial<ModelCard>> = {
  "Qwen/Qwen-Image": { tags: ["中国", "文生图"], cost: "魔搭", size: "1024", blurb: "通义千问生图。", region: "cn", verified: true },
  "Tongyi-MAI/Z-Image-Turbo": { tags: ["中国", "快"], cost: "魔搭 / HF", size: "1024", blurb: "便宜、出图快。", region: "cn", verified: true },
  "Qwen/Qwen-Image-Edit": { tags: ["中国", "改图"], cost: "魔搭", size: "1024", blurb: "通义改图。上传要改的图。", region: "cn", verified: true },
  "Qwen/Qwen-Image-Edit-2509": { tags: ["中国", "改图"], cost: "魔搭", size: "1024", blurb: "一次可提交 1–3 张参考图。", region: "cn" },
  "black-forest-labs/FLUX.1-schnell": { tags: ["欧洲", "Flux", "快"], cost: "HF", size: "1024", blurb: "FLUX 快速档。", region: "eu", verified: true },
  "black-forest-labs/FLUX.2-dev": { tags: ["欧洲", "Flux2"], cost: "HF", size: "1024", blurb: "FLUX.2 改图。", region: "eu" },
  "doubao-seedream-5.0-lite": { tags: ["中国", "2K", "推荐"], cost: "火山", size: "2K", blurb: "豆包生图，商品图好用。", region: "cn", verified: true },
  "doubao-seedream-5.0": { tags: ["中国", "4K"], cost: "火山", size: "2K+", blurb: "豆包生图更高一档。套餐够才开。", region: "cn" },
  "gpt-image-2": { tags: ["美国", "推荐"], cost: "OpenAI", size: "2K", blurb: "听话、能改图、字也清楚。", region: "us", verified: true },
  "gpt-image-1.5": { tags: ["美国"], cost: "OpenAI", size: "1024", blurb: "上一档 GPT 生图。", region: "us" },
  "gpt-image-1": { tags: ["美国"], cost: "中转", size: "1024", blurb: "基础 GPT 生图。", region: "us" },
  "grok-imagine-image": { tags: ["美国", "推荐"], nsfw: true, cost: "xAI", blurb: "尺度松。参考图最多 3 张。", region: "us", verified: true },
  "grok-imagine-image-quality": { tags: ["美国"], nsfw: true, cost: "xAI", blurb: "Grok 生图高质量档。", region: "us" },
  "grok-imagine-image-2.0": { tags: ["美国"], nsfw: true, cost: "xAI", blurb: "Grok Imagine 2.0。", region: "us" },
  "grok-imagine-video": { tags: ["美国", "推荐"], nsfw: true, cost: "xAI", size: "720p", blurb: "5–10 秒，可带开头图和结尾图。", region: "us", verified: true },
  "grok-imagine-video-1.5": { tags: ["美国"], nsfw: true, cost: "xAI", size: "720p", blurb: "Grok 视频 1.5。", region: "us" },
  "grok-imagine-video-1.5-preview": { tags: ["美国"], nsfw: true, cost: "xAI", size: "720p", blurb: "预览档，未在本台实测。", region: "us" },
  "sora-2": { tags: ["美国", "推荐"], cost: "OpenAI", size: "官方", blurb: "OpenAI 视频，带声音。填官方 Key。", region: "us" },
  "sora-2-pro": { tags: ["美国"], cost: "OpenAI", size: "官方", blurb: "Sora 更高一档。", region: "us" },
  "flux-2-pro": { tags: ["欧洲", "推荐"], nsfw: true, cost: "Fal", size: "1024", blurb: "FLUX.2 写实主力。走 Fal。", region: "eu" },
  "flux-2-flex": { tags: ["欧洲"], nsfw: true, cost: "Fal", blurb: "FLUX.2 更可控。", region: "eu" },
  "flux-2-flash": { tags: ["欧洲"], nsfw: true, cost: "Fal", blurb: "FLUX.2 快速档。", region: "eu" },
  "nano-banana": { tags: ["美国"], cost: "Fal", blurb: "Gemini 闪图，改图快、字清楚。走 Fal。", region: "us" },
  "nano-banana-pro": { tags: ["美国"], cost: "Fal", blurb: "Gemini 高质量生图/改图。", region: "us" },
  "seedream-4.5": { tags: ["中国"], cost: "Fal", blurb: "即梦 4.5，走 Fal。", region: "cn" },
  "kling-3-pro": { tags: ["中国", "推荐"], cost: "Fal", size: "1080p", blurb: "可灵 3 电影感。走 Fal。", region: "cn" },
  "kling-3-turbo": { tags: ["中国"], cost: "Fal", size: "1080p", blurb: "可灵 3 加速档。", region: "cn" },
  "kling-v3": { tags: ["中国"], cost: "可灵", size: "1080p", blurb: "可灵官方。填开发者 Key。", region: "cn" },
  "kling-v3-omni": { tags: ["中国"], cost: "可灵", blurb: "可灵全能档。", region: "cn" },
  "hailuo-2.3": { tags: ["中国"], cost: "Fal", blurb: "海螺 2.3，短片好用。走 Fal。", region: "cn" },
  "minimax-h3": { tags: ["中国"], cost: "Fal", blurb: "海螺 H3 更快一档。", region: "cn" },
  "MiniMax-Hailuo-2.3": { tags: ["中国"], cost: "海螺", blurb: "MiniMax 官方海螺。", region: "cn" },
  "MiniMax-Hailuo-02": { tags: ["中国"], cost: "海螺", blurb: "海螺上一档。", region: "cn" },
  "veo-3.1": { tags: ["美国"], cost: "Fal", blurb: "Google Veo 3.1，画面稳、能带声。走 Fal。", region: "us" },
  "wan-pro": { tags: ["中国"], cost: "Fal", blurb: "通义万相，走 Fal。", region: "cn" },
  "qwen-image-2.0-pro": { tags: ["中国", "推荐"], cost: "百炼", blurb: "通义生图主力。中文提示好。", region: "cn" },
  "qwen-image-plus": { tags: ["中国"], cost: "百炼", blurb: "通义生图轻量档。", region: "cn" },
  "wan2.6-t2i": { tags: ["中国"], cost: "百炼", blurb: "万相 2.6 文生图。", region: "cn" },
  "wan2.7-image": { tags: ["中国"], cost: "百炼", blurb: "万相 2.7 生图。", region: "cn" },
  "wan2.6-t2v": { tags: ["中国"], cost: "百炼", blurb: "万相 2.6 文生视频。", region: "cn" },
  "wan2.6-i2v": { tags: ["中国"], cost: "百炼", blurb: "万相 2.6 按图出视频。", region: "cn" },
  "wan2.7-t2v": { tags: ["中国", "推荐"], cost: "百炼", blurb: "万相 2.7 文生视频。", region: "cn" },
  "wan2.7-i2v": { tags: ["中国"], cost: "百炼", blurb: "万相 2.7 按图出视频。", region: "cn" },
  "happyhorse-1.1-t2v": { tags: ["中国"], cost: "百炼", blurb: "阿里短视频加速档。", region: "cn" },
  "gpt-5.6": { tags: ["美国"], cost: "中转", blurb: "拆故事用的文本模型。", region: "us" },
  "gpt-5.5": { tags: ["美国"], cost: "中转", blurb: "文本备用。", region: "us" },
  "grok-4.6": { tags: ["美国"], nsfw: true, cost: "xAI", blurb: "拆分镜默认文本模型。", region: "us", verified: true },
  "grok-4.5": { tags: ["美国"], nsfw: true, cost: "xAI", blurb: "文本备用。", region: "us" },
  "doubao-seedance-1.5-pro": { tags: ["中国"], cost: "火山", blurb: "Seedance 1.5。Agent Plan Medium 起。", region: "cn" },
  "doubao-seedance-2.0": { tags: ["中国", "推荐"], cost: "火山", blurb: "豆包视频主力，多分镜。Large 档才开。", region: "cn" },
  "doubao-seedance-2.0-fast": { tags: ["中国"], cost: "火山", blurb: "Seedance 2.0 加速档。", region: "cn" },
  "doubao-seedance-2.0-mini": { tags: ["中国"], cost: "火山", blurb: "Seedance 2.0 轻量档。", region: "cn" },
  "agnes-image-2.1-flash": { tags: ["美国", "推荐"], cost: "Agnes", size: "1K–4K", blurb: "Agnes 生图。可带参考图，清晰度 1K 到 4K。", region: "us" },
  "agnes-image-2.0-flash": { tags: ["美国"], cost: "Agnes", size: "1024", blurb: "Agnes 上一档生图。", region: "us" },
  "agnes-video-2.5-flash": { tags: ["美国", "推荐"], cost: "Agnes", size: "720P", blurb: "Agnes 视频。文生、开头/结尾图、最多 5 张参考。", region: "us" },
  "agnes-video-2.5": { tags: ["美国"], cost: "Agnes", size: "720P+", blurb: "Agnes 视频完整档。", region: "us" },
  "agnes-video-v2.0": { tags: ["美国"], cost: "Agnes", blurb: "Agnes 视频旧档。", region: "us" },
  "agnes-2.5-pro": { tags: ["美国"], cost: "Agnes", blurb: "Agnes 文本 Pro。", region: "us" },
  "agnes-2.5-flash": { tags: ["美国"], cost: "Agnes", blurb: "Agnes 文本。", region: "us" },
  "sensenova-u1-fast": { tags: ["中国", "推荐"], cost: "日日新", size: "2048", blurb: "商汤 U1 生图。只走文生图，默认 2048×2048。", region: "cn" },
  "sensenova-u1.5-lite": { tags: ["中国"], cost: "日日新", size: "2048", blurb: "商汤 U1.5 轻量生图。", region: "cn" },
  "sensenova-6.7-flash-lite": { tags: ["中国"], cost: "日日新", blurb: "商汤文本轻量档。", region: "cn" },
  "sensenova-6.8-flash-lite": { tags: ["中国"], cost: "日日新", blurb: "商汤 6.8 文本。", region: "cn" },
  "flux-schnell": { tags: ["欧洲"], nsfw: true, cost: "Fal", blurb: "FLUX 快速档。", region: "eu" },
  "flux-pro": { tags: ["欧洲"], nsfw: true, cost: "Fal", blurb: "FLUX Pro。", region: "eu" },
};

const REGION_BY_PROVIDER: Record<string, ModelCard["region"]> = {
  "OpenAI 官方": "us",
  "xAI 官方": "us",
  "Grok 中转": "us",
  "SuperXihe Grok": "us",
  "SuperXihe 生图": "us",
  Hansyai: "us",
  HuggingFace: "us",
  "Hugging Face": "us",
  "Fal.ai": "mix",
  "火山方舟 Agent Plan": "cn",
  "火山方舟（标准 Ark）": "cn",
  "阿里云百炼": "cn",
  "阿里云 Token Plan": "cn",
  "ModelScope 魔搭": "cn",
  "商汤日日新": "cn",
  "可灵 Kling": "cn",
  "MiniMax 海螺": "cn",
  Agnes: "mix",
  "Agnes AI": "mix",
  "Civitai Orchestration": "us",
};

for (const engine of CIVITAI_ENGINES) {
  META[engine.id] = {
    tags: engine.tags,
    nsfw: engine.nsfw,
    cost: "Buzz",
    size: engine.kind === "image" ? "可调" : "官方",
    blurb: `Civitai ${engine.label}。mature 默认开。`,
    verified: engine.id === "krea2-turbo" || engine.id === "ltx2.3",
  };
}

function kindOf(provider: { videoModels: string[]; audioModels: string[]; imageModels: string[] }, model: string): ModelCard["kind"] {
  if (provider.videoModels.includes(model)) return "video";
  if (provider.audioModels.includes(model)) return "audio";
  if (provider.imageModels.includes(model)) return "image";
  return "text";
}

function cardFrom(provider: { id: string; name: string; remark: string; apiKey?: string; enabled?: boolean; nsfw?: boolean; allowMatureContent?: boolean }, model: string, kind: ModelCard["kind"]): ModelCard {
  const extra = META[model] || {};
  return {
    providerId: provider.id,
    provider: provider.name,
    model,
    kind,
    tags: extra.tags || [kind],
    nsfw: extra.nsfw ?? provider.nsfw ?? Boolean(provider.allowMatureContent),
    cost: extra.cost || (provider.apiKey ? "已接线" : "待接线"),
    size: extra.size || "官方",
    docs: provider.remark,
    blurb: extra.blurb || provider.remark,
    wired: Boolean(provider.enabled && provider.apiKey),
    verified: extra.verified ?? false,
    region: extra.region || REGION_BY_PROVIDER[provider.name] || "mix",
  };
}

export const STUDIO_CATALOG: ModelCard[] = STUDIO_PROVIDERS.flatMap((provider) => {
  const models = [...new Set([...provider.imageModels, ...provider.videoModels, ...provider.textModels, ...provider.audioModels])];
  return models.map((model) => cardFrom(provider, model, kindOf(provider, model)));
});

export function cardsFromRelays(relays: ApiRelayProvider[]): ModelCard[] {
  return relays.flatMap((relay) => {
    const buckets: Array<[ModelCard["kind"], string[]]> = [
      ["image", relay.imageModels || []],
      ["video", relay.videoModels || []],
      ["text", relay.textModels || []],
      ["audio", relay.audioModels || []],
    ];
    return buckets.flatMap(([kind, models]) => models.filter(Boolean).map((model) => cardFrom({ ...relay, remark: relay.remark, nsfw: Boolean(relay.allowMatureContent) }, model, kind)));
  });
}

export const REGION_LABEL: Record<NonNullable<ModelCard["region"]>, string> = {
  us: "美国",
  cn: "中国",
  eu: "欧洲",
  mix: "聚合",
};

const REGION_ORDER: Array<NonNullable<ModelCard["region"]>> = ["us", "cn", "eu", "mix"];

export function groupCatalogByRegion(cards: readonly ModelCard[]) {
  const sorted = [...cards].sort((a, b) => {
    const regionRank = REGION_ORDER.indexOf(a.region || "mix") - REGION_ORDER.indexOf(b.region || "mix");
    if (regionRank) return regionRank;
    return a.provider.localeCompare(b.provider, "zh");
  });
  const map = new Map<string, ModelCard[]>();
  for (const card of sorted) {
    const key = `${REGION_LABEL[card.region || "mix"]} · ${card.provider}`;
    const list = map.get(key) || [];
    list.push(card);
    map.set(key, list);
  }
  return [...map.entries()];
}

export function catalogKey(card: Pick<ModelCard, "providerId" | "model">) {
  return `${card.providerId}::${card.model}`;
}

export function catalogByKind(kind: ModelCard["kind"]) {
  return STUDIO_CATALOG.filter((item) => item.kind === kind);
}

export function wiredCatalogByKind(kind: ModelCard["kind"]) {
  const wired = catalogByKind(kind).filter((item) => item.wired);
  return wired.length ? wired : catalogByKind(kind);
}

export function findCatalog(value: string, kind?: ModelCard["kind"]) {
  const match = (item: ModelCard) => catalogKey(item) === value && (!kind || item.kind === kind);
  return STUDIO_CATALOG.find(match);
}
