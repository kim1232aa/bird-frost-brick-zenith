import { create } from "zustand";

export type MediaDraftMode = "t2i" | "i2i" | "edit" | "t2v" | "i2v" | "flf" | "extract";

type MediaDraftState = {
  references: string[];
  firstFrame: string;
  lastFrame: string;
  frames: string[];
  clipUrl: string;
  setReferences: (urls: string[]) => void;
  addReferences: (urls: string[]) => void;
  removeReference: (index: number) => void;
  setFirstFrame: (url: string) => void;
  setLastFrame: (url: string) => void;
  setFrames: (urls: string[]) => void;
  setClipUrl: (url: string) => void;
  clear: () => void;
};

export const useMediaDraft = create<MediaDraftState>()((set, get) => ({
  references: [],
  firstFrame: "",
  lastFrame: "",
  frames: [],
  clipUrl: "",
  setReferences: (urls) => set({ references: urls.slice(0, 3) }),
  addReferences: (urls) => set({ references: [...get().references, ...urls].slice(0, 3) }),
  removeReference: (index) => set({ references: get().references.filter((_, i) => i !== index) }),
  setFirstFrame: (url) => set({ firstFrame: url }),
  setLastFrame: (url) => set({ lastFrame: url }),
  setFrames: (urls) => set({ frames: urls }),
  setClipUrl: (url) => set({ clipUrl: url }),
  clear: () => set({ references: [], firstFrame: "", lastFrame: "", frames: [], clipUrl: "" }),
}));
