"use client";

import { createContext, useContext } from "react";

export type CanvasActions = {
  runNode: (id: string) => Promise<void>;
  analyzeStory: (id: string) => Promise<void>;
  generateCharacters: (id: string, index?: number) => Promise<void>;
  generateShots: (id: string, index?: number) => Promise<void>;
  runAllStory: (id: string) => Promise<void>;
  spawnCharacterConfig: (id: string) => void;
  spawnShotConfig: (id: string) => void;
  duplicateNode: (id: string) => void;
  downloadNode: (id: string) => void;
  enhanceNode: (id: string) => Promise<void>;
  spawnUpscale: (id: string) => void;
  openImageTool: (id: string, kind: "crop" | "mask" | "angle" | "split" | "reverse" | "derived") => void;
  copyPrompt: (id: string) => void;
  copyImage: (id: string) => void;
  busy: string;
};

const CanvasActionsContext = createContext<CanvasActions | null>(null);

export const CanvasActionsProvider = CanvasActionsContext.Provider;

export function useCanvasActions() {
  const value = useContext(CanvasActionsContext);
  if (!value) {
    return {
      runNode: async () => undefined,
      analyzeStory: async () => undefined,
      generateCharacters: async () => undefined,
      generateShots: async () => undefined,
      runAllStory: async () => undefined,
      spawnCharacterConfig: () => undefined,
      spawnShotConfig: () => undefined,
      duplicateNode: () => undefined,
      downloadNode: () => undefined,
      enhanceNode: async () => undefined,
      spawnUpscale: () => undefined,
      openImageTool: () => undefined,
      copyPrompt: () => undefined,
      copyImage: () => undefined,
      busy: "",
    } satisfies CanvasActions;
  }
  return value;
}
