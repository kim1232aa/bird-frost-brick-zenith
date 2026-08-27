import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CurrentModelKind = "text" | "image" | "video" | "audio";

type CurrentModelsState = {
  text: string;
  image: string;
  video: string;
  audio: string;
  setKind: (kind: CurrentModelKind, value: string) => void;
};

export const useCurrentModels = create<CurrentModelsState>()(
  persist(
    (set) => ({
      text: "",
      image: "",
      video: "",
      audio: "",
      setKind: (kind, value) => set({ [kind]: value }),
    }),
    { name: "boundless-studio:current-models" },
  ),
);
