import { providerCapabilityIsRunnable, providerHasUsableCredential, type ApiRelayProvider } from "@/stores/api-relay-config";
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
};

const META: Record<string, Partial<ModelCard>> = {
  "Qwen/Qwen-Image": { tags: ["文生图", "已接线"], cost: "魔搭", size: "1024", blurb: "通义千问生图。默认走 ModelScope 异步推理。", verified: true },
  "Tongyi-MAI/Z-Image-Turbo": { tags: ["加速", "已接线"], cost: "魔搭 / HF", size: "1024", blurb: "Z-Image Turbo，适合快速出图。", verified: true },
  "Qwen/Qwen-Image-Edit": { tags: ["编辑", "图生图"], cost: "魔搭", size: "1024", blurb: "通义编辑。切到编辑 Tab，上传 1 张参考图。", verified: true },
  "Qwen/Qwen-Image-Edit-2509": { tags: ["编辑", "多参考"], cost: "魔搭", size: "1024", blurb: "一次可提交 1–3 张参考图做编辑。" },
  "black-forest-labs/FLUX.1-schnell": { tags: ["Flux", "快"], cost: "HF", size: "1024", blurb: "Hugging Face Router 上的 FLUX Schnell。", verified: true },
  "black-forest-labs/FLUX.2-dev": { tags: ["Flux2", "编辑"], cost: "HF", size: "1024", blurb: "FLUX.2-dev。编辑 Tab 提交参考图。" },
  "doubao-seedream-5.0-lite": { tags: ["2K", "文生图", "图生图"], cost: "99 AFP", size: "2K", blurb: "商品图默认。官方 size=2K，无水印。已实测。", verified: true },
  "gpt-image-2": { tags: ["Images API", "生图", "编辑"], cost: "中转", size: "1024", blurb: "SuperXihe / OpenAI 兼容。文生图走 generations，改图走 edits。", verified: true },
  "gpt-image-1.5": { tags: ["Images API", "生图", "编辑"], cost: "中转", size: "1024", blurb: "上一档 GPT Image。支持生图和改图。" },
  "gpt-image-1": { tags: ["Images API", "生图", "编辑"], cost: "中转", size: "1024", blurb: "基础 GPT Image。支持生图和改图。" },
  "grok-imagine-image": { tags: ["Imagine", "宽松", "最多5张参考"], nsfw: true, cost: "中转", blurb: "Imagine 生图，尺度比 GPT Image 松。可提交最多 5 张参考图。", verified: true },
  "grok-imagine-image-quality": { tags: ["Imagine", "高质", "最多5张参考"], nsfw: true, cost: "中转", blurb: "Imagine 高质量档。" },
  "grok-imagine-image-2.0": { tags: ["Imagine", "2.0"], nsfw: true, cost: "中转", blurb: "Imagine 2.0 生图。" },
  "grok-imagine-video": { tags: ["5–10s", "Imagine", "首尾帧", "5张静帧"], nsfw: true, cost: "中转", size: "720p", blurb: "已实测出片。首帧+尾帧+最多 5 张分镜静帧。", verified: true },
  "grok-imagine-video-1.5": { tags: ["1.5", "首尾帧"], nsfw: true, cost: "中转", size: "720p", blurb: "Imagine 1.5。" },
  "grok-imagine-video-1.5-preview": { tags: ["预览", "未实测"], nsfw: true, cost: "中转", size: "720p", blurb: "Imagine 1.5 预览档，未在本台实测。" },
  "gpt-5.6": { tags: ["故事导演", "Hansyai"], cost: "中转", blurb: "Hansyai GPT-5.6 文本。" },
  "gpt-5.5": { tags: ["Hansyai"], cost: "中转", blurb: "Hansyai GPT-5.5 文本。" },
  "grok-4.6": { tags: ["故事导演"], nsfw: true, cost: "中转", blurb: "分镜分析默认。", verified: true },
  "grok-4.5": { tags: ["故事导演"], nsfw: true, cost: "中转", blurb: "备用文本模型。" },
  "doubao-seedance-1.5-pro": { tags: ["Medium+", "套餐限制"], cost: "AFP", blurb: "Agent Plan Medium 起。当前 Small 档会拒绝，不假装能跑。" },
  "doubao-seedance-2.0": { tags: ["Large+", "套餐限制"], cost: "AFP", blurb: "走 contents/generations/tasks。Small 档未开通。" },
  "doubao-seedance-2.0-fast": { tags: ["Large+", "套餐限制"], cost: "AFP", blurb: "Seedance 2.0 加速档。当前套餐未开通。" },
  "doubao-seedance-2.0-mini": { tags: ["Large+", "套餐限制"], cost: "AFP", blurb: "Seedance 2.0 轻量档。当前套餐未开通。" },
  "flux-dev": { tags: ["NSFW", "Flux", "待接线"], nsfw: true, cost: "Fal", blurb: "Fal Flux Dev。填 Fal Key 后可用。" },
  "flux-schnell": { tags: ["NSFW", "快", "待接线"], nsfw: true, cost: "Fal", blurb: "Fal Flux Schnell。" },
  "flux-pro": { tags: ["NSFW", "Pro", "待接线"], nsfw: true, cost: "Fal", blurb: "Fal Flux Pro。" },
  "wan3.0-video": { tags: ["万相3.0", "全能", "推荐"], cost: "百炼", size: "1080P", blurb: "万相 3.0 全能视频：文生、首帧/首尾帧、最多 10 张参考图 / 5 段参考视频。最长 30 秒。" },
  "wan3.0-video-prime": { tags: ["万相3.0", "高速", "推荐"], cost: "百炼", size: "1080P", blurb: "万相 3.0 高速版，能力和标准版对齐，出片更快。" },
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

function cardFrom(provider: { id: string; name: string; remark: string; apiKey: string; apiKeys?: string[]; hasApiKey?: boolean; baseUrl: string; enabled?: boolean; nsfw?: boolean; allowMatureContent?: boolean; runnableCapabilities?: ApiRelayProvider["runnableCapabilities"] }, model: string, kind: ModelCard["kind"]): ModelCard {
  const extra = META[model] || {};
  const hasCredential = providerHasUsableCredential(provider);
  const capabilityRunnable = providerCapabilityIsRunnable(provider, kind);
  const tags = extra.tags || [kind];
  return {
    providerId: provider.id,
    provider: provider.name,
    model,
    kind,
    tags: capabilityRunnable ? tags : Array.from(new Set([...tags, "未接线"])),
    nsfw: extra.nsfw ?? provider.nsfw ?? Boolean(provider.allowMatureContent),
    cost: extra.cost || (capabilityRunnable && hasCredential ? "已接线" : capabilityRunnable ? "待接线" : "未接线"),
    size: extra.size || "官方",
    docs: provider.remark,
    blurb: extra.blurb || provider.remark,
    wired: Boolean(provider.enabled && hasCredential && capabilityRunnable),
    verified: extra.verified ?? false,
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

export function groupCatalogByRegion(cards: readonly ModelCard[]): Array<[string, ModelCard[]]> {
  const map = new Map<string, ModelCard[]>();
  for (const item of cards) {
    const list = map.get(item.provider) || [];
    list.push(item);
    map.set(item.provider, list);
  }
  return [...map.entries()];
}

