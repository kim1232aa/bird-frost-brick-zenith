"use client";

import { catalogKey, type ModelCard } from "./catalog";
import { liveCatalog } from "./ops";
import { ModelMenu } from "./model-menu";

export function CompactModelSelect({
  kind,
  value,
  onChange,
  label,
}: {
  kind: ModelCard["kind"];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return <ModelMenu kind={kind} value={value} onChange={onChange} label={label} />;
}

export function preferredVideoKey() {
  const videos = liveCatalog("video", true);
  const grok = videos.find((item) => item.model === "grok-imagine-video");
  return grok ? catalogKey(grok) : videos[0] ? catalogKey(videos[0]) : "";
}

export function preferredImageKey() {
  const images = liveCatalog("image", true);
  const seedream = images.find((item) => item.model === "doubao-seedream-5.0-lite");
  return seedream ? catalogKey(seedream) : images[0] ? catalogKey(images[0]) : "";
}

export function preferredTextKey() {
  const texts = liveCatalog("text", true);
  const grok = texts.find((item) => item.model === "grok-4.6");
  return grok ? catalogKey(grok) : texts[0] ? catalogKey(texts[0]) : "";
}

export function preferredAudioKey() {
  const audios = liveCatalog("audio", false);
  return audios[0] ? catalogKey(audios[0]) : "";
}
