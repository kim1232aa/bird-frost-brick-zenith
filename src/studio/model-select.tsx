"use client";

import { useMemo } from "react";
import { catalogKey, type ModelCard } from "./catalog";
import { liveCatalog } from "./ops";
import { ModelMenu } from "./model-menu";
import { useOpsStore } from "./ops";
import { useStudioSession } from "./session";
import { useCurrentModels } from "./current-models-store";

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
  return (
    <ModelMenu
      kind={kind}
      value={value}
      onChange={(next) => {
        useCurrentModels.getState().setKind(kind, next);
        onChange(next);
      }}
      label={label}
      wiredOnly={false}
    />
  );
}

function prefer(kind: ModelCard["kind"], favorite?: (card: ModelCard) => boolean) {
  const listed = liveCatalog(kind, false);
  const wired = liveCatalog(kind, true);
  const saved = kind === "audio" ? useCurrentModels.getState().audio : useCurrentModels.getState()[kind];
  if (saved && listed.some((card) => catalogKey(card) === saved)) return saved;
  const pool = wired.length ? wired : listed;
  const hit = favorite ? pool.find(favorite) : undefined;
  return hit ? catalogKey(hit) : pool[0] ? catalogKey(pool[0]) : "";
}

export function preferredVideoKey() {
  return prefer("video");
}

export function preferredImageKey() {
  return prefer("image");
}

export function preferredTextKey() {
  return prefer("text");
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
        title={cards.find((card) => catalogKey(card) === safe) ? `${cards.find((card) => catalogKey(card) === safe)?.provider} · ${cards.find((card) => catalogKey(card) === safe)?.model}` : "选择模型"}
        onChange={(event) => {
          const next = event.target.value;
          if (next) {
            useCurrentModels.getState().setKind(kind, next);
            onChange(next);
          }
        }}
      >
        {cards.length === 0 ? <option value="">还没有可选手模型。去设置启用供应商，或确认目录没有被下架。</option> : null}
        {groups.map(([provider, list]) => (
          <optgroup key={provider} label={provider}>
            {list.map((card) => {
              const key = catalogKey(card);
              const mark = card.wired ? "已接线" : "待接线";
              const extra = card.verified ? "" : " · 未实测";
              return (
                <option key={key} value={key} title={`${card.provider} · ${card.model}`}>
                  {card.provider} · {card.model} · {mark}
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