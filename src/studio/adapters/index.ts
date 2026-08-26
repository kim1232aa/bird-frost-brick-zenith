import type { ApiRelayProvider } from "@/stores/api-relay-config";
import type { StudioAdapter, StudioAdapterId } from "./types";
import { openaiCompatAdapter } from "./openai-compat";
import { xaiImagineAdapter } from "./xai-imagine";
import { arkPlanAdapter } from "./ark-plan";
import { civitaiAdapter } from "./civitai";
import { agnesAdapter } from "./agnes";
import { dashscopeAdapter } from "./dashscope";
import { falAdapter } from "./fal";
import { sensenovaAdapter } from "./sensenova";
import { modelscopeAdapter } from "./modelscope";
import { huggingfaceAdapter } from "./huggingface";

const ADAPTERS: Record<StudioAdapterId, StudioAdapter> = {
  "openai-compat": openaiCompatAdapter,
  "xai-imagine": xaiImagineAdapter,
  "ark-plan": arkPlanAdapter,
  civitai: civitaiAdapter,
  agnes: agnesAdapter,
  dashscope: dashscopeAdapter,
  fal: falAdapter,
  sensenova: sensenovaAdapter,
  modelscope: modelscopeAdapter,
  huggingface: huggingfaceAdapter,
};

export function listStudioAdapters() {
  return Object.values(ADAPTERS);
}

export function getStudioAdapter(id: StudioAdapterId | string) {
  return ADAPTERS[id as StudioAdapterId] || ADAPTERS["openai-compat"];
}

export function resolveAdapterId(input: {
  adapter?: string;
  adapterType?: string;
  model?: string;
  baseUrl?: string;
}): StudioAdapterId {
  const named = String(input.adapter || input.adapterType || "").toLowerCase();
  if (named === "ark" || named === "ark-plan") return "ark-plan";
  if (named === "civitai" || named === "civitai-orchestration") return "civitai";
  if (named === "xai-imagine" || named === "xai") return "xai-imagine";
  if (named === "agnes") return "agnes";
  if (named === "dashscope") return "dashscope";
  if (named === "fal") return "fal";
  if (named === "sensenova" || named === "miaohua" || named === "sensenova-miaohua") return "sensenova";
  if (named === "modelscope" || named === "魔搭") return "modelscope";
  if (named === "huggingface" || named === "hf") return "huggingface";
  if (named === "openai" || named === "openai-compat") return "openai-compat";
  const model = String(input.model || "");
  if (/grok-imagine/i.test(model)) return "xai-imagine";
  if (/seedream|seedance/i.test(model)) return "ark-plan";
  const host = String(input.baseUrl || "").toLowerCase();
  if (host.includes("modelscope")) return "modelscope";
  if (host.includes("huggingface") || host.includes("hf.co")) return "huggingface";
  if (host.includes("volces.com") || host.includes("/api/plan/v3")) return "ark-plan";
  if (host.includes("civitai.com")) return "civitai";
  if (host.includes("agnes-ai.com")) return "agnes";
  if (host.includes("dashscope") || host.includes("aliyuncs.com")) return "dashscope";
  if (host.includes("fal.run") || host.includes("fal.ai")) return "fal";
  if (host.includes("sensenova")) return "sensenova";
  if (host.includes("x.ai")) return "xai-imagine";
  return "openai-compat";
}

export function adapterForProvider(provider: Pick<ApiRelayProvider, "adapterType" | "baseUrl">, model?: string) {
  return getStudioAdapter(resolveAdapterId({ adapterType: provider.adapterType, baseUrl: provider.baseUrl, model }));
}

export type { StudioAdapter, StudioAdapterId, ImageGenInput, VideoCreateInput, TextGenInput } from "./types";
