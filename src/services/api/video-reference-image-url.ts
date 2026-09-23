import { dataUrlToFile, isLikelyImageDataUrl } from "@/lib/image-utils";
import { uploadImageToConfiguredHost } from "@/services/image-host-upload";
import { imageToDataUrl } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import type { VideoReferenceImage } from "@/services/api/video-model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";

import {
  chooseVideoReferenceImageUrl,
  formatPublicVideoReferenceUrl,
  isReusableVideoReferenceUrl,
  videoReferenceImageAcceptsInlineDataUri,
} from "./video-reference-image-url-policy.ts";

export {
  chooseVideoReferenceImageUrl,
  formatPublicVideoReferenceUrl,
  isReusableVideoReferenceUrl,
  videoReferenceImageAcceptsInlineDataUri,
} from "./video-reference-image-url-policy.ts";

export async function resolveVideoReferenceImageUrl(
  config: Pick<AiConfig, "imageHostBaseUrl" | "imageHostApiKey">,
  image: VideoReferenceImage,
  capability?: { id?: string },
) {
  const directUrl = String(image.url || image.dataUrl || "").trim();
  const acceptsInline = videoReferenceImageAcceptsInlineDataUri(capability);

  // If the target capability natively accepts inline base64 data URIs (e.g. xAI Grok),
  // read the image dataUrl immediately and send it inline to avoid upstream plain http:// rejection.
  if (acceptsInline) {
    if (isLikelyImageDataUrl(directUrl)) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (dataUrl && isLikelyImageDataUrl(dataUrl)) return dataUrl;
  }

  const firstChoice = chooseVideoReferenceImageUrl({ capability, directUrl });
  if (firstChoice.kind !== "host") return firstChoice.url;

  if (isReusableVideoReferenceUrl(directUrl)) {
    return formatPublicVideoReferenceUrl(directUrl);
  }

  // 优先通过服务器端媒体落盘服务上传至 /works/，获得公网可访问的稳定 URL
  const uploadInput = image.dataUrl || image.url;
  if (uploadInput && typeof window !== "undefined") {
    try {
      const uploaded = await uploadMediaFile(uploadInput, "image");
      if (uploaded?.url) {
        return formatPublicVideoReferenceUrl(uploaded.url);
      }
    } catch (err) {
      console.warn("[resolveVideoReferenceImageUrl] 上传至作品存储失败，尝试图床回退:", err);
    }
  }

  const dataUrl = isLikelyImageDataUrl(directUrl) ? directUrl : await imageToDataUrl(image);
  if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
  const afterRead = chooseVideoReferenceImageUrl({ capability, directUrl, dataUrl });
  if (afterRead.kind !== "host") return afterRead.url;

  if (isLikelyImageDataUrl(dataUrl)) {
    const file = dataUrlToFile({ ...image, dataUrl });
    return uploadImageToConfiguredHost(config, file, file.name, { requirePublicResult: true });
  }

  if (directUrl) {
    return formatPublicVideoReferenceUrl(directUrl);
  }

  throw new Error("参考图不是有效的公网图片或 DataURL，无法提交视频生成");
}
