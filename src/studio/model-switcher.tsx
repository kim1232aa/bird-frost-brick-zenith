"use client";

import { useState } from "react";
import { findCatalog, type ModelCard } from "./catalog";
import { ModelRail } from "./model-rail";

export function ModelSwitcher({
  kind,
  value,
  onChange,
}: {
  kind: ModelCard["kind"];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const card = findCatalog(value);
  return (
    <div className="switcher">
      <div className="switcher-head">
        <div>
          <p className="studio-kicker">{card?.provider || kind.toUpperCase()}</p>
          <h1>{card?.model || "选择模型"}</h1>
          <p className="studio-hint">{card?.blurb}</p>
          {card ? (
            <span className="model-card-tags">
              {card.nsfw ? <i className="tag tag-nsfw">成人向</i> : <i className="tag">安全</i>}
              {card.wired ? <i className="tag">能用</i> : <i className="tag">还没填密钥</i>}
              {card.tags.slice(0, 3).map((tag) => (
                <i key={tag} className="tag">
                  {tag}
                </i>
              ))}
            </span>
          ) : null}
        </div>
        <button type="button" className="studio-ghost" onClick={() => setOpen((current) => !current)}>
          {open ? "收起" : "更换模型"}
        </button>
      </div>
      {open ? (
        <ModelRail
          kind={kind}
          value={value}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
