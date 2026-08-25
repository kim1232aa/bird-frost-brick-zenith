"use client";

import { useEffect, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { catalogKey, STUDIO_CATALOG } from "@/studio/catalog";
import { liveCard, useOpsStore } from "@/studio/ops";
import { grantCredits, loadAccount } from "@/studio/server/ops";
import { useStudioSession } from "@/studio/session";

export function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const unlisted = useOpsStore((state) => state.unlisted);
  const setListed = useOpsStore((state) => state.setListed);
  const setPoints = useOpsStore((state) => state.setPoints);
  const points = useOpsStore((state) => state.points);
  const localCredits = useOpsStore((state) => state.credits);
  const [tab, setTab] = useState<"models" | "credits" | "account">("account");
  const [account, setAccount] = useState<Awaited<ReturnType<typeof loadAccount>> | null>(null);
  const [error, setError] = useState("");
  const relays = useStudioSession((state) => state.relays);

  useEffect(() => {
    if (!user) return;
    void loadAccount()
      .then(setAccount)
      .catch((err) => setError(err instanceof Error ? err.message : "加载账号失败"));
  }, [user]);

  if (isPending) return <p className="studio-hint">读取登录状态…</p>;
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="studio-library">
      <header className="studio-library-head">
        <div>
          <p className="studio-kicker">ADMIN</p>
          <h1>运营后台</h1>
          <p className="studio-hint">
            需要登录。额度写入数据库（预览用嵌入库，部署后进 Neon）。模型上下架目前仍同步到本机列表，刷新前台即可。
          </p>
        </div>
        <UserButton />
      </header>
      <div className="studio-seg">
        {(["account", "models", "credits"] as const).map((item) => (
          <button key={item} type="button" className={tab === item ? "is-active" : undefined} onClick={() => setTab(item)}>
            {item === "account" ? "账号" : item === "models" ? "模型上下架" : "额度"}
          </button>
        ))}
      </div>
      {error ? <p className="studio-error">{error}</p> : null}
      {tab === "account" ? (
        <section className="studio-tool-grid">
          <article className="studio-tool-card">
            <h2>{account?.profile?.role === "admin" ? "管理员" : "用户"}</h2>
            <p>套餐 {account?.profile?.plan || "studio"}</p>
            <p>已接线 {relays.filter((item) => item.enabled && item.apiKey).length} 条</p>
          </article>
          {(account?.credits || []).map((row) => (
            <article key={row.kind} className="studio-tool-card">
              <h2>{row.kind}</h2>
              <p>数据库余额 {row.balance}</p>
            </article>
          ))}
        </section>
      ) : null}
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
                  点数
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
            <h2>发放到当前账号（数据库）</h2>
            <p>本机缓存图 {localCredits.image}，以数据库为准。</p>
            <div className="result-actions">
              <button
                type="button"
                className="studio-ghost"
                onClick={() =>
                  void grantCredits({ data: { kind: "image", amount: 50, reason: "积分包" } })
                    .then(() => loadAccount().then(setAccount))
                    .catch((err) => setError(err instanceof Error ? err.message : "发放失败"))
                }
              >
                发放图 50
              </button>
              <button
                type="button"
                className="studio-ghost"
                onClick={() =>
                  void grantCredits({ data: { kind: "video", amount: 10, reason: "积分包" } })
                    .then(() => loadAccount().then(setAccount))
                    .catch((err) => setError(err instanceof Error ? err.message : "发放失败"))
                }
              >
                发放视频 10
              </button>
            </div>
          </article>
          {(account?.ledger || []).map((row) => (
            <article key={row.id} className="studio-tool-card">
              <div className="studio-tool-meta">{row.created_at}</div>
              <h2>
                {row.kind} {row.delta}
              </h2>
              <p>{row.reason}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
