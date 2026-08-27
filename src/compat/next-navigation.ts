import { useCallback, useMemo } from "react";
import { useRouter as useTanstackRouter, useRouterState } from "@tanstack/react-router";

function notifyNavigation() {
  window.dispatchEvent(new Event("tanstack-router-sync"));
}

function toAppPath(href: string) {
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function commitHref(
  router: { navigate: (opts: Record<string, unknown>) => unknown; history: { push: (h: string) => void; replace: (h: string) => void } },
  href: string,
  replace: boolean,
) {
  const next = toAppPath(href);
  try {
    const url = new URL(next, window.location.origin);
    const search: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      search[key] = value;
    });
    void router.navigate({
      to: url.pathname,
      search,
      hash: url.hash.replace(/^#/, "") || undefined,
      replace,
    });
  } catch {
    if (replace) router.history.replace(next);
    else router.history.push(next);
  }
  notifyNavigation();
}

export function navigate(href: string, replace = false) {
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    window.location.href = href;
    return;
  }
  const studio = window.__STUDIO_ROUTER__;
  if (studio) {
    if (replace) studio.replace(toAppPath(href));
    else studio.push(toAppPath(href));
    notifyNavigation();
    return;
  }
  const next = toAppPath(href);
  if (replace) window.history.replaceState(window.history.state ?? {}, "", next);
  else window.history.pushState(window.history.state ?? {}, "", next);
  notifyNavigation();
}

export function useRouter() {
  const router = useTanstackRouter();
  return useMemo(
    () => ({
      push: (href: string) => commitHref(router, href, false),
      replace: (href: string) => commitHref(router, href, true),
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      refresh: () => window.location.reload(),
      prefetch: async () => undefined,
    }),
    [router],
  );
}

export function useSearchParams() {
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr || (typeof window === "undefined" ? "" : window.location.search),
  });
  return useMemo(() => {
    const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr.replace(/^\?/, "");
    return new URLSearchParams(raw);
  }, [searchStr]);
}

export function usePathname() {
  return useRouterState({
    select: (state) => state.location.pathname || (typeof window === "undefined" ? "/" : window.location.pathname),
  });
}

export function useNavigateCallback() {
  const router = useRouter();
  return useCallback((href: string) => router.push(href), [router]);
}

declare global {
  interface Window {
    __STUDIO_ROUTER__?: {
      push: (href: string) => void;
      replace: (href: string) => void;
    };
  }
}
