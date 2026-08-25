"use client";

import { useState } from "react";
import { catalogKey, STUDIO_CATALOG } from "@/studio/catalog";
import { liveCard, useOpsStore } from "@/studio/ops";
import { SettingsPage } from "@/pages/settings-page";
import { useStudioSession } from "@/studio/session";

export function AdminPage() {
  const unlisted = useOpsStore((state) => state.unlisted);
  const setListed = useOpsStore((state) => state.setListed);
  const setPoints = useOpsStore((state) => state.setPoints);
  const points = useOpsStore((state) => state.points);
  const localCredits = useOpsStore((state) => state.credits);
  const grant = useOpsStore((state) => state.grant);
  const ledger = useOpsStore((state) => state.ledger);
  const audit = useOpsStore((state) => state.audit);
  const refund = useOpsStore((state) => state.refund);
  const relays = useStudioSession((state) => state.relays);
  const [tab, setTab] = useState<"wiring" | "models" | "credits" | "logs">("wiring");

  return (
    <div className="admin-desk">
      <header className="admin-head">
        <div>
          <p className="studio-kicker">管理员</p>
          <h1>运营后台</h1>
          <p className="studio-hint">你是管理员。这里改接线、上下架、扣点规则。前台创作页只消费这里放出来的模型。</p>
        </div>
        <dl className="admin-stats">
          <div>
            <dt>已启用接线</dt>
            <dd>{relays.filter((item) => item.enabled && item.apiKey).length}</dd>
          </div>
          <div>
            <dt>图额度</dt>
            <dd>{localCredits.image}</dd>
          </div>
          <div>
            <dt>视频额度</dt>
            <dd>{localCredits.video}</dd>
          </div>
        </dl>
      </header>
      <div className="studio-seg">
        {(["wiring", "models", "credits", "logs"] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? "is-active" : undefined} onClick={() => setTab(item)}>
            {item === "wiring" ? "接线" : item === "models" ? "模型上下架" : item === "credits" ? "额度" : "流水 / 审计"}
          </button>
        ))}
      </div>
      {tab === "wiring" ? <SettingsPage /> : null}
      {tab === "models" ? (
        <div className="admin-table">
          {STUDIO_CATALOG.map((item) => {
            const key = catalogKey(item);
            const card = liveCard(item);
            const listed = !unlisted[key];
            return (
              <div key={key} className="admin-row">
                <div>
                  <b>{item.model}</b>
                  <small>
                    {item.provider} · {item.kind}
                    {item.verified ? " · 已实测" : " · 未实测/套餐限制"}
                    {card.wired ? " · 已接线" : " · 未接线"}
                  </small>
                </div>
                <label>
                  扣点
                  <input type="number" min={0} value={points[key] ?? (item.kind === "video" ? 5 : 1)} onChange={(event) => setPoints(key, Number(event.target.value) || 0)} />
                </label>
                <button type="button" className={listed ? "studio-primary" : "studio-ghost"} onClick={() => setListed(key, !listed)}>
                  {listed ? "已上架" : "已下架"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {tab === "credits" ? (
        <section className="studio-tool-grid">
          <article className="studio-tool-card">
            <h2>发放额度</h2>
            <p>
              图 {localCredits.image} · 视频 {localCredits.video} · 文本 {localCredits.text}
            </p>
            <div className="result-actions">
              <button type="button" className="studio-ghost" onClick={() => grant("image", 50, "管理员发放")}>
                发放图 50
              </button>
              <button type="button" className="studio-ghost" onClick={() => grant("video", 10, "管理员发放")}>
                发放视频 10
              </button>
              <button type="button" className="studio-ghost" onClick={() => grant("text", 200, "管理员发放")}>
                发放文本 200
              </button>
            </div>
          </article>
          {ledger.slice(0, 20).map((row) => (
            <article key={row.id} className="studio-tool-card">
              <div className="studio-tool-meta">{new Date(row.at).toLocaleString()}</div>
              <h2>
                {row.kind} {row.delta > 0 ? "+" : ""}
                {row.delta}
              </h2>
              <p>
                {row.reason} {row.model}
              </p>
              {row.delta < 0 && row.ok ? (
                <button type="button" className="studio-ghost" onClick={() => refund(row.id)}>
                  退还
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {tab === "logs" ? (
        <div className="admin-table">
          {audit.length === 0 ? <p className="studio-hint">还没有审计记录。改 Key、上下架、发放额度会出现在这里。</p> : null}
          {audit.map((row) => (
            <div key={row.id} className="admin-row">
              <div>
                <b>{row.action}</b>
                <small>{new Date(row.at).toLocaleString()}</small>
              </div>
              <p>{row.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
