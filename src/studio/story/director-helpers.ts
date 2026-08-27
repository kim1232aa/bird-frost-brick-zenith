import type { StoryCast, StoryShot } from "@/studio/story/plan";

/** Prefer characters that actually appear in the shot, then mains, cap 3. */
export function shotCharacterRefs(shot: StoryShot, people: StoryCast[]): string[] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const names = new Set((shot.characters || []).map((name) => name.trim()).filter(Boolean));
  const appearing = (shot.appearingCharacterIds || [])
    .map((id) => byId.get(id))
    .filter((person): person is StoryCast => Boolean(person));
  const named = people.filter((person) => names.has(person.name));
  const mains = people.filter((person) => person.importance === "main");
  const ordered = [...appearing, ...named, ...mains, ...people];
  const urls = ordered.map((person) => String(person.url || "").trim()).filter(Boolean);
  return Array.from(new Set(urls)).slice(0, 3);
}

export function stillSizeForQuality(ratio: string, quality: string) {
  const q = String(quality || "").toUpperCase();
  if (ratio === "9:16") {
    if (q === "3K" || q === "HIGH" || q === "4K") return "1440x2560";
    if (q === "2K" || q === "MEDIUM") return "1080x1920";
    return "720x1280";
  }
  if (ratio === "1:1") {
    if (q === "3K" || q === "HIGH" || q === "4K") return "2048x2048";
    if (q === "2K" || q === "MEDIUM") return "1536x1536";
    return "1024x1024";
  }
  if (q === "3K" || q === "HIGH" || q === "4K") return "2560x1440";
  if (q === "2K" || q === "MEDIUM") return "1920x1080";
  return "1280x720";
}

export function videoResolutionForQuality(quality: string) {
  const q = String(quality || "").toUpperCase();
  if (q === "3K" || q === "HIGH" || q === "4K") return "1080p";
  if (q === "2K" || q === "MEDIUM") return "720p";
  return "480p";
}

export function lastFrameUrlForShot(shots: StoryShot[], index: number) {
  const next = shots[index + 1];
  return String(next?.url || "").trim();
}
