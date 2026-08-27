import type { StudioAdapterId } from "./adapters/types";

export type ProtocolId = StudioAdapterId;

export type EndpointMap = {
  chat?: string;
  images?: string;
  videosCreate?: string;
  videosPoll?: string;
  models?: string;
  test?: string;
};

export type ProtocolPreset = {
  id: ProtocolId;
  label: string;
  docs: string;
  blurb: string;
  defaultBaseUrl: string;
  authScheme: "Bearer" | "Key" | "x-api-key";
  endpoints: EndpointMap;
  exampleModels: string[];
};

export const PROTOCOL_PRESETS: ProtocolPreset[] = [
  {
    id: "openai-compat",
    label: "OpenAI 兼容",
    docs: "https://platform.openai.com/docs/api-reference/images",
    blurb: "Chat Completions + Images Generations。中转站（SuperXihe 等）用这个。",
    defaultBaseUrl: "https://api.openai.com/v1",
    authScheme: "Bearer",
    endpoints: {
      chat: "/chat/completions",
      images: "/images/generations",
      videosCreate: "/videos/generations",
      videosPoll: "/videos/{id}",
      models: "/models",
      test: "/models",
    },
    exampleModels: ["gpt-image-2", "gpt-4.1"],
  },
  {
    id: "xai-imagine",
    label: "xAI / Grok Imagine",
    docs: "https://docs.x.ai/docs/guides/image-generation",
    blurb: "Grok 文本走 /chat/completions，Imagine 图走 /images/generations，视频走 /videos/generations。",
    defaultBaseUrl: "https://api.x.ai/v1",
    authScheme: "Bearer",
    endpoints: {
      chat: "/chat/completions",
      images: "/images/generations",
      videosCreate: "/videos/generations",
      videosPoll: "/videos/{id}",
      models: "/models",
      test: "/models",
    },
    exampleModels: ["grok-4.6", "grok-imagine-image", "grok-imagine-video"],
  },
  {
    id: "ark-plan",
    label: "火山方舟 Agent Plan",
    docs: "https://www.volcengine.com/docs/82379/1399008",
    blurb: "必须用 /api/plan/v3，不是 /api/v3。生图 /images/generations，视频 /contents/generations/tasks。",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
    authScheme: "Bearer",
    endpoints: {
      images: "/images/generations",
      videosCreate: "/contents/generations/tasks",
      videosPoll: "/contents/generations/tasks/{id}",
      test: "/images/generations",
    },
    exampleModels: ["doubao-seedream-5.0-lite", "doubao-seedance-2.0"],
  },
  {
    id: "civitai",
    label: "Civitai Orchestration",
    docs: "https://developer.civitai.com/docs/api/orchestration",
    blurb: "官方 recipes：POST /imageGen、/videoGen。Base 是 orchestration.civitai.com/v2/consumer/recipes。",
    defaultBaseUrl: "https://orchestration.civitai.com/v2/consumer/recipes",
    authScheme: "Bearer",
    endpoints: {
      images: "/imageGen?wait=1",
      videosCreate: "/videoGen?wait=0",
      videosPoll: "/jobs/{id}",
      test: "/imageGen?wait=0",
    },
    exampleModels: ["krea2-turbo", "flux1", "sdxl"],
  },
  {
    id: "dashscope",
    label: "阿里云百炼 DashScope",
    docs: "https://help.aliyun.com/zh/model-studio/developer-reference",
    blurb: "不要用 compatible-mode /images/generations。Qwen-Image 走 multimodal-generation；万相走 text2image/image-synthesis。",
    defaultBaseUrl: "https://dashscope.aliyuncs.com",
    authScheme: "Bearer",
    endpoints: {
      chat: "/compatible-mode/v1/chat/completions",
      images: "/api/v1/services/aigc/multimodal-generation/generation",
      videosCreate: "/api/v1/services/aigc/video-generation/video-synthesis",
      videosPoll: "/api/v1/tasks/{id}",
      test: "/api/v1/services/aigc/text2image/image-synthesis",
    },
    exampleModels: ["qwen-plus", "qwen-image-plus", "wan2.6-t2v"],
  },
  {
    id: "fal",
    label: "Fal.ai",
    docs: "https://fal.ai/models",
    blurb: "Key 鉴权。路径按模型走 /fal-ai/{model}。适合 Flux 等 NSFW 友好模型。",
    defaultBaseUrl: "https://fal.run",
    authScheme: "Key",
    endpoints: {
      images: "/fal-ai/flux/dev",
      test: "/fal-ai/flux/dev",
    },
    exampleModels: ["flux-dev", "flux-schnell"],
  },
  {
    id: "agnes",
    label: "Agnes AI",
    docs: "https://www.agnes-ai.com/zh-Hans/docs/agnes-image-21-flash.md",
    blurb: "官方 apihub。生图 2.1 Flash，视频 2.5 Flash。",
    defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
    authScheme: "Bearer",
    endpoints: {
      chat: "/chat/completions",
      images: "/images/generations",
      videosCreate: "/videos",
      videosPoll: "/videos/{id}",
      models: "/models",
      test: "/models",
    },
    exampleModels: ["agnes-image-2.1-flash", "agnes-video-2.5-flash"],
  },
  {
    id: "sensenova",
    label: "商汤日日新",
    docs: "https://platform.sensenova.cn/docs",
    blurb: "官方 Token 端点。生图 U1 Fast，默认 2048x2048。",
    defaultBaseUrl: "https://token.sensenova.cn/v1",
    authScheme: "Bearer",
    endpoints: {
      chat: "/chat-completions",
      images: "/images/generations",
      test: "/models",
    },
    exampleModels: ["nova-ptc-xl-v1"],
  },
  {
    id: "modelscope",
    label: "ModelScope 魔搭",
    docs: "https://www.modelscope.ai/docs/model-service/API-Inference/intro",
    blurb: "Access Token 鉴权。国际站 api-inference.modelscope.ai。生图走 /v1/images/generations，异步轮询 /v1/tasks。",
    defaultBaseUrl: "https://api-inference.modelscope.ai/v1",
    authScheme: "Bearer",
    endpoints: {
      images: "/images/generations",
      test: "/images/generations",
    },
    exampleModels: ["Qwen/Qwen-Image", "Tongyi-MAI/Z-Image-Turbo"],
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    docs: "https://huggingface.co/docs/inference-providers/index",
    blurb: "hf_ token。生图走 nscale OpenAI 兼容 /v1/images/generations。",
    defaultBaseUrl: "https://router.huggingface.co/nscale/v1",
    authScheme: "Bearer",
    endpoints: {
      images: "/images/generations",
      models: "/models",
      test: "/models",
    },
    exampleModels: ["black-forest-labs/FLUX.1-schnell", "Tongyi-MAI/Z-Image-Turbo"],
  },
];

export function protocolById(id: string) {
  return PROTOCOL_PRESETS.find((item) => item.id === id) || PROTOCOL_PRESETS[0];
}
