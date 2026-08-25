"use client";

import type { ReactNode } from "react";
import { Button } from "antd";
import { Download, ImagePlus, PanelRightClose, Sparkles, Star, Trash2, FolderPlus } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export function CanvasGenerationHistoryPanel({
    nodes,
    selectedId,
    onSelect,
    onInsert,
    canReference,
    onReference,
    onSave,
    onDownload,
    onDelete,
    onClose,
}: {
    nodes: CanvasNodeData[];
    selectedId: string | null;
    onSelect: (nodeId: string) => void;
    onInsert: (node: CanvasNodeData) => void;
    canReference: boolean;
    onReference: (node: CanvasNodeData) => void;
    onSave: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const items = nodes
        .filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content) && Boolean(node.metadata?.prompt || node.metadata?.generationType || node.metadata?.sourceImageTaskId))
        .slice()
        .reverse();

    return (
        <aside
            className="pointer-events-auto absolute right-4 top-[76px] z-50 flex max-h-[calc(100vh-150px)] w-[320px] flex-col rounded-xl border shadow-[0_18px_50px_rgba(0,0,0,.22)] backdrop-blur-xl"
            style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
        >
            <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex min-w-0 items-center gap-2">
                    <Sparkles className="size-4 text-sky-400" />
                    <span className="font-semibold">生成历史</span>
                    <span className="text-xs opacity-50">{items.length}</span>
                </div>
                <Button type="text" size="small" icon={<PanelRightClose className="size-4" />} onClick={onClose} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-auto p-2">
                {items.length ? (
                    items.map((node) => (
                        <button
                            key={node.id}
                            type="button"
                            className="block w-full rounded-lg border p-2 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ borderColor: selectedId === node.id ? "#38bdf8" : theme.toolbar.border }}
                            onClick={() => onSelect(node.id)}
                        >
                            <div className="flex gap-2">
                                <img src={node.metadata?.content} alt="" className="size-16 shrink-0 rounded-md bg-black object-cover" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{node.title || "生成图片"}</div>
                                    <div className="mt-1 line-clamp-2 text-xs opacity-60">{node.metadata?.prompt || "无提示词"}</div>
                                    <div className="mt-1 text-[11px] opacity-45">{node.metadata?.naturalWidth || Math.round(node.width)} x {node.metadata?.naturalHeight || Math.round(node.height)}px</div>
                                </div>
                            </div>
                            <div className={`mt-2 grid ${canReference ? "grid-cols-5" : "grid-cols-4"} gap-1`}>
                                <HistoryAction title="插入画布" icon={<ImagePlus className="size-3.5" />} onClick={() => onInsert(node)} />
                                {canReference ? <HistoryAction title="作为参考" icon={<Star className="size-3.5" />} onClick={() => onReference(node)} /> : null}
                                <HistoryAction title="存素材" icon={<FolderPlus className="size-3.5" />} onClick={() => onSave(node)} />
                                <HistoryAction title="下载" icon={<Download className="size-3.5" />} onClick={() => onDownload(node)} />
                                <HistoryAction title="删除" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(node)} />
                            </div>
                        </button>
                    ))
                ) : (
                    <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm opacity-55" style={{ borderColor: theme.toolbar.border }}>
                        暂无生成结果
                    </div>
                )}
            </div>
        </aside>
    );
}

function HistoryAction({ title, icon, danger, onClick }: { title: string; icon: ReactNode; danger?: boolean; onClick: () => void }) {
    return (
        <span
            title={title}
            className={`grid h-8 place-items-center rounded-md border text-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${danger ? "text-red-400" : ""}`}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            {icon}
        </span>
    );
}
