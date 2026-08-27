"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Image as ImageIcon, Pencil, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Input } from "antd";

import { resolveImageUrl } from "@/services/image-storage";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { CanvasNodeType } from "../types";
import { exportCanvasProjects } from "../utils/canvas-export";

type CanvasProjectCardProps = {
    project: CanvasProject;
    viewMode?: "list" | "grid";
};

export function CanvasProjectCard({ project, viewMode = "grid" }: CanvasProjectCardProps) {
    const router = useRouter();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => router.push("/canvas/workspace?id=" + encodeURIComponent(project.id));
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };
    const coverSource = useMemo(() => getProjectCoverSource(project), [project]);
    const [resolvedCover, setResolvedCover] = useState<{ storageKey: string; url: string } | null>(null);
    const persistedCoverFallback = coverSource?.content?.startsWith("blob:") ? "" : coverSource?.content || "";
    const coverUrl = coverSource?.storageKey ? (resolvedCover?.storageKey === coverSource.storageKey ? resolvedCover.url : persistedCoverFallback) : coverSource?.content || "";
    const updatedAt = new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    useEffect(() => {
        let cancelled = false;
        if (!coverSource?.storageKey) return;
        void resolveImageUrl(coverSource.storageKey, persistedCoverFallback)
            .then((url) => {
                if (!cancelled) setResolvedCover({ storageKey: coverSource.storageKey!, url });
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [coverSource, persistedCoverFallback]);

    const selectionCheckbox = (className: string) => (
        <input
            type="checkbox"
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => toggleSelected(project.id, event.target.checked)}
            className={className}
            aria-label={"选择 " + project.title}
        />
    );

    const actionButtons = () =>
        editing ? (
            <>
                <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label="保存名称" title="保存名称" />
                <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label="取消重命名" title="取消重命名" />
            </>
        ) : (
            <>
                <Button type="text" size="small" shape="circle" icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects([project], project.title || "无限画布")} aria-label="导出" title="导出" />
                <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => startEditing(project.id, project.title)} aria-label="重命名" title="重命名" />
                <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([project.id])} aria-label="删除" title="删除" />
            </>
        );

    if (viewMode === "list") {
        return (
            <article
                data-project-view="list"
                className={"group flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2.5 shadow-sm transition hover:border-emerald-200 hover:shadow-md " + (selected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-stone-200")}
                onClick={() => !editing && open()}
            >
                {selectionCheckbox("size-4 shrink-0 accent-stone-950 dark:accent-stone-100")}
                <div className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-md bg-stone-100 sm:block">
                    {coverUrl ? (
                        <Image src={coverUrl} alt={project.title} fill sizes="96px" unoptimized className="object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-stone-400">
                            <ImageIcon className="size-5" />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <Input className="max-w-md" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                    ) : (
                        <button
                            type="button"
                            className="block w-full min-w-0 cursor-pointer text-left"
                            onClick={(event) => {
                                event.stopPropagation();
                                open();
                            }}
                        >
                            <h2 className="truncate text-base font-semibold text-stone-900">{project.title}</h2>
                            <p className="mt-1 text-sm text-stone-500">
                                {project.nodes.length} 个节点 · {project.connections.length} 条连线
                            </p>
                        </button>
                    )}
                </div>
                <p className="hidden w-36 shrink-0 text-right text-xs text-stone-500 md:block">更新于 {updatedAt}</p>
                <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {actionButtons()}
                </div>
            </article>
        );
    }

    return (
        <article
            data-project-view="grid"
            className={"group cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md " + (selected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-stone-200")}
            onClick={() => !editing && open()}
        >
            <div className="relative aspect-video overflow-hidden bg-stone-100">
                {coverUrl ? (
                    <Image src={coverUrl} alt={project.title} fill sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" unoptimized className="object-cover transition duration-300 group-hover:scale-[1.03]" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="grid size-10 place-items-center rounded-md bg-stone-200 text-stone-500 shadow-sm">
                            <ImageIcon className="size-5" />
                        </div>
                    </div>
                )}
                <div className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                    {project.nodes.length} 节点
                </div>
            </div>

            <div className="p-3">
                <div className="flex items-start gap-2.5">
                    {selectionCheckbox("mt-0.5 size-4 shrink-0 accent-stone-950 dark:accent-stone-100")}
                    {editing ? (
                        <Input className="min-w-0" value={editingTitle} onClick={(event) => event.stopPropagation()} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && saveTitle()} autoFocus />
                    ) : (
                        <button
                            type="button"
                            className="min-w-0 flex-1 cursor-pointer text-left"
                            onClick={(event) => {
                                event.stopPropagation();
                                open();
                            }}
                        >
                            <h2 className="truncate text-base font-semibold text-stone-900">{project.title}</h2>
                            <p className="mt-1 text-xs text-stone-500">
                                {project.nodes.length} 个节点 · {project.connections.length} 条连线
                            </p>
                        </button>
                    )}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                    <p className="truncate text-[11px] text-stone-500">更新于 {updatedAt}</p>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
                        {actionButtons()}
                    </div>
                </div>
            </div>
        </article>
    );
}

function getProjectCoverSource(project: CanvasProject) {
    const node = project.nodes.find((item) => item.type === CanvasNodeType.Image && (item.metadata?.storageKey || item.metadata?.content));
    if (!node) return null;
    return {
        storageKey: node.metadata?.storageKey,
        content: node.metadata?.content,
    };
}
