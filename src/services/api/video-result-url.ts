export function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function pathnameFromVideoResultUrl(raw: string) {
  const value = String(raw || "").trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname;
    } catch {
      return "";
    }
  }
  const cut = value.split("?")[0]?.split("#")[0] || "";
  if (!cut) return "";
  return cut.startsWith("/") ? cut : `/${cut}`;
}

/**
 * grok2api / official OpenAI-compatible hosts return `/v1/videos/{id}/content`.
 * Local relay already prefixes the provider's `/v1` base, so the proxy path
 * must be `/videos/{id}/content` (same as poll/create). Leaving `/v1` in the
 * relay path produces `/v1/v1/videos/...` and a 404.
 */
export function localRelayVideoDownloadPath(url: string) {
  const raw = String(url || "").trim();
  if (/\.(mp4|webm|mov|mkv)(?:[?#].*)?$/i.test(raw)) return "";

  const pathname = pathnameFromVideoResultUrl(url).replace(/\/+$/, "");
  if (!pathname) return "";
  const stripped = pathname.replace(/^\/v1(?=\/|$)/i, "") || pathname;
  const path = stripped.startsWith("/") ? stripped : `/${stripped}`;
  if (path.startsWith("/videos/") || path.startsWith("/media/videos/")) return path;
  return "";
}

export function isLocalRelayRelativeVideoUrl(value: string) {
  return Boolean(localRelayVideoDownloadPath(value));
}

export function resolveLocalVideoResultDownload(url: string) {
  const raw = String(url || "").trim();
  if (!raw) return { kind: "invalid" as const };
  const path = localRelayVideoDownloadPath(raw);
  if (path) return { kind: "relay" as const, path };
  if (isAbsoluteHttpUrl(raw)) return { kind: "fetch-url" as const, url: raw };
  return { kind: "invalid" as const };
}
