import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createApiRelayProvider, type ApiRelayProvider } from "@/stores/api-relay-config";
import { isManagedRelayId } from "@/studio/relay-ids";
import { mergePersistedRelays, mergeRelaySources } from "@/studio/relay-merge";
import { loadRelayVault, saveRelayVault } from "@/studio/server/relay-vault";
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
  vaultStatus: "idle" | "syncing" | "ok" | "error";
  vaultMessage: string;
  setRelayKey: (id: string, apiKey: string) => void;
  setRelayEnabled: (id: string, enabled: boolean) => void;
  setRelayFields: (id: string, patch: RelayPatch) => void;
  addRelay: (input: Partial<ApiRelayProvider>) => ApiRelayProvider;
  removeRelay: (id: string) => void;
  enableWiredRelays: () => void;
  enableAllRelays: () => void;
  resetRelays: () => void;
  hydrateVault: () => Promise<void>;
  flushVault: () => Promise<void>;
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

function vaultSnapshot(state: Pick<StudioSession, "relays" | "hiddenPresetIds">) {
  return JSON.stringify({
    hiddenPresetIds: state.hiddenPresetIds,
    relays: state.relays.map((item) => ({
      id: item.id,
      apiKey: item.apiKey,
      apiKeys: item.apiKeys,
      baseUrl: item.baseUrl,
      enabled: item.enabled,
      name: item.name,
      adapterType: item.adapterType,
      protocol: item.protocol,
      authScheme: item.authScheme,
      endpoints: item.endpoints,
      models: item.models,
      imageModels: item.imageModels,
      videoModels: item.videoModels,
      textModels: item.textModels,
      audioModels: item.audioModels,
      capabilities: item.capabilities,
      remark: item.remark,
    })),
  });
}

let flushTimer: number | null = null;
let lastPushed = "";
let hydrating = false;

function scheduleFlush() {
  if (typeof window === "undefined" || hydrating) return;
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void useStudioSession.getState().flushVault();
  }, 800);
}

export const useStudioSession = create<StudioSession>()(
  persist(
    (set, get) => ({
      relays: studioRelays(),
      hiddenPresetIds: [],
      vaultStatus: "idle",
      vaultMessage: "",
      setRelayKey: (id, apiKey) => {
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, apiKey, enabled: true } : item)),
        });
        scheduleFlush();
      },
      setRelayEnabled: (id, enabled) => {
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, enabled } : item)),
        });
        scheduleFlush();
      },
      setRelayFields: (id, patch) => {
        set({
          relays: get().relays.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        });
        scheduleFlush();
      },
      addRelay: (input) => {
        const created = createApiRelayProvider({
          ...input,
          enabled: true,
          adapterType: input.adapterType || input.protocol || "openai-compat",
          protocol: input.protocol || input.adapterType || "openai-compat",
        });
        set({ relays: get().relays.concat(created) });
        scheduleFlush();
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
        scheduleFlush();
      },
      enableWiredRelays: () => {
        set({
          relays: get().relays.map((item) => (item.apiKey ? { ...item, enabled: true } : item)),
        });
        scheduleFlush();
      },
      enableAllRelays: () => {
        set({ relays: withAllEnabled(get().relays) });
        scheduleFlush();
      },
      resetRelays: () => {
        set({
          hiddenPresetIds: [],
          relays: mergePersistedRelays(get().relays, []),
        });
        scheduleFlush();
      },
      hydrateVault: async () => {
        if (hydrating) return;
        hydrating = true;
        set({ vaultStatus: "syncing", vaultMessage: "正在从数据库读取接线…" });
        try {
          const remote = await loadRelayVault();
          const local = get();
          const hiddenPresetIds = Array.from(new Set([...(remote.hiddenPresetIds || []), ...local.hiddenPresetIds]));
          const relays = mergeRelaySources(remote.relays, local.relays);
          set({ relays, hiddenPresetIds, vaultStatus: "ok", vaultMessage: "密钥已同步到数据库" });
          lastPushed = "";
          hydrating = false;
          await get().flushVault();
        } catch (err) {
          set({
            vaultStatus: "error",
            vaultMessage: `密钥库同步失败（本站）：${err instanceof Error ? err.message : String(err)}`,
          });
        } finally {
          hydrating = false;
        }
      },
      flushVault: async () => {
        const state = get();
        const snap = vaultSnapshot(state);
        if (snap === lastPushed) return;
        set({ vaultStatus: "syncing" });
        try {
          await saveRelayVault({ data: { relays: state.relays, hiddenPresetIds: state.hiddenPresetIds } });
          lastPushed = snap;
          set({ vaultStatus: "ok", vaultMessage: "密钥已保存到数据库" });
        } catch (err) {
          set({
            vaultStatus: "error",
            vaultMessage: `密钥库写入失败（本站）：${err instanceof Error ? err.message : String(err)}`,
          });
        }
      },
    }),
    {
      name: "boundless-studio:session",
      version: 13,
      skipHydration: typeof window === "undefined",
      partialize: (state) => ({
        relays: state.relays,
        hiddenPresetIds: state.hiddenPresetIds,
      }),
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
