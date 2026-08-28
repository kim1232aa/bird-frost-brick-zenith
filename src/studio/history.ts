import { create } from "zustand";
import { persist } from "zustand/middleware";
import { deleteStudioWork, listStudioWorks, saveStudioWork } from "@/studio/server/works";

export type StudioHistoryKind = "image" | "video" | "story" | "ecommerce";

export type StudioHistoryItem = {
  id: string;
  kind: StudioHistoryKind;
  title: string;
  prompt: string;
  model: string;
  urls: string[];
  createdAt: number;
};

type HistoryState = {
  items: StudioHistoryItem[];
  hydrated: boolean;
  add: (item: Omit<StudioHistoryItem, "id" | "createdAt">) => StudioHistoryItem;
  remove: (id: string) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
};

async function persistUrl(url: string) {
  if (!url) return url;
  if (url.startsWith("data:") || url.startsWith("http") || url.startsWith("/")) return url;
  if (!url.startsWith("blob:")) return url;
  try {
    const blob = await fetch(url).then((res) => res.blob());
    if (blob.size > 3_500_000) return url;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
  } catch {
    return url;
  }
}

async function persistItem(item: StudioHistoryItem) {
  const urls = (await Promise.all(item.urls.map(persistUrl))).filter(Boolean);
  const next = { ...item, urls };
  if (!urls[0]) return next;
  try {
    await saveStudioWork({ data: next });
  } catch {
    /* keep the local copy if the vault is down */
  }
  return next;
}

export const useStudioHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,
      add: (item) => {
        const row: StudioHistoryItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
        set({ items: [row, ...get().items].slice(0, 80) });
        void persistItem(row).then((next) => {
          if (next.urls[0] && next.urls[0] !== row.urls[0]) {
            set({ items: get().items.map((current) => (current.id === row.id ? next : current)) });
          }
        });
        return row;
      },
      remove: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
        void deleteStudioWork({ data: { id } }).catch(() => undefined);
      },
      clear: () => {
        const ids = get().items.map((item) => item.id);
        set({ items: [] });
        ids.forEach((id) => {
          void deleteStudioWork({ data: { id } }).catch(() => undefined);
        });
      },
      hydrate: async () => {
        try {
          const remote = await listStudioWorks();
          const local = get().items;
          const seen = new Set<string>();
          const merged: StudioHistoryItem[] = [];
          for (const item of [...remote, ...local]) {
            if (!item.id || seen.has(item.id) || !item.urls[0]) continue;
            seen.add(item.id);
            merged.push(item);
          }
          merged.sort((a, b) => b.createdAt - a.createdAt);
          set({ items: merged.slice(0, 80), hydrated: true });
        } catch {
          set({ hydrated: true });
        }
      },
    }),
    { name: "boundless-studio:history", partialize: (state) => ({ items: state.items }) },
  ),
);
