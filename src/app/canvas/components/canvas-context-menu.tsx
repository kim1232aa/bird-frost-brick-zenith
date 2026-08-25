"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "../types";

export type CanvasContextMenuItem = {
    id: string;
    label: string;
    icon?: ReactNode;
    onClick?: () => void;
    shortcut?: string;
    submenu?: boolean;
    children?: CanvasContextMenuItem[];
    danger?: boolean;
    disabled?: boolean;
};

export type CanvasContextMenuGroup = {
    title?: string;
    items: CanvasContextMenuItem[];
};

type CanvasNodeContextMenuProps = {
    menu: ContextMenuState;
    groups: CanvasContextMenuGroup[];
    onClose: () => void;
};

export function CanvasNodeContextMenu({ menu, groups, onClose }: CanvasNodeContextMenuProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter(Boolean) })).filter((group) => group.items.length);
    const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
    const left = Math.max(12, Math.min(menu.x, Math.max(12, viewportWidth - 268)));
    const top = Math.max(12, Math.min(menu.y - 64, Math.max(12, viewportHeight - 420)));
    const submenuSide: "left" | "right" = left + 236 * 2 + 12 > viewportWidth ? "left" : "right";

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest("[data-canvas-context-menu],.ant-popover,.ant-modal")) return;
            onClose();
        };
        const closeOnKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("wheel", onClose, { passive: true });
        window.addEventListener("keydown", closeOnKey);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("wheel", onClose);
            window.removeEventListener("keydown", closeOnKey);
        };
    }, [onClose]);

    if (!visibleGroups.length) return null;

    return (
        <div
            data-canvas-context-menu
            className="fixed z-[90] w-[236px] overflow-visible rounded-xl border py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.22)] backdrop-blur-xl"
            style={{ left, top, background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {visibleGroups.map((group, groupIndex) => (
                <div key={group.title || groupIndex} className={groupIndex ? "border-t py-1.5" : "py-1"} style={{ borderColor: `${theme.toolbar.border}c8` }}>
                    {group.title ? <div className="px-3 pb-1 pt-1 text-[11px] font-medium opacity-45">{group.title}</div> : null}
                    {group.items.map((item) => (
                        <MenuButton key={item.id} item={item} onClose={onClose} submenuSide={submenuSide} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function MenuButton({ item, onClose, submenuSide }: { item: CanvasContextMenuItem; onClose: () => void; submenuSide: "left" | "right" }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const children = item.children?.filter(Boolean) || [];
    const hasChildren = children.length > 0;

    return (
        <div className="group/menuitem relative">
            <button
                type="button"
                disabled={item.disabled}
                className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                style={{ color: item.danger ? "#f87171" : theme.node.text }}
                onClick={() => {
                    if (item.disabled || hasChildren) return;
                    item.onClick?.();
                    onClose();
                }}
            >
                {item.icon ? <span className="grid size-4 shrink-0 place-items-center">{item.icon}</span> : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.shortcut ? <span className="shrink-0 text-[12px] opacity-55">{item.shortcut}</span> : null}
                {hasChildren || item.submenu ? <span className="shrink-0 text-[14px] opacity-70">&gt;</span> : null}
            </button>
            {hasChildren ? (
                <div
                    className={[
                        "invisible absolute top-0 z-[91] w-[236px] rounded-xl border py-1.5 opacity-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] backdrop-blur-xl transition group-hover/menuitem:visible group-hover/menuitem:opacity-100 group-focus-within/menuitem:visible group-focus-within/menuitem:opacity-100",
                        submenuSide === "right" ? "left-full ml-1" : "right-full mr-1",
                    ].join(" ")}
                    style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    {children.map((child) => (
                        <MenuButton key={child.id} item={child} onClose={onClose} submenuSide={submenuSide} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
