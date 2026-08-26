"use client";

import { FormEvent, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAccountStore } from "@/studio/account";

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const login = useAccountStore((state) => state.login);
  const register = useAccountStore((state) => state.register);
  const continueAsGuest = useAccountStore((state) => state.continueAsGuest);
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
        <h1>{isRegister ? "注册本地账号" : "登录创作台"}</h1>
        <p className="studio-lead">
          账号只保存在这台浏览器，方便记住方案和接线偏好。积分是本地演示账本，不会向服务器扣费。
        </p>
      </header>
      <ol className="acct-steps">
        <li>
          <b>1</b>
          <span>{isRegister ? "设用户名和密码" : "输入已注册的用户名"}</span>
        </li>
        <li>
          <b>2</b>
          <span>进入账户看积分和方案</span>
        </li>
        <li>
          <b>3</b>
          <span>去设置页新增或删除供应商</span>
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
              placeholder="至少 3 个字符"
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
                goHome();
              }}
            >
              以访客继续
            </button>
          </div>
          <p className="studio-footnote">密码经浏览器哈希后存在本机。换设备或清缓存需要重新注册。</p>
        </form>
        <aside className="acct-card">
          <p className="studio-kicker">怎么用</p>
          <h2>不必先登录也能创作</h2>
          <ul className="acct-faq">
            <li>
              注册
              <span>用来记住显示名和方案。同一浏览器可反复登录。</span>
            </li>
            <li>
              访客
              <span>跳过账号，直接去接线、生图、画布。</span>
            </li>
            <li>
              接线
              <span>
                登录后去 <Link to="/settings">设置</Link>，点「新增供应商」或「删除」。
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
