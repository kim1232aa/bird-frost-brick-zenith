type CanvasVideoResultDisplayMetadata = {
  seconds?: unknown;
  seedanceDuration?: unknown;
  model?: unknown;
  modelProviderId?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function canvasVideoDurationLabel(metadata: CanvasVideoResultDisplayMetadata) {
  const duration = text(metadata.seedanceDuration) || text(metadata.seconds);
  return duration ? `${duration}s` : "时长未记录";
}

export function canvasVideoModelLabel(metadata: CanvasVideoResultDisplayMetadata) {
  const model = text(metadata.model);
  const providerId = text(metadata.modelProviderId);
  if (providerId && model) return `${providerId} · ${model}`;
  if (model) return `模型 ${model}`;
  if (providerId) return `来源 ${providerId}`;
  return "来源未记录";
}

const COMMON_ASPECT_RATIOS = [
  [1, 1],
  [4, 3],
  [3, 4],
  [16, 9],
  [9, 16],
  [21, 9],
] as const;

export function canvasVideoAspectRatioLabel(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "";
  const ratio = width / height;
  const common = COMMON_ASPECT_RATIOS.find(([w, h]) => Math.abs(ratio - w / h) < 0.015);
  if (common) return `${common[0]}:${common[1]}`;
  return `${ratio.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}:1`;
}
