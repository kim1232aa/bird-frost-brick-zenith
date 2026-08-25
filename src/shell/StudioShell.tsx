"use client";

import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { STUDIO_NAV } from "./nav";
import { planLabel, useMembershipStore } from "@/studio/membership";
import { useOpsStore } from "@/studio/ops";

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const path = pathname.replace(/\/+$/, "") || "/";
  const { user, isPending } = useCurrentUserState();
  const plan = useMembershipStore((state) => state.plan);
  const imageCredits = useOpsStore((state) => state.credits.image);

  return (
    <div className="studio-root min-h-screen">
      <header className="studio-topbar">
        <Link to="/" className="studio-brand">
          <span className="studio-mark" aria-hidden />
          无界创作台
        </Link>
        <nav className="studio-nav" aria-label="主导航">
          {STUDIO_NAV.map((item) => {
            const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} to={item.href} className={active ? "is-active" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="studio-top-actions">
          <Link className="studio-ghost" to="/admin">
            {planLabel(plan)} · 图 {imageCredits}
          </Link>
          <Link className="studio-ghost" to="/admin">
            后台
          </Link>
          {isPending ? <span className="studio-hint">…</span> : user ? <UserButton /> : <Link className="studio-ghost" to="/login">登录</Link>}
        </div>
      </header>
      <div className={path.startsWith("/canvas") ? "studio-page studio-flush" : "studio-page"}>{children}</div>
    </div>
  );
}
