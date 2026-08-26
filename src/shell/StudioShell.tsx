"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { STUDIO_NAV } from "./nav";
import { useOpsStore } from "@/studio/ops";
import { accountLabel, useAccountStore } from "@/studio/account";

export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const path = pathname.replace(/\/+$/, "") || "/";
  const isOps = path.startsWith("/admin");
  const isCanvas = path.startsWith("/canvas");
  const isWorkspace = path.startsWith("/canvas/workspace");
  const isAccount = path === "/account" || path === "/login" || path === "/register";
  const flush = isOps || isCanvas || isAccount || path === "/story";
  const imageCredits = useOpsStore((state) => state.credits.image);
  const session = useAccountStore((state) => state.session);
  const isGuest = useAccountStore((state) => state.isGuest);
  const chip = accountLabel({ session, isGuest });
  const chipHref = session || isGuest ? "/account" : "/login";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  return (
    <div className={isCanvas ? "studio-root min-h-screen is-canvas" : "studio-root min-h-screen"}>
      <header className="studio-topbar">
        <Link to="/" className="studio-brand" onClick={() => setMenuOpen(false)}>
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
          <Link to={chipHref} className={path === chipHref || path === "/account" ? "studio-userchip is-active" : "studio-userchip"}>
            {chip}
          </Link>
          <Link to="/account" className="studio-credits">
            {imageCredits} 积分
          </Link>
          <Link className={isOps ? "studio-ghost is-active" : "studio-ghost"} to="/admin">
            运营
          </Link>
          <button
            type="button"
            className="studio-menu-btn"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>
      {menuOpen ? (
        <nav className="studio-drawer" aria-label="移动端导航">
          {STUDIO_NAV.map((item) => {
            const active = path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} to={item.href} className={active ? "is-active" : undefined}>
                {item.label}
              </Link>
            );
          })}
          <Link to="/login">登录</Link>
          <Link to="/register">注册</Link>
          <Link to="/catalog">模型目录</Link>
          <Link to="/admin">运营后台</Link>
        </nav>
      ) : null}
      <div
        className={
          flush
            ? isWorkspace || isOps || path === "/story"
              ? "studio-page studio-flush"
              : "studio-page studio-flush studio-flush-scroll"
            : "studio-page"
        }
      >
        {children}
      </div>
    </div>
  );
}
