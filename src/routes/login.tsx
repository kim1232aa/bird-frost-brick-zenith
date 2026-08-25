import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const emailAuth = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "up") {
        const result = await authClient.signUp.email({ email, password, name: email.split("@")[0] || "studio" });
        if (result.error) throw new Error(result.error.message || "注册失败");
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message || "登录失败");
      }
      window.location.href = "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <p className="studio-kicker">ACCOUNT</p>
        <h1>登录后台</h1>
        <p>接线、上下架、发放额度需要账号。创作页仍可直接用已接线模型。</p>
        {authEnabled ? (
          <>
            {GROK_PROVIDERS.map((item) => (
              <button key={item.providerId} type="button" className="studio-primary" onClick={() => void signIn(item.providerId, { callbackURL: "/admin" })}>
                使用 {item.label} 继续
              </button>
            ))}
            <hr />
            <label>
              邮箱
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              密码
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="button" className="studio-primary" disabled={busy || !email || password.length < 8} onClick={() => void emailAuth()}>
              {busy ? "…" : mode === "up" ? "注册并进入后台" : "邮箱登录"}
            </button>
            <button type="button" className="studio-ghost" onClick={() => setMode(mode === "up" ? "in" : "up")}>
              {mode === "up" ? "已有账号？去登录" : "没有账号？注册"}
            </button>
            {error ? <p className="studio-error">{error}</p> : null}
          </>
        ) : (
          <p>登录未开启。</p>
        )}
      </div>
    </main>
  );
}
