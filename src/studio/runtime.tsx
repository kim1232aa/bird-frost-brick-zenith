"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bootstrapStudioAuth, useAccountStore } from "@/studio/account";

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}