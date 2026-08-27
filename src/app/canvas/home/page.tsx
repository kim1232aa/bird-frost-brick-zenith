"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNavigate } from "@tanstack/react-router";
import { App, Button } from "antd";
import { Download, FileUp, LayoutGrid, List, Plus, Settings2, Wrench } from "lucide-react";

import { readZip } from "@/lib/zip";
import { getDesktopSetting, setDesktopSetting } from "@/services/desktop-storage";
import { openApiSettings } from "@/services/settings-dialog";
import { planLabel, useMembershipStore } from "@/studio/membership";
import { STUDIO_ROUTES } from "@/studio/wiring";
import { setMediaBlob, deleteStoredMedia, getAllStoredMediaKeys } from "@/services/file-storage";
import { setImageBlob, deleteStoredImages, getAllStoredImageKeys } from "@/services/image-storage";
import { pushMediaToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";
import { CanvasDeleteProjectsDialog } from "../components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "../components/canvas-project-card";
import type { CanvasExportFile } from "../export-types";
import { useCanvasStore } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";
import { importCanvasArchive, type CanvasArchive, type CanvasArchiveImportHandlers } from "../utils/canvas-import";

export type CanvasHomeViewMode = "list" | "grid";

const CANVAS_HOME_VIEW_STORAGE_KEY = "infinite-canvas-home-view";
const CANVAS_EXPORT_APP: CanvasExportFile["app"] = "infinite-canvas";
const CANVAS_EXPORT_VERSION: CanvasExportFile["version"] = 3;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanvasExportAsset(value: unknown) {
    return isRecord(value)
        && typeof value.storageKey === "string"
        && value.storageKey.length > 0
        && typeof value.path === "string"
        && value.path.length > 0
        && typeof value.mimeType === "string"
        && value.mimeType.length > 0
        && typeof value.bytes === "number"
        && Number.isSafeInteger(value.bytes)
        && value.bytes >= 0;
}

function isCanvasProject(value: unknown) {
    if (!isRecord(value) || !isRecord(value.viewport)) return false;
    return typeof value.id === "string"
        && value.id.length > 0
        && typeof value.title === "string"
        && typeof value.createdAt === "string"
        && value.createdAt.length > 0
        && typeof value.updatedAt === "string"
        && value.updatedAt.length > 0
        && Array.isArray(value.nodes)
        && Array.isArray(value.connections)
        && Array.isArray(value.chatSessions)
        && (value.activeChatId === null || typeof value.activeChatId === "string")
        && (value.backgroundMode === "dots" || value.backgroundMode === "lines" || value.backgroundMode === "blank")
        && typeof value.showImageInfo === "boolean"
        && typeof value.viewport.x === "number"
        && Number.isFinite(value.viewport.x)
        && typeof value.viewport.y === "number"
        && Number.isFinite(value.viewport.y)
        && typeof value.viewport.k === "number"
        && Number.isFinite(value.viewport.k);
}

export function validateCanvasImportFile(value: unknown): CanvasExportFile {
    if (!isRecord(value)) throw new Error("画布压缩包格式无效");
    if (value.app !== CANVAS_EXPORT_APP) throw new Error("该压缩包不是无限画布导出文件");
    if (value.version !== CANVAS_EXPORT_VERSION) throw new Error(`画布压缩包版本不兼容，仅支持版本 ${CANVAS_EXPORT_VERSION}`);
    if (typeof value.exportedAt !== "string" || !value.exportedAt) throw new Error("画布压缩包格式无效：缺少导出时间");
    if (!Array.isArray(value.projects)) throw new Error("画布压缩包的项目清单无效");

    for (const item of value.projects) {
        if (!isRecord(item) || !isCanvasProject(item.project)) throw new Error("画布压缩包的项目条目无效");
        if (!Array.isArray(item.files)) throw new Error("画布压缩包的素材清单无效");
        if (!item.files.every(isCanvasExportAsset)) throw new Error("画布压缩包的素材条目无效");
    }

    return value as CanvasExportFile;
}

export function importValidatedCanvasArchive(archive: CanvasArchive, value: unknown, handlers: CanvasArchiveImportHandlers) {
    return importCanvasArchive(archive, validateCanvasImportFile(value), handlers);
}

export function getNextCanvasProjectTitle(projects: ReadonlyArray<{ title: string }>): string {
    let largest = 0n;
    for (const project of projects) {
        const match = /^无限画布 ([0-9]+)$/.exec(project.title);
        if (!match) continue;
        const number = BigInt(match[1]);
        if (number > largest) largest = number;
    }
    return `无限画布 ${largest + 1n}`;
}

export default function CanvasPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const [viewMode, setViewMode] = useState<CanvasHomeViewMode>("list");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    useEffect(() => {
        let active = true;
        void getDesktopSetting(CANVAS_HOME_VIEW_STORAGE_KEY).then((savedViewMode) => {
            if (active && (savedViewMode === "grid" || savedViewMode === "list")) setViewMode(savedViewMode);
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const raw = window.localStorage.getItem("boundless-studio:canvas-drop");
        if (!raw) return;
        window.localStorage.removeItem("boundless-studio:canvas-drop");
        try {
            const payload = JSON.parse(raw) as { kind?: string; url?: string; prompt?: string; model?: string; text?: string };
            if (payload.kind === "story") return;
            const id = pushMediaToCanvasWorkspace({
                kind: payload.kind === "video" ? "video" : payload.url ? "image" : "text",
                url: payload.url,
                prompt: payload.prompt || payload.text,
                model: payload.model,
                title: (payload.prompt || payload.text || "画布素材").slice(0, 18),
            });
            void navigate({ to: "/canvas/workspace", search: { id } });
        } catch {
            /* keep the project library usable if the drop payload is stale */
        }
    }, [navigate]);

    const changeViewMode = (nextViewMode: CanvasHomeViewMode) => {
        setViewMode(nextViewMode);
        void setDesktopSetting(CANVAS_HOME_VIEW_STORAGE_KEY, nextViewMode);
    };

    const enterProject = (id: string) => {
        void navigate({ to: "/canvas/workspace", search: { id } });
    };
    const createAndEnter = () => {
        const id = createProject(getNextCanvasProjectTitle(projects));
        void navigate({ to: "/canvas/workspace", search: { id } });
    };
    const plan = useMembershipStore((state) => state.plan);
    const remainingVideo = useMembershipStore((state) => state.remaining("video"));
    const remainingImage = useMembershipStore((state) => state.remaining("image"));
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text());
            const importedProjectCount = await importValidatedCanvasArchive(zip, data, {
                writeMedia: async (storageKey, blob) => {
                    if (storageKey.startsWith("image:")) await setImageBlob(storageKey, blob);
                    else await setMediaBlob(storageKey, blob);
                },
                deleteMedia: async (storageKeys) => {
                    const imageKeys = storageKeys.filter((k) => k.startsWith("image:"));
                    const mediaKeys = storageKeys.filter((k) => !k.startsWith("image:"));
                    if (imageKeys.length > 0) await deleteStoredImages(imageKeys);
                    if (mediaKeys.length > 0) await deleteStoredMedia(mediaKeys);
                },
                importProject: (project) => {
                    importProject(project);
                    return project.id;
                },
                deleteProjects: (projectIds) => {
                    const deleteProjects = useCanvasStore.getState().deleteProjects;
                    deleteProjects(projectIds);
                },
                getExistingMediaKeys: async () => {
                    const imageKeys = await getAllStoredImageKeys();
                    const mediaKeys = await getAllStoredMediaKeys();
                    return new Set([...imageKeys, ...mediaKeys]);
                },
            });
            message.success(`已导入 ${importedProjectCount} 个画布`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <section className="canvas-home-shell min-h-full overflow-y-auto bg-[#f7f5f1] text-stone-900">
            <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
                    <div>
                        <p className="text-xs tracking-[0.2em] text-emerald-600">BOUNDLESS STUDIO</p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">无限画布</h1>
                        <p className="mt-2 max-w-xl text-sm text-stone-500">在一张浅色无限画布上组织文本、图片、视频和故事导演。节点、连线、Seedance 工作流都会保存在这台浏览器里。</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button type="button" onClick={() => openApiSettings("relay")} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                            {planLabel(plan)} · 图 {remainingImage} · 视频 {remainingVideo}
                        </button>
                        <div className="flex items-center rounded-md border border-stone-200 bg-white p-0.5" role="group" aria-label="画布显示方式">
                            <Button
                                type={viewMode === "list" ? "primary" : "text"}
                                size="small"
                                icon={<List className="size-4" />}
                                onClick={() => changeViewMode("list")}
                                aria-label="列表显示"
                                aria-pressed={viewMode === "list"}
                                title="列表显示"
                            >
                                列表
                            </Button>
                            <Button
                                type={viewMode === "grid" ? "primary" : "text"}
                                size="small"
                                icon={<LayoutGrid className="size-4" />}
                                onClick={() => changeViewMode("grid")}
                                aria-label="卡片显示"
                                aria-pressed={viewMode === "grid"}
                                title="卡片显示"
                            >
                                卡片
                            </Button>
                        </div>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button
                            disabled={!hydrated || !projects.length}
                            icon={<Download className="size-4" />}
                            onClick={() => {
                                const downloadProjects = selectedIds.length ? projects.filter((project) => selectedIds.includes(project.id)) : projects;
                                void exportCanvasProjects(downloadProjects, selectedIds.length ? `无限画布-${selectedIds.length}个项目` : "无限画布-全部项目");
                            }}
                            title={selectedIds.length ? `下载选中的 ${selectedIds.length} 个画布` : "下载全部画布"}
                        >
                            下载画布
                        </Button>
                        <Button icon={<Settings2 className="size-4" />} onClick={() => openApiSettings("relay")}>
                            设置
                        </Button>
                        <Link href="/canvas-repair">
                            <Button icon={<Wrench className="size-4" />}>修复加载</Button>
                        </Link>
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除全部
                            </Button>
                        ) : null}
                    </div>
                </header>

                <div className="grid gap-3 sm:grid-cols-3">
                    <WiringChip label="文本" value={STUDIO_ROUTES.text.model} hint="Grok 4.6" />
                    <WiringChip label="生图" value={STUDIO_ROUTES.image.model} hint="火山 Seedream 5.0 Lite" />
                    <WiringChip label="生视频" value={STUDIO_ROUTES.video.model} hint="xAI Imagine /videos/generations" />
                </div>

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-sm text-stone-500">正在加载画布...</section>
                ) : projects.length ? (
                    <div className={viewMode === "list" ? "flex flex-col gap-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"} data-view-mode={viewMode}>
                        {projects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} viewMode={viewMode} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-white text-center">
                        <h2 className="text-xl font-medium text-stone-900">从一张空白画布开始</h2>
                        <p className="mt-3 max-w-md text-sm text-stone-500">节点、连线、故事导演、Seedance 工作流都会保存在这台浏览器里。随时可导入导出压缩包。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </section>
    );
}

function WiringChip({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <button type="button" onClick={() => openApiSettings("routing")} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-emerald-300">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">{label}</div>
            <div className="mt-1 truncate font-mono text-sm text-stone-900">{value || "未接线"}</div>
            <div className="mt-1 text-xs text-stone-500">{hint}</div>
        </button>
    );
}
