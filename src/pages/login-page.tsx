"use client";

import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { DEMO_ADMIN, useAccountStore } from "@/studio/account";

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const login = useAccountStore((state) => state.login);
  const register = useAccountStore((state) => state.register);
  const continueAsGuest = useAccountStore((state) => state.continueAsGuest);
  const loginDemoAdmin = useAccountStore((state) => state.loginDemoAdmin);
  const session = useAccountStore((state) => state.session);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  const goHome = () => {
    void navigate({ to: "/account" });
  };

  useEffect(() => {
    if (session) goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isRegister) {
        await register({ username, password, displayName, email });
      } else {
        await login({ username, password });
      }
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-page">
      <header className="acct-hero">
        <p className="studio-kicker">{isRegister ? "REGISTER" : "LOGIN"}</p>
        <h1>{isRegister ? "注册普通账号" : "登录创作台"}</h1>
        <p className="studio-lead">
          未登录不能进运营后台和接线。普通用户可以生图、生视频。预览已预置管理员，方便你测后台。
        </p>
      </header>
      <ol className="acct-steps">
        <li>
          <b>1</b>
          <span>管理员进后台改接线</span>
        </li>
        <li>
          <b>2</b>
          <span>普通用户 / 访客只创作</span>
        </li>
        <li>
          <b>3</b>
          <span>退出后不会自动再登管理员</span>
        </li>
      </ol>
      <div className="acct-grid">
        <form className="acct-card acct-form studio-form" onSubmit={(event) => void onSubmit(event)}>
          <div className="acct-card-head">
            <div>
              <p className="studio-kicker">{isRegister ? "新用户" : "已有账号"}</p>
              <h2>{isRegister ? "创建账号" : "登录"}</h2>
            </div>
          </div>
          <label className="model-picker">
            用户名
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder={isRegister ? "至少 3 个字符，不能用 admin" : "admin 或你的用户名"}
              required
            />
          </label>
          {isRegister ? (
            <label className="model-picker">
              显示名称（可选）
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="默认用用户名" />
            </label>
          ) : null}
          {isRegister ? (
            <label className="model-picker">
              邮箱（可选）
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="仅本机保存" />
            </label>
          ) : null}
          <label className="model-picker">
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder="至少 6 位"
              required
            />
          </label>
          {error ? <p className="studio-error">{error}</p> : null}
          <button type="submit" className="studio-primary" disabled={busy}>
            {busy ? "处理中…" : isRegister ? "注册并进入账户" : "登录"}
          </button>
          <div className="acct-alt">
            {isRegister ? (
              <Link to="/login" className="studio-ghost">
                已有账号，去登录
              </Link>
            ) : (
              <Link to="/register" className="studio-ghost">
                没有账号，去注册
              </Link>
            )}
            <button
              type="button"
              className="studio-ghost"
              onClick={() => {
                continueAsGuest();
                void navigate({ to: "/image" });
              }}
            >
              以访客继续（不能进后台）
            </button>
          </div>
          <p className="studio-footnote">密码经浏览器哈希后存在本机。换设备或清缓存需要重新登录。</p>
        </form>
        <aside className="acct-card">
          <p className="studio-kicker">DEMO ADMIN</p>
          <h2>测试管理员</h2>
          <p className="studio-hint">预览打开时会自动登录管理员，方便你测接线。自己退出后停留在未登录。</p>
          <dl className="acct-demo">
            <div>
              <dt>用户名</dt>
              <dd>{DEMO_ADMIN.username}</dd>
            </div>
            <div>
              <dt>密码</dt>
              <dd>{DEMO_ADMIN.password}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="studio-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void loginDemoAdmin()
                .then(() => void navigate({ to: "/admin" }))
                .catch((err) => setError(err instanceof Error ? err.message : "登录失败"))
                .finally(() => setBusy(false));
            }}
          >
            一键登录管理员并进后台
          </button>
          <ul className="acct-faq">
            <li>
              未登录
              <span>可以看生图 / 生视频页面，但不能生成，也不能进后台。</span>
            </li>
            <li>
              访客
              <span>能出图出片，用平台已接线的模型。不能改供应商、额度、上下架。</span>
            </li>
            <li>
              普通账号
              <span>记住显示名和方案。同样不能进运营后台。</span>
            </li>
            <li>
              管理员
              <span>
                才能打开 <Link to="/admin">运营后台</Link> 和接线。
              </span>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}
