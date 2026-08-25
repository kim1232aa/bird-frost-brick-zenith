"use client";

import { catalogKey, type ModelCard } from "./catalog";
import { liveCatalog } from "./ops";

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
  const cards = liveCatalog(kind, true);
  const groups = new Map<string, ModelCard[]>();
  for (const card of cards) {
    const list = groups.get(card.provider) || [];
    list.push(card);
    groups.set(card.provider, list);
  }
  const fallback =
    kind === "image" ? "生图模型" : kind === "video" ? "视频模型" : kind === "audio" ? "音频模型" : "文本模型";
  const safeValue = cards.some((card) => catalogKey(card) === value) ? value : cards[0] ? catalogKey(cards[0]) : "";
  return (
    <label className="model-picker">
      {label || fallback}
      <select value={safeValue} onChange={(event) => onChange(event.target.value)}>
        {groups.size === 0 ? <option value="">暂无已接线模型</option> : null}
        {[...groups.entries()].map(([provider, list]) => (
          <optgroup key={provider} label={provider}>
            {list.map((card) => (
              <option key={catalogKey(card)} value={catalogKey(card)}>
                {card.model}
                {card.nsfw ? " · NSFW" : ""}
                {" · "}
                {card.cost}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
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
