"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bootstrapStudioAuth, useAccountStore } from "@/studio/account";
import { useStudioSession } from "@/studio/session";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function StudioRuntime({ children }: { children: ReactNode }) {
  useEffect(() => {
    const persist = useAccountStore.persist;
    const run = () => {
      void bootstrapStudioAuth();
    };
    if (persist.hasHydrated()) run();
    return persist.onFinishHydration(run);
  }, []);

  useEffect(() => {
    const persist = useStudioSession.persist;
    const run = () => {
      void useStudioSession.getState().hydrateVault();
    };
    if (persist.hasHydrated()) run();
    const unsub = persist.onFinishHydration(run);
    const flush = () => {
      void useStudioSession.getState().flushVault();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      unsub();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
