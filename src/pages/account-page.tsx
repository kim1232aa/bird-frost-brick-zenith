"use client";

import { FormEvent, useState } from "react";
import { Link } from "@tanstack/react-router";
import { providerHasUsableCredential } from "@/stores/api-relay-config";
import { accountLabel, canEnterOps, useAccountStore } from "@/studio/account";
import { MEMBERSHIP_IS_LOCAL_MOCK, STUDIO_CREDIT_PACKS, STUDIO_PLANS, planById, planLabel, useMembershipStore, type StudioPlanId } from "@/studio/membership";
import { useStudioJobs } from "@/studio/generate/jobs";
import { useOpsStore } from "@/studio/ops";
import { useStudioSession } from "@/studio/session";

function maskKey(value: string, hasApiKey = false) {
  const key = value.trim();
  if (!key) return hasApiKey ? "已配置（已脱敏）" : "未配置";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function AccountPage() {
  const session = useAccountStore((state) => state.session);
  const isGuest = useAccountStore((state) => state.isGuest);
  const hydrated = useAccountStore((state) => state.hydrated);
  const logout = useAccountStore((state) => state.logout);
  const updateProfile = useAccountStore((state) => state.updateProfile);
  const continueAsGuest = useAccountStore((state) => state.continueAsGuest);
  const plan = useMembershipStore((state) => state.plan);
  const upgrade = useMembershipStore((state) => state.upgrade);
  const buyPack = useMembershipStore((state) => state.buyPack);
  const jobs = useStudioJobs((state) => state.jobs);
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
  const wired = relays.filter((item) => item.enabled && providerHasUsableCredential(item)).length;
  const enabled = relays.filter((item) => item.enabled).length;
  const admin = canEnterOps({ session });
  const label = accountLabel({ session, isGuest, hydrated });
  const payload = {
    success: true,
    request_id: session?.id || (isGuest ? "guest" : "anonymous"),
    data: {
      web_credits: webCredits,
      api_credits: apiCredits,
      plan,
      jobs: {
        running: jobs.filter((item) => item.status === "running").length,
        today: jobs.filter((item) => item.createdAt > Date.now() - 86_400_000).length,
        total: jobs.length,
      },
    },
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    updateProfile({ displayName, email });
    setSaved("资料已保存在本机。");
  };

  const pickPlan = (id: StudioPlanId) => {
    upgrade(id);
    setSaved(`已切换到${planById(id).name}。额度差额已记入本账号账本。`);
  };

  return (
    <div className="acct-page">
      <header className="acct-hero">
        <p className="studio-kicker">ACCOUNT</p>
        <h1>{session ? `你好，${session.displayName || session.username}` : isGuest ? "访客模式" : "还没登录"}</h1>
        <p className="studio-lead">
          当前身份：{label}
          {session?.role === "admin" ? " · 可以进运营后台。" : " · 运营后台仅管理员。可去设置填自己的 Key。"}
          {MEMBERSHIP_IS_LOCAL_MOCK ? " 会员和额度还没接到远端结算。" : " 生成成功会从本账号额度账本扣点，失败不扣。"}
        </p>
      </header>

      {!session && !isGuest ? (
        <section className="acct-banner">
          <div>
            <h2>未登录不能进运营后台</h2>
            <p className="studio-hint">可以先看生图页，或去设置填自己的 Key。要出图：登录、注册，或访客继续。运营后台仍需管理员。</p>
          </div>
          <div className="acct-alt">
            <Link to="/login" className="studio-primary">
              登录
            </Link>
            <Link to="/register" className="studio-ghost">
              注册
            </Link>
            <Link to="/settings" className="studio-ghost">
              去设置
            </Link>
            <button type="button" className="studio-ghost" onClick={continueAsGuest}>
              访客继续
            </button>
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
          <p className="studio-hint">点升级会把差额补进本账号额度。不会发起第三方支付。</p>
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
        <div className="acct-plans" style={{ marginTop: 16 }}>
          {STUDIO_CREDIT_PACKS.map((pack) => (
            <button key={pack.id} type="button" className="studio-ghost" onClick={() => { buyPack(pack.id); setSaved(`已加 ${pack.label}。`); }}>
              {pack.label}
            </button>
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
          <p className="studio-hint">
            在设置页可以新增、删除、全部启用，也可填自己的 Key。这里只做总览。运营后台仍需管理员。
          </p>
          <ul className="acct-relay-list">
            {relays.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.name}
                <span>
                  {item.enabled ? "启用" : "关闭"} · {maskKey(item.apiKey || "", item.hasApiKey)} · {item.baseUrl}
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
              <p className="studio-hint">
                用户名 {session.username} · {session.role === "admin" ? "管理员" : "普通用户"} · 注册于 {new Date(session.createdAt).toLocaleDateString()}
              </p>
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
              <p className="studio-hint">访客能出图，也可去设置填自己的 Key。不能进运营后台。注册普通账号只记住显示名和方案。</p>
              <div className="acct-alt">
                <Link to="/login" className="studio-primary">
                  登录
                </Link>
                <Link to="/register" className="studio-ghost">
                  注册
                </Link>
                <Link to="/settings" className="studio-ghost">
                  去设置
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
            <p className="studio-hint">最近 12 条本账号扣减 / 补发。</p>
          </div>
          <div className="acct-alt">
            {admin ? (
              <>
                <button type="button" className="studio-ghost" onClick={() => grant("image", 50, "账户页补发")}>
                  补发 50 生图点
                </button>
                <Link className="studio-ghost" to="/admin">
                  运营后台
                </Link>
              </>
            ) : (
              <>
                <Link className="studio-ghost" to="/settings">
                  去设置
                </Link>
                <Link className="studio-ghost" to="/image">
                  去生图
                </Link>
              </>
            )}
          </div>
        </div>
        {ledger.length === 0 ? (
          <p className="studio-hint">还没有扣减记录。去生图或生视频成功后会出现在这里。</p>
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
        <div className="acct-card-head">
          <div>
            <h2>生成任务</h2>
            <p className="studio-hint">出图 / 出片会记在这里。失败不扣点。</p>
          </div>
        </div>
        {jobs.length === 0 ? (
          <p className="studio-hint">还没有任务。去生图、编辑或图生视频后会出现。</p>
        ) : (
          <ul className="acct-ledger">
            {jobs.slice(0, 12).map((job) => (
              <li key={job.id}>
                <em>{new Date(job.createdAt).toLocaleString()}</em>
                <strong>
                  {job.kind} · {job.status}
                </strong>
                <span>
                  {job.model}
                  {job.error ? ` · ${job.error.slice(0, 80)}` : job.urls.length ? ` · ${job.urls.length} 个结果` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="acct-card">
        <h2>GET /api/v1/account/balances</h2>
        <pre className="acct-json">{JSON.stringify(payload, null, 2)}</pre>
        <p className="studio-hint">本账号额度接口。数字跟账本走，生成成功会变。密钥只写在设置页，不要写进仓库。</p>
      </section>
    </div>
  );
}
