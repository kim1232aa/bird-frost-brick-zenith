import type { ApiRelayProvider } from "@/stores/api-relay-config";

export type StudioAdapterId =
  | "openai-compat"
  | "xai-imagine"
  | "ark-plan"
  | "civitai"
  | "agnes"
  | "dashscope"
  | "fal"
  | "sensenova"
  | "modelscope"
  | "huggingface";

export type AdapterContext = {
  provider: Pick<ApiRelayProvider, "id" | "baseUrl" | "apiKey" | "apiKeys" | "adapterType" | "endpoints" | "authScheme">;
};

export type ImageGenInput = {
  model: string;
  prompt: string;
  size?: string;
  width?: number;
  height?: number;
  seed?: number;
  imageUrl?: string;
  negativePrompt?: string;
  n?: number;
};

export type VideoCreateInput = {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  generateAudio?: boolean;
  negativePrompt?: string;
};

export type VideoPollResult = {
  status: "pending" | "completed" | "failed";
  url?: string;
  error?: string;
};

export type TextGenInput = {
  model: string;
  prompt: string;
  system?: string;
  json?: boolean;
  imageUrl?: string;
};

export type AudioGenInput = {
  model: string;
  prompt: string;
  voice?: string;
};

export type StudioAdapter = {
  id: StudioAdapterId;
  label: string;
  docs: string;
  generateImage?: (ctx: AdapterContext, input: ImageGenInput) => Promise<{ url: string }>;
  createVideo?: (ctx: AdapterContext, input: VideoCreateInput) => Promise<{ id: string }>;
  pollVideo?: (ctx: AdapterContext, taskId: string) => Promise<VideoPollResult>;
  generateText?: (ctx: AdapterContext, input: TextGenInput) => Promise<{ text: string }>;
  generateAudio?: (ctx: AdapterContext, input: AudioGenInput) => Promise<{ url: string }>;
  testConnection?: (ctx: AdapterContext) => Promise<{ ok: boolean; message: string; models?: string[] }>;
};
