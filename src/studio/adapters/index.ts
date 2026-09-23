import type { StudioAdapter, StudioAdapterId } from "./types.ts";
import { openaiCompatAdapter } from "./openai-compat.ts";
import { xaiImagineAdapter } from "./xai-imagine.ts";
import { arkPlanAdapter } from "./ark-plan.ts";
import { civitaiAdapter } from "./civitai.ts";
import { agnesAdapter } from "./agnes.ts";
import { dashscopeAdapter } from "./dashscope.ts";
import { falAdapter } from "./fal.ts";
import { huggingfaceAdapter } from "./huggingface.ts";
import { modelscopeAdapter } from "./modelscope.ts";
import { sensenovaAdapter } from "./sensenova.ts";

const ADAPTERS: Record<StudioAdapterId, StudioAdapter> = {
  "openai-compat": openaiCompatAdapter,
  "xai-imagine": xaiImagineAdapter,
  "ark-plan": arkPlanAdapter,
  civitai: civitaiAdapter,
  agnes: agnesAdapter,
  dashscope: dashscopeAdapter,
  fal: falAdapter,
  huggingface: huggingfaceAdapter,
  modelscope: modelscopeAdapter,
  sensenova: sensenovaAdapter,
};

const ADAPTER_REGISTRY: Record<string, StudioAdapterId> = {
  ark: "ark-plan",
  "ark-plan": "ark-plan",
  civitai: "civitai",
  "civitai-orchestration": "civitai",
  "xai-imagine": "xai-imagine",
  xai: "xai-imagine",
  agnes: "agnes",
  dashscope: "dashscope",
  fal: "fal",
  huggingface: "huggingface",
  hf: "huggingface",
  "hf-inference": "huggingface",
  modelscope: "modelscope",
  ms: "modelscope",
  sensenova: "sensenova",
  miaohua: "sensenova",
  "sensenova-miaohua": "sensenova",
  openai: "openai-compat",
  "openai-compat": "openai-compat",
};

export function listStudioAdapters() {
  return Object.values(ADAPTERS);
}

export function getStudioAdapter(id: StudioAdapterId | string): StudioAdapter {
  const adapter = ADAPTERS[id as StudioAdapterId];
  if (!adapter) {
    throw new Error(`未知的 Studio 适配器: "${id}"。适配器未注册，禁止静默回退。`);
  }
  return adapter;
}

export function resolveAdapterId(input: {
  adapter?: string;
  adapterType?: string;
  model?: string;
  baseUrl?: string;
}): StudioAdapterId {
  const named = String(input.adapter || input.adapterType || "").trim().toLowerCase();
  if (named && ADAPTER_REGISTRY[named]) {
    return ADAPTER_REGISTRY[named];
  }
  if (named) {
    throw new Error(`未知的适配器类型 "${named}"，未在注册表中注册。`);
  }
  throw new Error("缺少明确的 adapterType 配置，禁止通过模型名或域名正则隐式猜测适配器。");
}

export function adapterForProvider(provider: { adapterType?: string; baseUrl?: string }, model?: string) {
  return getStudioAdapter(resolveAdapterId({ adapterType: provider.adapterType, baseUrl: provider.baseUrl, model }));
}

export type { StudioAdapter, StudioAdapterId, ImageGenInput, ImageGenResult, VideoCreateInput, TextGenInput } from "./types.ts";
