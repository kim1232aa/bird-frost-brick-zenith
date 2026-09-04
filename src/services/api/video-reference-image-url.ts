import { dataUrlToFile, isLikelyImageDataUrl } from "@/lib/image-utils";
import { uploadImageToConfiguredHost } from "@/services/image-host-upload";
import { imageToDataUrl } from "@/services/image-storage";
import type { VideoReferenceImage } from "@/services/api/video-model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";

import { chooseVideoReferenceImageUrl } from "./video-reference-image-url-policy.ts";

export {
  chooseVideoReferenceImageUrl,
  isReusableVideoReferenceUrl,
  videoReferenceImageAcceptsInlineDataUri,
} from "./video-reference-image-url-policy.ts";

export async function resolveVideoReferenceImageUrl(
  config: Pick<AiConfig, "imageHostBaseUrl" | "imageHostApiKey">,
  image: VideoReferenceImage,
  capability?: { id?: string },
) {
  const directUrl = String(image.url || image.dataUrl || "").trim();
  const firstChoice = chooseVideoReferenceImageUrl({ capability, directUrl });
  if (firstChoice.kind !== "host") return firstChoice.url;
  const dataUrl = isLikelyImageDataUrl(directUrl) ? directUrl : await imageToDataUrl(image);
  if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
  const afterRead = chooseVideoReferenceImageUrl({ capability, directUrl, dataUrl });
  if (afterRead.kind !== "host") return afterRead.url;
  const file = dataUrlToFile({ ...image, dataUrl });
  return uploadImageToConfiguredHost(config, file, file.name, { requirePublicResult: true });
}
