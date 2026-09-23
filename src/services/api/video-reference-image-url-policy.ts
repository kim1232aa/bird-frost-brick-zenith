import { isLikelyImageDataUrl } from "../../lib/image-utils.ts";

export function videoReferenceImageAcceptsInlineDataUri(capability: { id?: string } | undefined) {
  return capability?.id === "xai-imagine-video";
}

export function isReusableVideoReferenceUrl(value: string) {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (/^blob:/i.test(trimmed) || /^data:/i.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith("/works/") || trimmed.startsWith("works/")) return true;
  return false;
}

export function formatPublicVideoReferenceUrl(url: string) {
  let clean = String(url || "").trim();
  const loopbackMatch = clean.match(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/(works\/.*)$/i);
  if (loopbackMatch) {
    clean = "/" + loopbackMatch[1];
  }
  if (/^https?:\/\//i.test(clean) && !/127\.0\.0\.1|localhost/i.test(clean)) {
    return clean;
  }
  const path = clean.startsWith("/") ? clean : "/" + clean;
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return origin + path;
    }
  }
  // No usable public origin (SSR, or a loopback preview): stay relative rather
  // than hard-coding a deployment host. Callers that need an absolute URL must
  // supply the origin.
  return path;
}

export function chooseVideoReferenceImageUrl(options: {
  capability?: { id?: string };
  directUrl?: string;
  dataUrl?: string;
}) {
  const acceptsInline = videoReferenceImageAcceptsInlineDataUri(options.capability);
  const directUrl = String(options.directUrl || "").trim();
  const dataUrl = String(options.dataUrl || "").trim();

  // If the target capability natively accepts inline base64 data URIs (e.g. xAI Grok),
  // prefer inline data URIs whenever available or when the URL is plain http://
  // (because xAI rejects plain http:// URLs with "Fetching images over plain http:// is not supported").
  if (acceptsInline) {
    if (isLikelyImageDataUrl(directUrl)) return { kind: "inline" as const, url: directUrl };
    if (isLikelyImageDataUrl(dataUrl)) return { kind: "inline" as const, url: dataUrl };
  }

  if (isReusableVideoReferenceUrl(directUrl)) {
    const formatted = formatPublicVideoReferenceUrl(directUrl);
    // If formatted URL is plain http:// and capability accepts inline data URIs,
    // fallback to dataUrl if we have it to avoid upstream plain http:// rejection.
    if (acceptsInline && formatted.startsWith("http://") && isLikelyImageDataUrl(dataUrl)) {
      return { kind: "inline" as const, url: dataUrl };
    }
    return { kind: "reuse" as const, url: formatted };
  }

  if (isReusableVideoReferenceUrl(dataUrl)) {
    const formatted = formatPublicVideoReferenceUrl(dataUrl);
    if (acceptsInline && formatted.startsWith("http://") && isLikelyImageDataUrl(directUrl)) {
      return { kind: "inline" as const, url: directUrl };
    }
    return { kind: "reuse" as const, url: formatted };
  }

  return { kind: "host" as const };
}
