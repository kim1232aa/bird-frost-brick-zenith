"use client";

import { catalogKey, type ModelCard } from "./catalog";
import { liveCatalog, useOpsStore } from "./ops";
import { useStudioSession } from "./session";

export function ModelRail({
  kind,
  value,
  onChange,
}: {
  kind: ModelCard["kind"];
  value: string;
  onChange: (value: string) => void;
}) {
  useOpsStore((state) => state.unlisted);
  useStudioSession((state) => state.relays);
  const groups = new Map<string, ModelCard[]>();
  for (const card of liveCatalog(kind, false)) {
    const list = groups.get(card.provider) || [];
    list.push(card);
    groups.set(card.provider, list);
  }

  if (!groups.size) {
    return <p className="studio-hint">后台还没有上架{kind === "image" ? "生图" : kind === "video" ? "视频" : kind === "text" ? "文本" : "音频"}模型。</p>;
  }

  return (
    <div className="model-rail">
      {[...groups.entries()].map(([provider, cards]) => (
        <section key={provider}>
          <p className="studio-kicker">{provider}</p>
          <div className="model-rail-grid">
            {cards.map((card) => {
              const key = catalogKey(card);
              return (
                <button
                  key={key}
                  type="button"
                  className={value === key ? "model-card is-on" : "model-card"}
                  onClick={() => onChange(key)}
                >
                  <b>{card.model}</b>
                  <span className="model-card-tags">
                    {card.nsfw ? <i className="tag tag-nsfw">成人向</i> : <i className="tag">安全</i>}
                    <i className="tag">{card.wired ? "能用" : "还没填密钥"}</i>
                    {card.tags.slice(0, 2).map((tag) => (
                      <i key={tag} className="tag">
                        {tag}
                      </i>
                    ))}
                  </span>
                  <small>
                    {card.cost} · {card.size}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
