import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  add: (item: Omit<StudioHistoryItem, "id" | "createdAt">) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useStudioHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set({
          items: [
            { ...item, id: crypto.randomUUID(), createdAt: Date.now() },
            ...get().items,
          ].slice(0, 80),
        }),
      remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
      clear: () => set({ items: [] }),
    }),
    { name: "boundless-studio:history" },
  ),
);
