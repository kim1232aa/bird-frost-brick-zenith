/**
 * Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
 * (and later receive registered routes). Noops when the app is not embedded.
 */

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  collectRoutePathsFromTree,
  installPreviewHostBridge,
} from "@/lib/preview-host-bridge";

export function PreviewHostBridge() {
  const router = useRouter();

  useEffect(() => {
    window.__STUDIO_ROUTER__ = {
      push: (path: string) => {
        const url = new URL(path, window.location.origin);
        void router.navigate({
          to: url.pathname,
          search: Object.fromEntries(url.searchParams.entries()),
          replace: false,
        } as never);
      },
      replace: (path: string) => {
        const url = new URL(path, window.location.origin);
        void router.navigate({
          to: url.pathname,
          search: Object.fromEntries(url.searchParams.entries()),
          replace: true,
        } as never);
      },
    };
    const uninstall = installPreviewHostBridge({
      navigate: (path) => {
        router.history.push(path);
      },
      getRoutePaths: () => collectRoutePathsFromTree(router.routeTree),
    });
    return () => {
      delete window.__STUDIO_ROUTER__;
      uninstall();
    };
  }, [router]);

  return null;
}

declare global {
  interface Window {
    __STUDIO_ROUTER__?: {
      push: (href: string) => void;
      replace: (href: string) => void;
    };
  }
}
