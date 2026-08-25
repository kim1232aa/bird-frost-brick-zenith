"use client";

import type { CSSProperties, RefObject } from "react";
import { BookOpen, Keyboard, Settings2 } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { DOCS_URL } from "@/constant/env";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

type UserStatusActionsProps = {
  showDocs?: boolean;
  showConfig?: boolean;
  variant?: "default" | "canvas";
  onOpenShortcuts?: () => void;
  accountOpen?: boolean;
  onAccountOpenChange?: (open: boolean) => void;
  accountRef?: RefObject<HTMLDivElement | null>;
  getPopupContainer?: (node: HTMLElement) => HTMLElement;
};

export function UserStatusActions({ showDocs = true, showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const canvasTheme = canvasThemes[theme];
  const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
  const iconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";

  return (
    <div className="inline-flex shrink-0 items-center gap-1">
      {showDocs ? (
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={iconClass} style={iconStyle} aria-label="文档" title="文档">
          <BookOpen className="size-4" />
        </a>
      ) : null}
      {showConfig ? (
        <button type="button" className={iconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
          <Settings2 className="size-4" />
        </button>
      ) : null}
      <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={iconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
      {onOpenShortcuts ? (
        <button type="button" className={iconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
          <Keyboard className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
