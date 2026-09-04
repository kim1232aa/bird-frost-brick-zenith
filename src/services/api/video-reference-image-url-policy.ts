import { isLikelyImageDataUrl } from "../../lib/image-utils.ts";

export function videoReferenceImageAcceptsInlineDataUri(capability: { id?: string } | undefined) {
  return capability?.id === "xai-imagine-video";
}

export function isReusableVideoReferenceUrl(value: string) {
  return /^https?:\/\//i.test(value || "");
}

export function chooseVideoReferenceImageUrl(options: {
  capability?: { id?: string };
  directUrl?: string;
  dataUrl?: string;
}) {
  const directUrl = String(options.directUrl || "").trim();
  if (isReusableVideoReferenceUrl(directUrl)) return { kind: "reuse" as const, url: directUrl };
  const acceptsInline = videoReferenceImageAcceptsInlineDataUri(options.capability);
  if (acceptsInline && isLikelyImageDataUrl(directUrl)) return { kind: "inline" as const, url: directUrl };
  const dataUrl = String(options.dataUrl || "").trim();
  if (acceptsInline && isLikelyImageDataUrl(dataUrl)) return { kind: "inline" as const, url: dataUrl };
  return { kind: "host" as const };
}
