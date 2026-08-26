"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useStudioSession } from "@/studio/session";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function StudioRuntime({ children }: { children: ReactNode }) {
  useEffect(() => {
    const applyTheme = () => {
      const theme = useThemeStore.getState().theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
    };
    applyTheme();
    return useThemeStore.subscribe(applyTheme);
  }, []);

  useEffect(() => {
    const syncRelays = () => {
      if (!useConfigStore.getState().hydrated) return;
      useConfigStore.getState().updateConfig("apiRelays", useStudioSession.getState().relays);
    };
    const unsubHydrate = useConfigStore.subscribe((state, prev) => {
      if (state.hydrated && !prev.hydrated) syncRelays();
    });
    const unsubSession = useStudioSession.subscribe(syncRelays);
    if (useConfigStore.getState().hydrated) syncRelays();
    return () => {
      unsubHydrate();
      unsubSession();
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
