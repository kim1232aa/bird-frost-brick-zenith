"use client";

import { FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { accountLabel, useAccountStore } from "@/studio/account";
import { MEMBERSHIP_IS_LOCAL_MOCK, STUDIO_PLANS, planById, planLabel, useMembershipStore, type StudioPlanId } from "@/studio/membership";
import { useOpsStore } from "@/studio/ops";
import { useStudioSession } from "@/studio/session";

function maskKey(value: string) {
  const key = value.trim();
  if (!key) return "未配置";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function AccountPage() {
  const session = useAccountStore((state) => state.session);
  const isGuest = useAccountStore((state) => state.isGuest);
  const logout = useAccountStore((state) => state.logout);
  const updateProfile = useAccountStore((state) => state.updateProfile);
  const plan = useMembershipStore((state) => state.plan);
  const upgrade = useMembershipStore((state) => state.upgrade);
  const credits = useOpsStore((state) => state.credits);
  const ledger = useOpsStore((state) => state.ledger);
  const grant = useOpsStore((state) => state.grant);
  const relays = useStudioSession((state) => state.relays);
  const [displayName, setDisplayName] = useState(session?.displayName || "");
  const [email, setEmail] = useState(session?.email || "");
  const [saved, setSaved] = useState("");
  const currentPlan = planById(plan);
  const webCredits = credits.image + credits.video;
  const apiCredits = credits.text;
  const wired = relays.filter((item) => item.enabled && item.apiKey).length;
  const enabled = relays.filter((item) => item.enabled).length;
  const label = accountLabel({ session, isGuest });
  const payload = {
    success: true,
    request_id: "local-preview",
    data: { web_credits: webCredits, api_credits: apiCredits },
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    updateProfile({ displayName, email });
    setSaved("资料已保存在本机。");
  };

  const pickPlan = (id: StudioPlanId) => {
    upgrade(id);
    setSaved(`已切换到${planById(id).name}。额度按本地演示账本加减。`);
  };

  return (
    <div className="acct-page">
      <header className="acct-hero">
        <p className="studio-kicker">ACCOUNT</p>
        <h1>{session ? `你好，${session.displayName || session.username}` : isGuest ? "访客模式" : "账户"}</h1>
        <p className="studio-lead">
          看积分、换方案、管理接线。当前身份：{label}。
          {MEMBERSHIP_IS_LOCAL_MOCK ? " 会员和额度是本地演示，不请求服务器、也不真实扣费。" : ""}
        </p>
      </header>

      {!session && !isGuest ? (
        <section className="acct-banner">
          <div>
            <h2>还没登录</h2>
            <p className="studio-hint">注册后能记住显示名和方案。也可以访客先去接线。</p>
          </div>
          <div className="acct-alt">
            <Link to="/login" className="studio-primary">
              登录
            </Link>
            <Link to="/register" className="studio-ghost">
              注册
            </Link>
          </div>
        </section>
      ) : null}

      <ol className="acct-steps">
        <li>
          <b>1</b>
          <span>登录或访客进入</span>
        </li>
        <li>
          <b>2</b>
          <span>选方案，看图 / 视频额度</span>
        </li>
        <li>
          <b>3</b>
          <span>去设置新增、启用或删除供应商</span>
        </li>
      </ol>

      <section className="acct-stats">
        <article className="acct-stat">
          <span>工作室额度 · 图+视频</span>
          <strong>{webCredits}</strong>
          <span>生图 {credits.image} · 生视频 {credits.video}</span>
        </article>
        <article className="acct-stat">
          <span>API 额度 · 文本</span>
          <strong>{apiCredits}</strong>
          <span>润色 / 故事导演</span>
        </article>
        <article className="acct-stat">
          <span>接线</span>
          <strong>
            {wired}/{relays.length}
          </strong>
          <span>已启用 {enabled} · {planLabel(plan)}</span>
        </article>
      </section>

      <section className="acct-bars acct-card">
        <h2>额度进度（相对当前方案上限）</h2>
        {(
          [
            ["image", "生图", credits.image],
            ["video", "生视频", credits.video],
            ["text", "文本", credits.text],
          ] as const
        ).map(([kind, name, value]) => {
          const cap = currentPlan.limits[kind];
          const pct = Math.min(100, Math.round((value / Math.max(cap, 1)) * 100));
          return (
            <div key={kind}>
              <div className="acct-bar-meta">
                <span>{name}</span>
                <span>
                  {value} / {cap}
                </span>
              </div>
              <div className="acct-bar" aria-label={`${name} ${pct}%`}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <div className="acct-card-head">
          <div>
            <p className="studio-kicker">MEMBERSHIP</p>
            <h2>方案</h2>
          </div>
          <p className="studio-hint">本地加额演示，点一下立刻到账。</p>
        </div>
        <div className="acct-plans">
          {STUDIO_PLANS.map((item) => (
            <article key={item.id} className={item.id === plan ? "acct-plan is-on" : "acct-plan"}>
              <p className="studio-kicker">{item.price}</p>
              <h3>{item.name}</h3>
              <p>{item.tagline}</p>
              <ul>
                {item.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              {item.id === plan ? (
                <button type="button" className="studio-ghost" disabled>
                  当前方案
                </button>
              ) : (
                <button type="button" className="studio-primary" onClick={() => pickPlan(item.id)}>
                  切换到{item.name}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="acct-grid">
        <section className="acct-card">
          <div className="acct-card-head">
            <div>
              <p className="studio-kicker">PROVIDERS</p>
              <h2>供应商</h2>
            </div>
            <Link to="/settings" className="studio-primary">
              打开接线
            </Link>
          </div>
          <p className="studio-hint">在设置页可以新增、删除、全部启用。这里只做总览。</p>
          <ul className="acct-relay-list">
            {relays.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.name}
                <span>
                  {item.enabled ? "启用" : "关闭"} · {maskKey(item.apiKey || "")} · {item.baseUrl}
                </span>
              </li>
            ))}
          </ul>
          {relays.length > 8 ? <p className="studio-hint">还有 {relays.length - 8} 个，去设置页管理。</p> : null}
        </section>

        <section className="acct-card">
          {session ? (
            <form className="acct-form studio-form" onSubmit={saveProfile}>
              <p className="studio-kicker">PROFILE</p>
              <h2>资料</h2>
              <p className="studio-hint">用户名 {session.username}，注册于 {new Date(session.createdAt).toLocaleDateString()}</p>
              <label className="model-picker">
                显示名称
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <label className="model-picker">
                邮箱
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <div className="acct-alt">
                <button type="submit" className="studio-primary">
                  保存资料
                </button>
                <button type="button" className="studio-ghost" onClick={logout}>
                  退出登录
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="studio-kicker">SESSION</p>
              <h2>{isGuest ? "访客" : "未登录"}</h2>
              <p className="studio-hint">访客也能接线生图。注册只是方便下次回来认领同一套偏好。</p>
              <div className="acct-alt">
                <Link to="/login" className="studio-primary">
                  登录
                </Link>
                <Link to="/register" className="studio-ghost">
                  注册
                </Link>
              </div>
            </div>
          )}
          {saved ? <p className="studio-ok">{saved}</p> : null}
        </section>
      </div>

      <section className="acct-card">
        <div className="acct-card-head">
          <div>
            <h2>使用明细</h2>
            <p className="studio-hint">最近 12 条本地扣减 / 补发。</p>
          </div>
          <div className="acct-alt">
            <button type="button" className="studio-ghost" onClick={() => grant("image", 50, "账户页补发")}>
              补发 50 生图点
            </button>
            <Link className="studio-ghost" to="/admin">
              运营后台
            </Link>
          </div>
        </div>
        {ledger.length === 0 ? (
          <p className="studio-hint">还没有本地扣减记录。去生图或生视频后会出现在这里。</p>
        ) : (
          <ul className="acct-ledger">
            {ledger.slice(0, 12).map((row) => (
              <li key={row.id}>
                <em>{new Date(row.at).toLocaleString()}</em>
                <strong>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta} {row.kind}
                </strong>
                <span>
                  {row.reason}
                  {row.model ? ` · ${row.model}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="acct-card">
        <h2>GET /api/v1/account/balances</h2>
        <pre className="acct-json">{JSON.stringify(payload, null, 2)}</pre>
        <p className="studio-hint">这是演示字段对齐，不是真实 BananaPro 账单。密钥不要写进仓库。</p>
      </section>
    </div>
  );
}
