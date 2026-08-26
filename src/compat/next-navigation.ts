import { useCallback, useEffect, useMemo, useState } from "react";

function notifyNavigation() {
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigate(href: string, replace = false) {
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    window.location.href = href;
    return;
  }
  if (replace) window.history.replaceState({}, "", href);
  else window.history.pushState({}, "", href);
  notifyNavigation();
}

export function useRouter() {
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, true),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => window.location.reload(),
      prefetch: async () => undefined,
    }),
    [],
  );
}

export function useSearchParams() {
  const [search, setSearch] = useState(() => (typeof window === "undefined" ? "" : window.location.search));
  useEffect(() => {
    const update = () => setSearch(window.location.search);
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return pathname;
}

export function useNavigateCallback() {
  return useCallback((href: string) => navigate(href), []);
}
