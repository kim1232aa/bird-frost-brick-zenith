/**
 * Video duration options logic for different providers.
 * OpenAI official /videos endpoint only accepts seconds: 4, 8, 12.
 * Other providers can use [4, 5, 6, 8, 10].
 */

export function isOpenAiOfficial(host?: string, protocol?: string): boolean {
  const trimmed = String(host || "").trim();
  if (protocol === "openai-official") return true;
  try {
    const url = new URL(trimmed);
    return url.hostname === "api.openai.com";
  } catch {
    return false;
  }
}

export function isOfficialXai(host?: string): boolean {
  try {
    return new URL(String(host || "").trim()).hostname.toLowerCase() === "api.x.ai";
  } catch {
    return false;
  }
}

export const OPENAI_OFFICIAL_DURATION_OPTIONS = [4, 8, 12] as const;
export const GENERIC_DURATION_OPTIONS = [4, 5, 6, 8, 10] as const;
/** Official xAI video duration is 1–15 seconds; includes the generic chips. */
export const XAI_OFFICIAL_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export function videoDurationOptions(host?: string, protocol?: string): readonly number[] {
  if (isOpenAiOfficial(host, protocol)) return OPENAI_OFFICIAL_DURATION_OPTIONS;
  if (isOfficialXai(host)) return XAI_OFFICIAL_DURATION_OPTIONS;
  return GENERIC_DURATION_OPTIONS;
}

export function normalizeVideoDuration(duration: number, host?: string, protocol?: string): number {
  const options = videoDurationOptions(host, protocol);
  // Check if duration is already valid
  for (const opt of options) {
    if (duration === opt) return duration;
  }

  // Find closest valid duration
  let closest = options[0];
  let minDiff = Math.abs(duration - closest);
  for (const opt of options) {
    const diff = Math.abs(duration - opt);
    if (diff < minDiff) {
      minDiff = diff;
      closest = opt;
    }
  }
  return closest;
}
