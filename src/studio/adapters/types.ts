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
  /** All reference images for this request. Adapters must submit the whole list, not only the first. */
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
  /** Sampling steps for engines that accept them (fal flux-1 等映射为 num_inference_steps)。 */
  steps?: number;
  /** Guidance / CFG for engines that accept it (fal flux-dev 映射为 guidance_scale)。 */
  guidance?: number;
  /** Provider-published sampler name, when the selected image contract accepts one. */
  sampler?: string;
  /** Provider-published scheduler name, when the selected image contract accepts one. */
  scheduler?: string;
  /** DashScope qwen-image/wanx：水印开关；不传用上游默认。 */
  watermark?: boolean;
  /** DashScope qwen-image/wanx：prompt_extend 智能改写；不传用上游默认。 */
  promptExpansion?: boolean;
  cfgScale?: number;
  denoise?: number;
  engine?: string;
  comfy?: string;
  advanced?: Record<string, unknown>;
  extraParams?: Record<string, unknown>;
  [key: string]: unknown;
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
  /** Extra stills beyond first/last. Official xAI R2V accepts up to 7 `reference_images`. */
  imageUrls?: string[];
  /** Verified pixel dimensions for adapters whose wire contract requires them. */
  width?: number;
  height?: number;
  generateAudio?: boolean;
  fps?: number;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  modelVariant?: string;
  watermark?: boolean;
  promptExpansion?: boolean;
  returnLastFrame?: boolean;
  /** Official audio URL fields such as DashScope input.audio_url / driving_audio. */
  audioUrl?: string;
  /** Civitai LTX 2.3 (map) / Hunyuan (array). Other models must not send this. */
  loras?: Record<string, number> | Readonly<Record<string, number>>;
  /**
   * Official frame count. Agnes V2.0 sends this as `num_frames` (8n+1, ≤441).
   * https://agnes-ai.com/en/docs/agnes-video-v20
   */
  frames?: number;
  /** DashScope video-edit `parameters.audio_setting`: auto | origin. */
  audioMode?: string;
  /** Civitai LTX 2.3 live schema `quantity` (1–10). */
  quantity?: number;
  /**
   * Provider-specific quality/motion mode.
   * Civitai Kling live schema: standard | professional.
   * Civitai Vidu live schema: movementAmplitude auto | small | medium | large.
   */
  mode?: string;
  /** Civitai LTX firstLastFrameToVideo `frameGuideStrength` (0–1). */
  frameGuideStrength?: number;
  /** Civitai Wan live schema `enableSafetyChecker`. */
  safetyChecker?: boolean;
  /** Civitai Wan v2.2 FAL live schema `shift` (1–10). */
  shift?: number;
  /**
   * Turbo switch. Civitai Wan v2.2 FAL sends `useTurbo`;
   * Civitai Vidu Q3 sends `turbo`.
   */
  turbo?: boolean;
  /** Official sampler name when a video model publishes one. */
  sampler?: string;
  /** Official scheduler name when a video model publishes one. */
  scheduler?: string;
  /** Civitai Sora live schema `usePro`. */
  usePro?: boolean;
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
  timeoutMs?: number;
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
