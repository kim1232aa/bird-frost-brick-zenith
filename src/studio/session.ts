import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createApiRelayProvider, providerHasUsableCredential, type ApiRelayProvider } from "@/stores/api-relay-config";
import { mergeRelayProviderLists, publishRelayProviders, subscribeRelayProviders } from "@/stores/relay-bridge";
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

function relayHasStoredKey(item: Pick<ApiRelayProvider, "apiKey" | "apiKeys" | "hasApiKey">) {
  return Boolean(item.hasApiKey || item.apiKey || item.apiKeys?.some(Boolean));
}

function redactBrowserRelay(item: ApiRelayProvider): ApiRelayProvider {
  return {
    ...item,
    apiKey: "",
    apiKeys: undefined,
    hasApiKey: Boolean(
      relayHasStoredKey(item)
      || item.apiKeyId
      || item.apiKeyIds?.length,
    ),
  };
}

export function vaultSnapshot(state: Pick<StudioSession, "relays" | "hiddenPresetIds">) {
  return JSON.stringify({
    hiddenPresetIds: state.hiddenPresetIds,
    relays: state.relays.map((item) => ({
      id: item.id,
      apiKey: "",
      hasApiKey: relayHasStoredKey(item),
      pendingKey: Boolean(item.apiKey || item.apiKeys?.some(Boolean)),
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
      runnableCapabilities: item.runnableCapabilities,
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
          relays: get().relays.map((item) => (item.id === id ? { ...item, apiKey, apiKeys: undefined, hasApiKey: Boolean(apiKey.trim()), enabled: true } : item)),
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
          relays: get().relays.map((item) => (providerHasUsableCredential(item) ? { ...item, enabled: true } : item)),
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
          if (typeof window !== "undefined") {
            void fetch("/client-api/catalog").then((r) => r.json()).then((cat) => {
              if (cat?.ok && Array.isArray(cat.providers)) {
                set({ relays: mergeRelaySources(get().relays, cat.providers) });
              }
            }).catch(() => {});
          }
          const remote = await loadRelayVault();
          const local = get();
          const hiddenPresetIds = Array.from(new Set([...(remote.hiddenPresetIds || []), ...local.hiddenPresetIds]));
          const relays = mergeRelaySources(local.relays, remote.relays);
          const ready = relays.filter((item) => item.enabled && (item.hasApiKey || item.apiKey)).length;
          set({
            relays,
            hiddenPresetIds,
            vaultStatus: "ok",
            vaultMessage: ready ? `密钥已同步到数据库（${ready} 条已填）` : "密钥已同步到数据库",
          });
          lastPushed = "";
          hydrating = false;
          await get().flushVault();
          if (typeof window !== "undefined") {
            setTimeout(async () => {
              try {
                const { fetchDynamicModelsForProvider } = await import("@/services/api/dynamic-model-registry");
                const currentRelays = get().relays;
                const activeRelays = currentRelays.filter((relay) => relay.enabled && (relay.hasApiKey || relay.apiKey));
                await Promise.allSettled(
                  activeRelays.map(async (relay) => {
                    try {
                      const reg = await fetchDynamicModelsForProvider(relay.id, {
                        request: async () => {
                          const { studioProxyJson } = await import("@/studio/generate/proxy");
                          return studioProxyJson({
                            provider: relay,
                            path: relay.endpoints?.models || "/models",
                            method: "GET",
                            timeoutMs: 2500,
                          });
                        },
                      });
                      if (reg?.models?.length) {
                        const discovered = reg.models.map((m) => m.id);
                        const existing = new Set(relay.models || []);
                        const newOnes = discovered.filter((m) => !existing.has(m));
                        if (newOnes.length > 0) {
                          const nextText = [...(relay.textModels || [])];
                          const nextImage = [...(relay.imageModels || [])];
                          const nextVideo = [...(relay.videoModels || [])];
                          for (const m of reg.models) {
                            if (m.category === "text" && !nextText.includes(m.id)) nextText.push(m.id);
                            if (m.category === "image" && !nextImage.includes(m.id)) nextImage.push(m.id);
                            if (m.category === "video" && !nextVideo.includes(m.id)) nextVideo.push(m.id);
                          }
                          get().setRelayFields(relay.id, {
                            models: Array.from(new Set([...(relay.models || []), ...discovered])),
                            textModels: nextText,
                            imageModels: nextImage,
                            videoModels: nextVideo,
                          });
                        }
                      }
                    } catch {}
                  })
                );
              } catch {}
            }, 3000);
          }
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          const unauthorized = /401|unauthorized|未登录/i.test(raw);
          set({
            vaultStatus: unauthorized ? "idle" : "error",
            vaultMessage: unauthorized
              ? "未登录：密钥只保存在本机浏览器，登录后才能云端同步。"
              : `密钥库同步失败（本站）：${raw}`,
          });
        } finally {
          hydrating = false;
        }
      },
      flushVault: async () => {
        if (hydrating) return;
        const state = get();
        const snap = vaultSnapshot(state);
        if (snap === lastPushed) return;
        set({ vaultStatus: "syncing" });
        try {
          await saveRelayVault({ data: { relays: state.relays, hiddenPresetIds: state.hiddenPresetIds } });
          const redacted = state.relays.map(redactBrowserRelay);
          lastPushed = vaultSnapshot({ relays: redacted, hiddenPresetIds: state.hiddenPresetIds });
          set({ relays: redacted, vaultStatus: "ok", vaultMessage: "密钥已保存到数据库" });
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          const unauthorized = /401|unauthorized|未登录/i.test(raw);
          set({
            vaultStatus: unauthorized ? "idle" : "error",
            vaultMessage: unauthorized
              ? "未登录：密钥只保存在本机浏览器，登录后才能云端同步。"
              : `密钥库写入失败（本站）：${raw}`,
          });
        }
      },
    }),
    {
      name: "boundless-studio:session",
      version: 13,
      skipHydration: typeof window === "undefined",
      partialize: (state) => ({
        relays: state.relays.map(redactBrowserRelay),
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

// Bridge: keep useConfigStore.config.apiRelays in sync with this list so the
// 中转设置对话框 and the 接线页 / model selectors never disagree about which
// providers exist, are enabled, or have a stored key.
useStudioSession.subscribe((state, prev) => {
  if (state.relays !== prev.relays) publishRelayProviders(state.relays, "session");
});

subscribeRelayProviders((incoming, source) => {
  if (source !== "config") return;
  const current = useStudioSession.getState().relays;
  const merged = mergeRelayProviderLists(current, incoming);
  if (merged === current) return;
  useStudioSession.setState({ relays: merged });
  scheduleFlush();
});
