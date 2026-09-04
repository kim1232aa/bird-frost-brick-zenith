/** Official xAI video: I2V uses `image`; R2V uses up to 7 `reference_images`. They cannot mix. */

export const XAI_IMAGINE_VIDEO_REFERENCE_MAX = 7;

export function resolveXaiImagineVideoImageFields(input: {
  imageUrl?: string;
  lastFrameUrl?: string;
  imageUrls?: readonly string[];
  official?: boolean;
}) {
  const extras = (input.imageUrls || []).map((item) => String(item || "").trim()).filter(Boolean);
  const first = String(input.imageUrl || "").trim();
  const last = String(input.lastFrameUrl || "").trim();
  if (input.official && last) {
    throw new Error("xAI 官方视频没有静帧尾帧字段。延长请走 POST /v1/videos/extensions，当前未接线。");
  }
  const unique: string[] = [];
  for (const url of [first, ...extras]) {
    if (url && !unique.includes(url)) unique.push(url);
  }
  if (unique.length > 1) {
    return {
      mode: "reference-to-video" as const,
      image: undefined,
      last_frame_image: undefined,
      image_urls: unique.slice(0, XAI_IMAGINE_VIDEO_REFERENCE_MAX),
    };
  }
  return {
    mode: first ? "image-to-video" as const : "text-to-video" as const,
    image: first ? { url: first } : undefined,
    last_frame_image: last ? { url: last } : undefined,
    image_urls: [] as string[],
  };
}
