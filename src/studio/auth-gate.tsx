"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { canEnterOps, canGenerate, useAccountStore } from "@/studio/account";

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
  return (
    <div className="acct-page">
      <header className="acct-hero">
        <p className="studio-kicker">RESTRICTED</p>
        <h1>后台仅管理员可进</h1>
        <p className="studio-lead">
          {session
            ? `当前账号「${session.displayName || session.username}」是普通用户，不能改运营后台的接线、额度或上下架；仍可去设置页填写自己的 Key。`
            : "未登录不能进运营后台；设置页可以填写自己的 Key。访客可以去生图 / 生视频，但不能改运营后台。"}
        </p>
      </header>
      <section className="acct-banner">
        <div>
          <h2>{session ? "请用管理员账号" : "未登录如何使用"}</h2>
          <p className="studio-hint">设置页对所有人开放，可填写自己的 Key；只有管理员会话能修改运营后台的接线、额度和上下架。</p>
        </div>
        <div className="acct-alt">
          <Link className="studio-ghost" to="/settings">
            去设置接线
          </Link>
          {session ? null : (
            <Link className="studio-ghost" to="/image">
              去生图
            </Link>
          )}
          <Link className="studio-ghost" to="/login">
            登录
          </Link>
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
        <p className="studio-hint">未登录不能进运营后台，也不能扣额度生成。可先登录，或用访客继续本地试用。</p>
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
