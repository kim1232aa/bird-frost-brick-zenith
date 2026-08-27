/** Official wire contracts. Register a new file here when adding an API. */

export function isXaiImagineVideoModel(model: string) {
  return /grok-imagine-video/i.test(model.trim());
}

export function isXaiImagineImageModel(model: string) {
  return /grok-imagine-image/i.test(model.trim());
}

export function isArkSeedreamModel(model: string) {
  return /seedream/i.test(model.trim());
}

export function isArkSeedanceModel(model: string) {
  return /seedance/i.test(model.trim());
}

export type XaiImagineVideoRequest = {
  model: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  image?: { url: string };
  last_frame_image?: { url: string };
  images?: Array<{ url: string }>;
  image_urls?: string[];
};

export function buildXaiImagineVideoBody(input: XaiImagineVideoRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
  };
  if (typeof input.duration === "number" && Number.isFinite(input.duration)) body.duration = input.duration;
  if (input.aspect_ratio) body.aspect_ratio = input.aspect_ratio;
  if (input.resolution) body.resolution = input.resolution;
  if (input.image?.url) body.image = { url: input.image.url };
  if (input.last_frame_image?.url) body.last_frame_image = { url: input.last_frame_image.url };
  const extras = (input.images || []).map((item) => item?.url).filter(Boolean);
  const urls = Array.from(new Set([...(input.image_urls || []), ...extras].filter(Boolean)));
  // Grok Imagine relay/official rejects `images: [{url}]` with HTTP 400 and accepts `image_urls`.
  if (urls.length) body.image_urls = urls;
  return body;
}

export function xaiImagineCreatePath() {
  return "/videos/generations";
}

export function xaiImaginePollPath(requestId: string) {
  return `/videos/${encodeURIComponent(requestId)}`;
}

export function readXaiImagineRequestId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return String(record.request_id || record.id || "").trim();
}

export function readXaiImaginePoll(data: unknown): { status: "pending" | "completed" | "failed"; url?: string; error?: string } {
  if (!data || typeof data !== "object") return { status: "failed", error: "视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  const video = record.video && typeof record.video === "object" ? (record.video as Record<string, unknown>) : undefined;
  const url = String(video?.url || record.video_url || record.url || "").trim();
  if (status === "done" || status === "completed" || status === "succeeded" || status === "success") {
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有返回地址" };
  }
  if (status === "failed" || status === "expired" || status === "cancelled" || status === "canceled") {
    return { status: "failed", error: String(record.error || record.message || `视频生成${status}`) };
  }
  if (url) return { status: "completed", url };
  return { status: "pending" };
}

export type ArkImageRequest = {
  model: string;
  prompt: string;
  size?: string;
  watermark?: boolean;
  output_format?: string;
};

export function buildArkImageBody(input: ArkImageRequest): Record<string, unknown> {
  return {
    model: input.model,
    prompt: input.prompt,
    size: input.size || "2K",
    watermark: input.watermark === true,
    output_format: input.output_format || "png",
  };
}

export function arkImageCreatePath() {
  return "/images/generations";
}

export function arkVideoCreatePath() {
  return "/contents/generations/tasks";
}

export function arkVideoPollPath(taskId: string) {
  return `/contents/generations/tasks/${encodeURIComponent(taskId)}`;
}

export function buildArkVideoBody(input: {
  model: string;
  prompt: string;
  duration?: number;
  ratio?: string;
  generateAudio?: boolean;
  watermark?: boolean;
  imageUrl?: string;
}): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
  if (input.imageUrl) content.push({ type: "image_url", image_url: { url: input.imageUrl } });
  return {
    model: input.model,
    content,
    ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
    ...(input.ratio ? { ratio: input.ratio } : {}),
    generate_audio: input.generateAudio !== false,
    watermark: input.watermark === true,
  };
}

export function readArkVideoTaskId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  return String((data as { id?: string }).id || "").trim();
}

export function readArkVideoPoll(data: unknown): { status: "pending" | "completed" | "failed"; url?: string; error?: string } {
  if (!data || typeof data !== "object") return { status: "failed", error: "视频任务返回为空" };
  const record = data as Record<string, unknown>;
  const status = String(record.status || "").toLowerCase();
  const content = record.content && typeof record.content === "object" ? (record.content as Record<string, unknown>) : undefined;
  const url = String(content?.video_url || record.video_url || record.url || "").trim();
  if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
    return url ? { status: "completed", url } : { status: "failed", error: "视频已完成但没有返回地址" };
  }
  if (status === "failed" || status === "expired" || status === "cancelled" || status === "canceled") {
    const err = record.error && typeof record.error === "object" ? (record.error as { message?: string }).message : "";
    return { status: "failed", error: String(err || record.message || `视频生成${status}`) };
  }
  if (url) return { status: "completed", url };
  return { status: "pending" };
}
