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
  "doubao-seedream-5.0-lite": { tags: ["2K", "文生图", "图生图"], cost: "99 AFP", size: "2K", blurb: "商品图默认。官方 size=2K，无水印。已实测。", verified: true },
  "gpt-image-2": { tags: ["Images API"], cost: "中转", size: "1024", blurb: "OpenAI Images 兼容。", verified: true },
  "gpt-image-1.5": { tags: ["Images API"], cost: "中转", size: "1024", blurb: "上一档 GPT Image。" },
  "gpt-image-1": { tags: ["Images API"], cost: "中转", size: "1024", blurb: "基础 GPT Image。" },
  "grok-imagine-image": { tags: ["Imagine", "宽松"], nsfw: true, cost: "中转", blurb: "Imagine 生图，尺度比 GPT Image 松。", verified: true },
  "grok-imagine-image-quality": { tags: ["Imagine", "高质"], nsfw: true, cost: "中转", blurb: "Imagine 高质量档。" },
  "grok-imagine-video": { tags: ["5–10s", "Imagine", "已实测"], nsfw: true, cost: "中转", size: "720p", blurb: "已实测出片。额度用尽会返回原文。", verified: true },
  "grok-imagine-video-1.5-preview": { tags: ["预览", "未实测"], nsfw: true, cost: "中转", size: "720p", blurb: "Imagine 1.5 预览档，未在本台实测。" },
  "grok-4.6": { tags: ["故事导演"], nsfw: true, cost: "中转", blurb: "分镜分析默认。", verified: true },
  "grok-4.5": { tags: ["故事导演"], nsfw: true, cost: "中转", blurb: "备用文本模型。" },
  "doubao-seedance-1.5-pro": { tags: ["Medium+", "套餐限制"], cost: "AFP", blurb: "Agent Plan Medium 起。当前 Small 档会拒绝，不假装能跑。" },
  "doubao-seedance-2.0": { tags: ["Large+", "套餐限制"], cost: "AFP", blurb: "走 contents/generations/tasks。Small 档未开通。" },
  "doubao-seedance-2.0-fast": { tags: ["Large+", "套餐限制"], cost: "AFP", blurb: "Seedance 2.0 加速档。当前套餐未开通。" },
  "doubao-seedance-2.0-mini": { tags: ["Large+", "套餐限制"], cost: "AFP", blurb: "Seedance 2.0 轻量档。当前套餐未开通。" },
  "flux-dev": { tags: ["NSFW", "Flux", "待接线"], nsfw: true, cost: "Fal", blurb: "Fal Flux Dev。填 Fal Key 后可用。" },
  "flux-schnell": { tags: ["NSFW", "快", "待接线"], nsfw: true, cost: "Fal", blurb: "Fal Flux Schnell。" },
  "flux-pro": { tags: ["NSFW", "Pro", "待接线"], nsfw: true, cost: "Fal", blurb: "Fal Flux Pro。" },
};

for (const engine of CIVITAI_ENGINES) {
  META[engine.id] = {
    tags: engine.tags,
    nsfw: engine.nsfw,
    cost: "Buzz",
    size: engine.kind === "image" ? "可调" : "官方",
    blurb: `Civitai ${engine.label}。mature 默认开。`,
    verified: engine.id === "krea2-turbo",
  };
}

function kindOf(provider: (typeof STUDIO_PROVIDERS)[number], model: string): ModelCard["kind"] {
  if (provider.videoModels.includes(model)) return "video";
  if (provider.audioModels.includes(model)) return "audio";
  if (provider.imageModels.includes(model)) return "image";
  return "text";
}

export const STUDIO_CATALOG: ModelCard[] = STUDIO_PROVIDERS.flatMap((provider) => {
  const models = [...new Set([...provider.imageModels, ...provider.videoModels, ...provider.textModels, ...provider.audioModels])];
  return models.map((model) => {
    const extra = META[model] || {};
    const kind = kindOf(provider, model);
    return {
      providerId: provider.id,
      provider: provider.name,
      model,
      kind,
      tags: extra.tags || provider.capabilities,
      nsfw: extra.nsfw ?? provider.nsfw ?? false,
      cost: extra.cost || (provider.enabled ? "已接线" : "待接线"),
      size: extra.size || "官方",
      docs: provider.remark,
      blurb: extra.blurb || provider.remark,
      wired: Boolean(provider.enabled && provider.apiKey),
      verified: extra.verified ?? false,
    } satisfies ModelCard;
  });
});

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

export function findCatalog(value: string) {
  return STUDIO_CATALOG.find((item) => catalogKey(item) === value);
}
