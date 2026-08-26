import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: "infinite-canvas:theme_store",
            storage: createJSONStorage(() => localForageStorage),
            version: 2,
            migrate: (persisted) => {
                const state = (persisted || {}) as { theme?: ThemeName };
                return { theme: state.theme === "dark" ? "dark" : "light" };
            },
        },
    ),
);
