import { resolveImageModelCapability, type ImageCapabilityProvider } from "@/services/api/image-model-capabilities";
import type { StoryCast, StoryShot } from "./plan";

export const MAX_STORY_IMAGE_REFS = 5;

export function storyImageReferenceMax(model: string, provider?: ImageCapabilityProvider) {
  const capability = resolveImageModelCapability({ model, operation: "edit", provider });
  if (capability.referenceCount.state === "supported" && capability.referenceCount.max !== null) {
    return Math.max(1, capability.referenceCount.max);
  }
  return MAX_STORY_IMAGE_REFS;
}

export function stillSizeForQuality(quality: string, ratio: string) {
  const portrait = ratio === "9:16";
  const square = ratio === "1:1";
  if (quality === "4K" || quality === "3K" || quality === "high") {
    if (portrait) return "2160x3840";
    if (square) return "2048x2048";
    return "3840x2160";
  }
  if (quality === "2K" || quality === "medium") {
    if (portrait) return "1440x2560";
    if (square) return "1536x1536";
    return "2560x1440";
  }
  if (portrait) return "720x1280";
  if (square) return "1024x1024";
  return "1280x720";
}

export function shotCharacterRefs(cast: StoryCast[], shot: StoryShot, max = MAX_STORY_IMAGE_REFS): string[] {
  const appearing = new Set(shot.appearingCharacterIds || []);
  const preferred = appearing.size
    ? cast.filter((person) => appearing.has(person.id) && person.url)
    : cast.filter((person) => person.url);
  const extras = cast.filter((person) => person.url && !preferred.includes(person));
  const urls = [...preferred, ...extras]
    .map((person) => String(person.url || "").trim())
    .filter(Boolean);
  return Array.from(new Set(urls)).slice(0, max);
}

export function shotImageRefs(cast: StoryCast[], shots: StoryShot[], index: number, max = MAX_STORY_IMAGE_REFS): string[] {
  const character = shotCharacterRefs(cast, shots[index] || shots[0], max);
  const previous = shots
    .slice(0, Math.max(0, index))
    .map((shot) => String(shot.url || "").trim())
    .filter(Boolean);
  return Array.from(new Set([...character, ...previous])).slice(0, max);
}

export function lastFrameUrlForShot(shots: StoryShot[], index: number): string | undefined {
  const next = shots[index + 1]?.url || shots[shots.length - 1]?.url;
  const current = shots[index]?.url;
  if (next && next !== current) return next;
  return undefined;
}

export function storyStillUrls(shots: StoryShot[], max = MAX_STORY_IMAGE_REFS): string[] {
  return Array.from(new Set(shots.map((shot) => String(shot.url || "").trim()).filter(Boolean))).slice(0, max);
}

export function extraStillUrlsForVideo(shots: StoryShot[], index: number, max = MAX_STORY_IMAGE_REFS): string[] {
  const stills = storyStillUrls(shots, max);
  const first = shots[index]?.url;
  const last = lastFrameUrlForShot(shots, index);
  return stills.filter((url) => url !== first && url !== last).slice(0, Math.max(0, max - 2));
}

export function videoStillBundle(shots: StoryShot[], index = 0, max = MAX_STORY_IMAGE_REFS) {
  const stills = storyStillUrls(shots, max);
  const first = String(shots[index]?.url || stills[0] || "").trim();
  const last = lastFrameUrlForShot(shots, index) || stills[stills.length - 1] || "";
  const extras = extraStillUrlsForVideo(shots, index, max);
  return {
    first: first || undefined,
    last: last && last !== first ? last : undefined,
    extras,
    all: stills,
  };
}
