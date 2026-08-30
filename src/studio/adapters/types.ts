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
  provider: Pick<ApiRelayProvider, "id" | "baseUrl" | "apiKey" | "apiKeys" | "hasApiKey" | "adapterType" | "endpoints" | "authScheme" | "protocol" | "allowMatureContent">;
};

export type ImageGenInput = {
  model: string;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  seed?: number;
  imageUrl?: string;
  /** Up to 5 reference images. Adapters must submit the whole list, not only the first. */
  imageUrls?: string[];
  negativePrompt?: string;
  quality?: string;
  maskUrl?: string;
  /** Canonical Civitai batch count; image adapters may also consume n. */
  quantity?: number;
  n?: number;
  operation?: "generate" | "edit";
  loras?: Record<string, number> | Readonly<Record<string, number>>;
  strength?: number;
  /** Civitai Flux1 / SDXL checkpoint AIR. Never invent one. */
  checkpointAir?: string;
};

export type ImageGenResult = {
  url: string;
  urls?: string[];
};

export type VideoCreateInput = {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  /** Extra stills beyond first/last. Submit up to the model's reference capacity (Grok Imagine: 5). */
  imageUrls?: string[];
  /** Verified pixel dimensions for adapters whose wire contract requires them. */
  width?: number;
  height?: number;
  generateAudio?: boolean;
  fps?: number;
  negativePrompt?: string;
  /** Civitai LTX 2.3 (map) / Hunyuan (array). Other models must not send this. */
  loras?: Record<string, number> | Readonly<Record<string, number>>;
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
  format?: string;
  speed?: number;
};

export type StudioAdapter = {
  id: StudioAdapterId;
  label: string;
  docs: string;
  generateImage?: (ctx: AdapterContext, input: ImageGenInput) => Promise<ImageGenResult>;
  createVideo?: (ctx: AdapterContext, input: VideoCreateInput) => Promise<{ id: string }>;
  pollVideo?: (ctx: AdapterContext, taskId: string) => Promise<VideoPollResult>;
  generateText?: (ctx: AdapterContext, input: TextGenInput) => Promise<{ text: string }>;
  generateAudio?: (ctx: AdapterContext, input: AudioGenInput) => Promise<{ url: string }>;
  testConnection?: (ctx: AdapterContext) => Promise<{ ok: boolean; message: string; models?: string[] }>;
};
