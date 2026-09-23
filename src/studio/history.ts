import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createId } from "../lib/create-id.ts";
import { persistUrl } from "./persist-url.ts";

export type StudioHistoryKind = "image" | "video" | "story" | "ecommerce";

export type StudioHistoryPersistStatus = "pending" | "saved" | "failed";

export type StudioHistoryItem = {
  id: string;
  kind: StudioHistoryKind;
  title: string;
  prompt: string;
  model: string;
  /** Public provider identity only; never a key or credential. */
  providerId?: string;
  urls: string[];
  createdAt: number;
  persistStatus?: StudioHistoryPersistStatus;
  persistError?: string;
  persistWarning?: string;
};

type NewStudioHistoryItem = Omit<StudioHistoryItem, "id" | "createdAt" | "persistStatus" | "persistError" | "persistWarning">;

type HistoryState = {
  items: StudioHistoryItem[];
  hydrated: boolean;
  add: (item: NewStudioHistoryItem) => StudioHistoryItem;
  remove: (id: string) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
};

const persistWaiters = new Map<string, Promise<StudioHistoryItem>>();

export function isStableHistoryUrl(url: string) {
  return url.startsWith("data:") || url.startsWith("/gallery/") || url.startsWith("/works/");
}

export function studioHistoryPersistStatus(item: Pick<StudioHistoryItem, "persistStatus" | "persistError">): StudioHistoryPersistStatus {
  if (item.persistStatus) return item.persistStatus;
  return item.persistError ? "failed" : "saved";
}

export function isSavedStudioHistoryItem(item: Pick<StudioHistoryItem, "urls" | "persistStatus" | "persistError">) {
  return studioHistoryPersistStatus(item) === "saved" && item.urls.some(Boolean);
}

export function isFailedStudioHistoryItem(item: Pick<StudioHistoryItem, "urls" | "persistStatus" | "persistError">) {
  return studioHistoryPersistStatus(item) === "failed" && item.urls.some(Boolean);
}

export function sameStudioHistoryPayload(
  left: Pick<StudioHistoryItem, "kind" | "urls">,
  right: Pick<StudioHistoryItem, "kind" | "urls">,
) {
  return left.kind === right.kind
    && left.urls.length === right.urls.length
    && left.urls.every((url, index) => url === right.urls[index]);
}

export function mergeStudioHistoryItems(
  remote: readonly StudioHistoryItem[],
  local: readonly StudioHistoryItem[],
) {
  const seen = new Set<string>();
  const merged: StudioHistoryItem[] = [];
  for (const item of [...remote, ...local]) {
    if (!item.id || seen.has(item.id) || !item.urls.length) continue;
    if (!item.urls.every(isStableHistoryUrl)) continue;
    seen.add(item.id);
    merged.push({
      ...item,
      persistStatus: studioHistoryPersistStatus(item),
    });
  }
  return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, 80);
}

async function persistItem(item: StudioHistoryItem) {
  const urls: string[] = [];
  for (const [index, url] of item.urls.entries()) {
    const persisted = await persistUrl(url, { kind: item.kind, index });
    if (persisted) urls.push(persisted);
  }
  const next = {
    ...item,
    urls,
    persistStatus: "pending" as const,
    persistError: undefined,
    persistWarning: undefined,
  };
  if (!urls[0]) throw new Error("作品没有可保存的文件");
  const resp = await fetch("/client-api/works", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: next }),
  }).catch(() => null);
  const saved = resp ? await resp.json().catch(() => null) : null;
  if (saved?.ok && saved.item?.urls?.[0]) {
    return {
      ...saved.item,
      persistStatus: "saved" as const,
      persistWarning: saved.warning || undefined,
    };
  }
  throw new Error(saved && "error" in saved && saved.error ? saved.error : "作品未能写入服务器");
}

export async function recordGeneratedWork(item: NewStudioHistoryItem) {
  if (typeof window === "undefined") return;
  if (!item.urls?.[0]) return;
  const row = useStudioHistory.getState().add(item);
  const pending = persistWaiters.get(row.id);
  if (pending) return pending;
  return row;
}

export const useStudioHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,
      add: (item) => {
        const existing = get().items.find((row) =>
          studioHistoryPersistStatus(row) !== "failed" && sameStudioHistoryPayload(row, item),
        );
        if (existing) return existing;
        const row: StudioHistoryItem = {
          ...item,
          id: createId(),
          createdAt: Date.now(),
          persistStatus: "pending",
          persistError: undefined,
          persistWarning: undefined,
        };
        set({ items: [row, ...get().items].slice(0, 80) });
        const pending = persistItem(row)
          .then((next) => {
            persistWaiters.delete(row.id);
            set({ items: get().items.map((current) => (current.id === row.id ? next : current)) });
            return next;
          })
          .catch((err) => {
            persistWaiters.delete(row.id);
            const raw = err instanceof Error ? err.message : "作品未能写入服务器";
            const persistError = /Failed to fetch|NetworkError|Load failed/i.test(raw)
              ? "作品未能写入服务器（浏览器跨域或网络失败）"
              : raw;
            const failed = { ...row, persistStatus: "failed" as const, persistError };
            set({
              items: get().items.map((current) => (current.id === row.id ? failed : current)),
            });
            return failed;
          });
        persistWaiters.set(row.id, pending);
        return row;
      },
      remove: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
        void fetch(`/client-api/works?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
      },
      clear: () => {
        const ids = get().items.map((item) => item.id);
        set({ items: [] });
        void Promise.all(ids.map((id) => fetch(`/client-api/works?id=${encodeURIComponent(id)}`, { method: "DELETE" }))).catch(() => undefined);
      },
      hydrate: async () => {
        try {
          const resp = await fetch("/client-api/works").catch(() => null);
          const data = resp ? await resp.json().catch(() => null) : null;
          const remote = Array.isArray(data?.items) ? data.items : [];
          set({
            items: mergeStudioHistoryItems(remote, get().items),
            hydrated: true,
          });
        } catch {
          set({ items: mergeStudioHistoryItems([], get().items), hydrated: true });
        }
      },
    }),
    {
      name: "boundless-studio:history",
      skipHydration: typeof window === "undefined",
      // b64 data URLs from providers (HF 等) 一张图就几 MB，直接塞 localStorage
      // 会把 5MB 配额打爆并让后续 setItem 抛错、打断结果展示。持久化时剥掉
      // data: URL（作品文件已落 /works，历史记录只留可重载的地址），
      // 并把 storage 包成永不抛错的版本兜底配额异常。
      partialize: (state) => ({
        items: state.items.map((item) => ({
          ...item,
          urls: item.urls.map((url) => (url.startsWith("data:") ? "" : url)),
        })),
      }),
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return window.localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            window.localStorage.setItem(name, value);
          } catch {
            /* quota —— 生成结果优先展示，历史快照丢了不阻塞 */
          }
        },
        removeItem: (name) => {
          try {
            window.localStorage.removeItem(name);
          } catch {
            /* ignore */
          }
        },
      })),
    },
  ),
);
