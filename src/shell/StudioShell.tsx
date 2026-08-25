"use client";

import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { STUDIO_NAV } from "./nav";
import { useOpsStore } from "@/studio/ops";

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const path = pathname.replace(/\/+$/, "") || "/";
  const isOps = path.startsWith("/admin");
  const flush = isOps || ["/image", "/video", "/ecommerce", "/story", "/library", "/canvas"].includes(path) || path.startsWith("/canvas/");
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
            const active = path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} to={item.href} className={active ? "is-active" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="studio-top-actions">
          <span className="studio-credits">{imageCredits} 积分</span>
          <Link className={isOps ? "studio-ghost is-active" : "studio-ghost"} to="/admin">
            运营
          </Link>
        </div>
      </header>
      <div className={flush ? "studio-page studio-flush" : "studio-page"}>{children}</div>
    </div>
  );
}
