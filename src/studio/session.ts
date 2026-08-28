import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createApiRelayProvider, type ApiRelayProvider } from "@/stores/api-relay-config";
import { isManagedRelayId } from "@/studio/relay-ids";
import { mergePersistedRelays } from "@/studio/relay-merge";
import { studioRelays } from "@/studio/wiring";

type RelayPatch = Partial<
  Pick<
    ApiRelayProvider,
    | "name"
    | "baseUrl"
    | "apiKey"
    | "enabled"
    | "remark"
    | "adapterType"
    | "endpoints"
    | "authScheme"
    | "protocol"
    | "imageModels"
    | "videoModels"
    | "textModels"
    | "audioModels"
    | "models"
    | "capabilities"
  >
>;

type PersistedSession = {
  relays?: ApiRelayProvider[];
  hiddenPresetIds?: string[];
};

type StudioSession = {
  relays: ApiRelayProvider[];
  hiddenPresetIds: string[];
  setRelayKey: (id: string, apiKey: string) => void;
  setRelayEnabled: (id: string, enabled: boolean) => void;
  setRelayFields: (id: string, patch: RelayPatch) => void;
  addRelay: (input: Partial<ApiRelayProvider>) => ApiRelayProvider;
  removeRelay: (id: string) => void;
  enableWiredRelays: () => void;
  enableAllRelays: () => void;
  resetRelays: () => void;
};

function withAllEnabled(relays: ApiRelayProvider[] | undefined) {
  return (relays || []).map((item) => ({ ...item, enabled: true }));
}

function readPersisted(value: unknown): PersistedSession {
  if (!value || typeof value !== "object") return {};
  const row = value as PersistedSession;
  return {
    relays: Array.isArray(row.relays) ? row.relays : undefined,
    hiddenPresetIds: Array.isArray(row.hiddenPresetIds) ? row.hiddenPresetIds.filter((id) => typeof id === "string") : [],
  };
}

export const useStudioSession = create<StudioSession>()(
  persist(
    (set, get) => ({
      relays: studioRelays(),
      hiddenPresetIds: [],
      setRelayKey: (id, apiKey) =>
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, apiKey, enabled: true } : item)),
        }),
      setRelayEnabled: (id, enabled) =>
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, enabled } : item)),
        }),
      setRelayFields: (id, patch) =>
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }),
      addRelay: (input) => {
        const created = createApiRelayProvider({
          ...input,
          enabled: true,
          adapterType: input.adapterType || input.protocol || "openai-compat",
          protocol: input.protocol || input.adapterType || "openai-compat",
        });
        set({ relays: get().relays.concat(created) });
        return created;
      },
      removeRelay: (id) => {
        const hiddenPresetIds = isManagedRelayId(id)
          ? Array.from(new Set([...get().hiddenPresetIds, id]))
          : get().hiddenPresetIds;
        set({
          hiddenPresetIds,
          relays: get().relays.filter((item) => item.id !== id),
        });
      },
      enableWiredRelays: () =>
        set({
          relays: get().relays.map((item) => (item.apiKey ? { ...item, enabled: true } : item)),
        }),
      enableAllRelays: () => set({ relays: withAllEnabled(get().relays) }),
      resetRelays: () =>
        set({
          hiddenPresetIds: [],
          relays: mergePersistedRelays(get().relays, []),
        }),
    }),
    {
      name: "boundless-studio:session",
      version: 13,
      migrate: (persisted) => {
        const saved = readPersisted(persisted);
        return {
          hiddenPresetIds: saved.hiddenPresetIds || [],
          relays: mergePersistedRelays(saved.relays, saved.hiddenPresetIds),
        };
      },
      merge: (persisted, current) => {
        const saved = readPersisted(persisted);
        return {
          ...current,
          hiddenPresetIds: saved.hiddenPresetIds || [],
          relays: mergePersistedRelays(saved.relays, saved.hiddenPresetIds),
        };
      },
    },
  ),
);
