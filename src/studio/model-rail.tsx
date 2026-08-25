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
  for (const card of liveCatalog(kind, true)) {
    const list = groups.get(card.provider) || [];
    list.push(card);
    groups.set(card.provider, list);
  }

  if (!groups.size) {
    return <p className="studio-hint">没有已上架且已接线的{kind}模型。到后台启用 Provider 或上架模型。</p>;
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
                    {card.nsfw ? <i className="tag tag-nsfw">NSFW</i> : <i className="tag">安全</i>}
                    <i className="tag">已接线</i>
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
