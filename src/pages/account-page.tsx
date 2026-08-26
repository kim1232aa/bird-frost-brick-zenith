"use client";

import { Link } from "@tanstack/react-router";
import { MEMBERSHIP_IS_LOCAL_MOCK, planLabel, useMembershipStore } from "@/studio/membership";
import { useOpsStore } from "@/studio/ops";
import { useStudioSession } from "@/studio/session";

function maskKey(value: string) {
  const key = value.trim();
  if (!key) return "未配置";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function AccountPage() {
  const plan = useMembershipStore((state) => state.plan);
  const upgrade = useMembershipStore((state) => state.upgrade);
  const credits = useOpsStore((state) => state.credits);
  const ledger = useOpsStore((state) => state.ledger);
  const grant = useOpsStore((state) => state.grant);
  const relays = useStudioSession((state) => state.relays);
  const webCredits = credits.image + credits.video;
  const apiCredits = credits.text;
  const wired = relays.filter((item) => item.enabled && item.apiKey).length;
  const payload = {
    success: true,
    request_id: "local-preview",
    data: { web_credits: webCredits, api_credits: apiCredits },
  };

  return (
    <div className="home-hero">
      <p className="studio-kicker">ACCOUNT</p>
      <h1>账户</h1>
      <p className="studio-lead">管理账户并查看积分余额。对齐 BananaPro GET /api/v1/account/balances 的双钱包字段。</p>
      {MEMBERSHIP_IS_LOCAL_MOCK ? (
        <p className="studio-hint">本地演示账本，不请求 BananaPro，也不向服务器扣费。Key 只写设置页或环境变量。</p>
      ) : null}
      <section className="home-tools">
        <article className="home-tool">
          <h2>工作室额度</h2>
          <p>web_credits · 生图 {credits.image} + 生视频 {credits.video}</p>
          <strong style={{ fontSize: 28 }}>{webCredits}</strong>
        </article>
        <article className="home-tool">
          <h2>API 额度</h2>
          <p>api_credits · 文本 / 润色 / 故事导演</p>
          <strong style={{ fontSize: 28 }}>{apiCredits}</strong>
        </article>
        <article className="home-tool">
          <h2>方案</h2>
          <p>{planLabel(plan)}</p>
          <p className="studio-hint">已接线 {wired} / {relays.length}</p>
          {plan === "studio" ? (
            <button type="button" className="studio-ghost" onClick={upgrade}>
              升级专业版（本地加额）
            </button>
          ) : null}
        </article>
      </section>
      <section className="home-tool" style={{ marginTop: 24, maxWidth: 720 }}>
        <h2>GET /api/v1/account/balances</h2>
        <pre style={{ overflow: "auto", fontSize: 13, background: "#f6f7f8", padding: 16, borderRadius: 12 }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
        <p className="studio-hint">Authorization: Bearer sk-…，密钥不要写进仓库。</p>
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>API 密钥</h2>
        <div className="home-tools">
          {relays.map((item) => (
            <article key={item.id} className="home-tool">
              <h2>{item.name}</h2>
              <p>{item.baseUrl}</p>
              <small>
                {item.enabled ? "启用" : "关闭"} · {maskKey(item.apiKey || "")}
              </small>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 12 }}>
          <Link to="/settings" className="studio-primary">
            打开接线
          </Link>
        </p>
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>使用明细</h2>
        {ledger.length === 0 ? (
          <p className="studio-hint">还没有本地扣减记录。</p>
        ) : (
          <ul className="studio-hint">
            {ledger.slice(0, 12).map((row) => (
              <li key={row.id}>
                {new Date(row.at).toLocaleString()} · {row.kind} · {row.delta > 0 ? "+" : ""}
                {row.delta} · {row.reason}
                {row.model ? ` · ${row.model}` : ""}
              </li>
            ))}
          </ul>
        )}
        <div className="result-actions" style={{ marginTop: 12 }}>
          <button type="button" className="studio-ghost" onClick={() => grant("image", 50, "账户页补发")}>
            补发 50 生图点
          </button>
          <Link className="studio-ghost" to="/admin">
            运营后台
          </Link>
        </div>
      </section>
      <section style={{ marginTop: 28 }}>
        <h2>安全实践</h2>
        <ul className="studio-hint">
          <li>不要把 API 密钥写进客户端或公共仓库。</li>
          <li>用环境变量或设置页保存密钥。</li>
          <li>开发 / 测试 / 生产分开，定期轮换。</li>
          <li>监控用量，异常立刻停用对应中转。</li>
        </ul>
      </section>
    </div>
  );
}
