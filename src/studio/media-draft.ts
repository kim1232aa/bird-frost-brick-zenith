import { create } from "zustand";

type MediaDraft = {
  references: string[];
  firstFrame: string;
  lastFrame: string;
  clipUrl: string;
  frames: string[];
  setReferences: (value: string[] | ((current: string[]) => string[])) => void;
  setFirstFrame: (value: string) => void;
  setLastFrame: (value: string) => void;
  setClipUrl: (value: string) => void;
  setFrames: (value: string[] | ((current: string[]) => string[])) => void;
};

export const useMediaDraft = create<MediaDraft>((set, get) => ({
  references: [],
  firstFrame: "",
  lastFrame: "",
  clipUrl: "",
  frames: [],
  setReferences: (value) => set({ references: typeof value === "function" ? value(get().references) : value }),
  setFirstFrame: (value) => set({ firstFrame: value }),
  setLastFrame: (value) => set({ lastFrame: value }),
  setClipUrl: (value) => set({ clipUrl: value }),
  setFrames: (value) => set({ frames: typeof value === "function" ? value(get().frames) : value }),
}));
