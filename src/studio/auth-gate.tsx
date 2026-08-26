"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { DEMO_ADMIN, canEnterOps, canGenerate, useAccountStore } from "@/studio/account";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const hydrated = useAccountStore((state) => state.hydrated);
  const session = useAccountStore((state) => state.session);
  if (!hydrated) {
    return (
      <div className="acct-page">
        <p className="studio-hint">正在确认登录态…</p>
      </div>
    );
  }
  if (canEnterOps({ session })) return children;
  return <OpsDenied />;
}

function OpsDenied() {
  const session = useAccountStore((state) => state.session);
  const loginDemoAdmin = useAccountStore((state) => state.loginDemoAdmin);
  return (
    <div className="acct-page">
      <header className="acct-hero">
        <p className="studio-kicker">RESTRICTED</p>
        <h1>后台仅管理员可进</h1>
        <p className="studio-lead">
          {session
            ? `当前账号「${session.displayName || session.username}」是普通用户，不能改接线、额度或上下架。`
            : "未登录不能进运营后台和接线。访客可以去生图 / 生视频，但不能改供应商。"}
        </p>
      </header>
      <section className="acct-banner">
        <div>
          <h2>{session ? "请用管理员账号" : "未登录如何使用"}</h2>
          <p className="studio-hint">预览管理员：{DEMO_ADMIN.username} / {DEMO_ADMIN.password}。退出后不会自动再登。普通用户注册后只能创作。</p>
        </div>
        <div className="acct-alt">
          {session ? null : (
            <Link className="studio-ghost" to="/image">
              去生图
            </Link>
          )}
          <Link className="studio-ghost" to="/login">
            登录
          </Link>
          <button type="button" className="studio-primary" onClick={() => void loginDemoAdmin()}>
            一键登录管理员
          </button>
        </div>
      </section>
    </div>
  );
}

export function GuestGenerateBanner({ kind }: { kind: "image" | "video" }) {
  const hydrated = useAccountStore((state) => state.hydrated);
  const session = useAccountStore((state) => state.session);
  const isGuest = useAccountStore((state) => state.isGuest);
  const continueAsGuest = useAccountStore((state) => state.continueAsGuest);
  if (!hydrated || canGenerate({ session, isGuest })) return null;
  return (
    <section className="acct-banner acct-banner-tight">
      <div>
        <h2>先登录再{kind === "video" ? "出片" : "出图"}</h2>
        <p className="studio-hint">未登录不能进后台，也不能扣额度生成。管理员已预置 {DEMO_ADMIN.username} / {DEMO_ADMIN.password}，也可以访客继续。</p>
      </div>
      <div className="acct-alt">
        <Link className="studio-primary" to="/login">
          登录
        </Link>
        <button type="button" className="studio-ghost" onClick={continueAsGuest}>
          访客继续
        </button>
      </div>
    </section>
  );
}

export function useGenerateAccess() {
  const session = useAccountStore((state) => state.session);
  const isGuest = useAccountStore((state) => state.isGuest);
  const hydrated = useAccountStore((state) => state.hydrated);
  return {
    hydrated,
    allowed: canGenerate({ session, isGuest }),
    blockedReason: hydrated && !canGenerate({ session, isGuest }) ? "请先登录或选择访客继续" : "",
  };
}
