import { parseCivitaiLoraAir } from "./civitai-lora-resource.ts";

export interface UniversalLoraItem {
  id: string;
  path: string;
  scale?: number;
  triggerWords?: string[];
}

export type FalLoraWeight = {
  path: string;
  scale: number;
};

export type UniversalLoraWire = FalLoraWeight[] | Record<string, number> | string;

export type UniversalLoraTranslationOptions = {
  model?: string;
};

/**
 * Translate only into provider contracts that are explicitly represented by
 * the adapters. Unsupported providers fail instead of receiving guessed node
 * or prompt syntax.
 */
export function translateLorasForProvider(
  loras: readonly UniversalLoraItem[],
  provider: string,
  options: UniversalLoraTranslationOptions = {},
): UniversalLoraWire | undefined {
  if (!Array.isArray(loras) || loras.length === 0) return undefined;
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  switch (normalizedProvider) {
    case "fal":
      return loras.map(toFalLora);
    case "civitai":
      return toCivitaiLoraMap(loras);
    case "modelscope":
      return toModelScopeQwenLoras(loras, options.model);
    default:
      throw new Error(`Provider ${provider || "未知"} 没有已验证的 LoRA wire contract；不会伪造请求字段`);
  }
}

export function isQwenImageModel(model: string | undefined) {
  return /qwen[-/]image/i.test(String(model || "").trim());
}

function toFalLora(item: UniversalLoraItem): FalLoraWeight {
  const path = requiredPath(item, "Fal");
  if (/^\d+$/u.test(path)) {
    throw new Error(`Fal LoRA ${path} 只有数字 identity；不会猜测 Civitai 下载 URL，请提供公开权重 path`);
  }
  return { path, scale: finiteScale(item, path) };
}

function toCivitaiLoraMap(loras: readonly UniversalLoraItem[]) {
  const result: Record<string, number> = {};
  for (const item of loras) {
    const identity = requiredPath(item, "Civitai");
    const parsed = parseCivitaiLoraAir(identity);
    if (!parsed) {
      throw new Error(`Civitai LoRA 必须是完整 model-version AIR；不会把 ${identity} 猜成 AIR`);
    }
    if (Object.prototype.hasOwnProperty.call(result, parsed.air)) {
      throw new Error(`多个 LoRA 解析为同一个 Civitai AIR：${parsed.air}`);
    }
    result[parsed.air] = finiteScale(item, parsed.air);
  }
  return result;
}

function toModelScopeQwenLoras(loras: readonly UniversalLoraItem[], model?: string): UniversalLoraWire {
  if (!isQwenImageModel(model)) {
    throw new Error(`ModelScope LoRA 只对已验证的 Qwen Image 模型开放；当前模型 ${model || "未提供"} 没有已验证合同`);
  }
  const entries = loras.map((item) => {
    const path = requiredPath(item, "ModelScope");
    if (/^\d+$/u.test(path)) throw new Error(`ModelScope LoRA ${path} 不是可解析的 repo/path`);
    const scale = finiteScale(item, path);
    if (scale < 0) throw new Error(`ModelScope LoRA ${path} 的权重不能为负数`);
    return { path, scale };
  });
  const duplicate = new Set<string>();
  if (entries.some((entry) => duplicate.has(entry.path) || (duplicate.add(entry.path), false))) {
    throw new Error("ModelScope LoRA path 重复；请保留一条并明确权重");
  }
  const total = entries.reduce((sum, entry) => sum + entry.scale, 0);
  if (!(total > 0)) throw new Error("ModelScope LoRA 权重总和必须大于 0");
  if (entries.length === 1 && entries[0].scale === 1) return entries[0].path;

  const normalized: Record<string, number> = {};
  let assigned = 0;
  entries.forEach((entry, index) => {
    const value = index === entries.length - 1
      ? roundWeight(1 - assigned)
      : roundWeight(entry.scale / total);
    normalized[entry.path] = value;
    assigned += value;
  });
  return normalized;
}

function requiredPath(item: UniversalLoraItem, provider: string) {
  const path = String(item.path || "").trim();
  if (!path) throw new Error(`${provider} LoRA 缺少显式 path/identity`);
  return path;
}

function finiteScale(item: UniversalLoraItem, path: string) {
  const scale = item.scale ?? 1;
  if (typeof scale !== "number" || !Number.isFinite(scale)) {
    throw new Error(`${path} 的 LoRA 权重必须是有限数字`);
  }
  return scale;
}

function roundWeight(value: number) {
  return Number(value.toFixed(6));
}
