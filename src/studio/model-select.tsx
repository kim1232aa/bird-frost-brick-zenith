"use client";

import { useMemo } from "react";
import { catalogKey, type ModelCard } from "./catalog";
import { liveCatalog } from "./ops";
import { ModelMenu } from "./model-menu";
import { useOpsStore } from "./ops";
import { useStudioSession } from "./session";

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
  return <ModelMenu kind={kind} value={value} onChange={onChange} label={label} wiredOnly={false} />;
}

function prefer(kind: ModelCard["kind"], favorite?: (card: ModelCard) => boolean) {
  const wired = liveCatalog(kind, true);
  const listed = liveCatalog(kind, false);
  const pool = wired.length ? wired : listed;
  const hit = favorite ? pool.find(favorite) : undefined;
  return hit ? catalogKey(hit) : pool[0] ? catalogKey(pool[0]) : "";
}

export function preferredVideoKey() {
  return prefer("video", (item) => item.model === "grok-imagine-video");
}

export function preferredImageKey() {
  return prefer(
    "image",
    (item) =>
      item.model === "grok-imagine-image" ||
      item.model === "grok-imagine-image-quality" ||
      item.model === "gpt-image-2" ||
      item.model === "Qwen/Qwen-Image" ||
      item.model === "doubao-seedream-5.0-lite",
  );
}

export function preferredTextKey() {
  return prefer("text", (item) => item.model === "grok-4.6" || item.model === "gpt-5.6");
}

export function preferredAudioKey() {
  return prefer("audio");
}

const LABELS: Record<ModelCard["kind"], string> = {
  image: "生图模型",
  video: "视频模型",
  text: "文本模型",
  audio: "音频模型",
};

export function StudioModelField({
  kind,
  value,
  onChange,
  label,
  cards: incoming,
}: {
  kind: ModelCard["kind"];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  cards?: ModelCard[];
}) {
  useStudioSession((state) => state.relays);
  useOpsStore((state) => state.unlisted);
  const cards = incoming?.length ? incoming : liveCatalog(kind, false);
  const groups = useMemo(() => {
    const map = new Map<string, ModelCard[]>();
    for (const card of cards) {
      const list = map.get(card.provider) || [];
      list.push(card);
      map.set(card.provider, list);
    }
    return [...map.entries()];
  }, [cards]);
  const safe = cards.some((card) => catalogKey(card) === value) ? value : cards[0] ? catalogKey(cards[0]) : "";

  return (
    <label className="model-picker">
      {label || LABELS[kind]}
      <select
        value={safe}
        disabled={!cards.length}
        onChange={(event) => {
          const next = event.target.value;
          if (next) onChange(next);
        }}
      >
        {cards.length === 0 ? <option value="">暂无上架模型，去后台看看</option> : null}
        {groups.map(([provider, list]) => (
          <optgroup key={provider} label={provider}>
            {list.map((card) => {
              const key = catalogKey(card);
              const mark = card.wired ? "已接线" : "待接线";
              const extra = card.verified ? "" : " · 未实测";
              return (
                <option key={key} value={key}>
                  {card.model} · {mark}
                  {extra}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
