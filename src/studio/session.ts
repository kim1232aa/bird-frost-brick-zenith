import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createApiRelayProvider, type ApiRelayProvider } from "@/stores/api-relay-config";
import { mergePersistedRelays } from "@/studio/relay-merge";
import { studioRelays } from "@/studio/wiring";

type StudioSession = {
  relays: ApiRelayProvider[];
  setRelayKey: (id: string, apiKey: string) => void;
  setRelayEnabled: (id: string, enabled: boolean) => void;
  setRelayFields: (id: string, patch: Partial<Pick<ApiRelayProvider, "name" | "baseUrl" | "apiKey" | "enabled" | "remark" | "adapterType" | "endpoints" | "authScheme" | "protocol" | "imageModels" | "videoModels" | "textModels" | "audioModels">>) => void;
  addRelay: (input: Partial<ApiRelayProvider>) => void;
  removeRelay: (id: string) => void;
  resetRelays: () => void;
};

export const useStudioSession = create<StudioSession>()(
  persist(
    (set, get) => ({
      relays: studioRelays(),
      setRelayKey: (id, apiKey) =>
        set({
          relays: get().relays.map((item) =>
            item.id === id ? { ...item, apiKey, enabled: Boolean(apiKey) || item.enabled } : item,
          ),
        }),
      setRelayEnabled: (id, enabled) =>
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, enabled } : item)),
        }),
      setRelayFields: (id, patch) =>
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }),
      addRelay: (input) =>
        set({
          relays: get().relays.concat(
            createApiRelayProvider({
              ...input,
              enabled: Boolean(input.apiKey),
              adapterType: input.adapterType || "openai-compat",
            }),
          ),
        }),
      removeRelay: (id) => set({ relays: get().relays.filter((item) => item.id !== id) }),
      resetRelays: () => set({ relays: studioRelays() }),
    }),
    {
      name: "boundless-studio:session",
      version: 4,
      migrate: (persisted) => {
        const saved = (persisted as { relays?: ApiRelayProvider[] } | undefined)?.relays;
        return { relays: mergePersistedRelays(saved) };
      },
      merge: (persisted, current) => {
        const saved = (persisted as { relays?: ApiRelayProvider[] } | undefined)?.relays;
        return {
          ...current,
          relays: mergePersistedRelays(saved),
        };
      },
    },
  ),
);
