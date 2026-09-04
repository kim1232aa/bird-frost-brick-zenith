async function blobToDataUrl(blob: Blob) {
  if (blob.size > 12_000_000) throw new Error("作品文件过大，无法写入作品库");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function fetchBlob(url: string, errorLabel = "媒体读取失败") {
  const response = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`${errorLabel} HTTP ${response.status}`);
  return response.blob();
}

/** Same-origin path / blob / http → data URL. Cross-origin http may fail in the browser. */
export async function toDataUrl(url: string) {
  if (!url || url.startsWith("data:")) return url;
  return blobToDataUrl(await fetchBlob(url, "图片读取失败"));
}

/** Convert only what the browser can read without CORS. Leave https for the provider/server. */
export async function toDataUrlIfLocal(url: string) {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith("/") || url.startsWith("blob:")) return toDataUrl(url);
  return url;
}

export type PersistUrlOptions = {
  kind: string;
  index: number;
};

function uploadMimeType(blob: Blob, kind: string) {
  const detected = blob.type.trim().toLowerCase();
  if (kind === "video" && !detected.startsWith("video/")) return "video/mp4";
  if ((kind === "image" || kind === "story" || kind === "ecommerce") && !detected.startsWith("image/")) return "image/png";
  return detected || "application/octet-stream";
}

async function uploadLocalMedia(url: string, options: PersistUrlOptions) {
  const blob = await fetchBlob(url);
  const contentType = uploadMimeType(blob, options.kind.trim().toLowerCase());
  const response = await fetch("/client-api/upload-work-media", {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-Work-Kind": options.kind,
      "X-Work-Index": String(options.index),
    },
    body: blob,
  });
  let payload: { ok?: boolean; url?: string; error?: string } = {};
  try {
    payload = await response.json() as typeof payload;
  } catch {
    /* keep the HTTP status as the useful error */
  }
  if (!response.ok || payload.ok !== true || !payload.url?.startsWith("/works/")) {
    throw new Error(payload.error || `作品媒体上传失败 HTTP ${response.status}`);
  }
  return payload.url;
}

/** Persist generated local media as a served /works URL; remote URLs stay untouched. */
export async function persistUrl(url: string, options?: PersistUrlOptions) {
  if (!url) return url;
  if (options && (url.startsWith("blob:") || url.startsWith("data:"))) {
    return uploadLocalMedia(url, options);
  }
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/works/") || url.startsWith("/gallery/")) return url;
  if (url.startsWith("blob:")) return toDataUrl(url);
  return url;
}
