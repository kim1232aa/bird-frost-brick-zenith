"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { App, Button } from "antd";
import { Download, FileUp, LayoutGrid, List, Plus } from "lucide-react";

import { readZip } from "@/lib/zip";
import { findCatalog } from "@/studio/catalog";
import { liveCard } from "@/studio/ops";
import { preferredImageKey, preferredTextKey, preferredVideoKey } from "@/studio/model-select";
import { useCurrentModels } from "@/studio/current-models-store";
import { useStudioSession } from "@/studio/session";
import { setMediaBlob, deleteStoredMedia, getAllStoredMediaKeys, uploadMediaFile } from "@/services/file-storage";
import { setImageBlob, deleteStoredImages, getAllStoredImageKeys } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "../components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "../components/canvas-project-card";
import type { CanvasExportFile } from "../export-types";
import { INFINITE_CANVAS_SEED_ID, useCanvasStore } from "../stores/use-canvas-store";
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

/** Media served by this app's own `/works/` disk store rather than a browser cache. */
function isServerMediaKey(value: string) {
    return value.startsWith("/works/") || value.startsWith("/gallery/") || /^https?:\/\//i.test(value);
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
    const [viewMode, setViewMode] = useState<CanvasHomeViewMode>("grid");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const hydrationStatus = useCanvasStore((state) => state.hydrationStatus);
    const hydrationError = useCanvasStore((state) => state.hydrationError);
    const retryHydration = useCanvasStore((state) => state.retryHydration);
    const projects = useCanvasStore((state) => state.projects);
    const visibleProjects = [...projects].sort((left, right) => {
        if (left.id === INFINITE_CANVAS_SEED_ID) return -1;
        if (right.id === INFINITE_CANVAS_SEED_ID) return 1;
        return 0;
    });
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    useEffect(() => {
        let active = true;
        try {
            const savedViewMode = window.localStorage.getItem(CANVAS_HOME_VIEW_STORAGE_KEY);
            if (active && (savedViewMode === "grid" || savedViewMode === "list")) setViewMode(savedViewMode);
        } catch {}
        return () => { active = false; };
    }, []);

    const changeViewMode = (nextViewMode: CanvasHomeViewMode) => {
        setViewMode(nextViewMode);
        try {
            window.localStorage.setItem(CANVAS_HOME_VIEW_STORAGE_KEY, nextViewMode);
        } catch {}
    };

    const createAndEnter = () => {
        const id = createProject(getNextCanvasProjectTitle(projects));
        void navigate({ to: "/canvas/workspace", search: { id } });
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text());
            const importedProjectCount = await importValidatedCanvasArchive(zip, data, {
                writeMedia: async (storageKey, blob) => {
                    // Server-hosted media is re-uploaded so an imported canvas opens
                    // from any browser, not only the one that ran the import.
                    if (isServerMediaKey(storageKey)) {
                        const uploaded = await uploadMediaFile(blob, blob.type.startsWith("video/") ? "video" : blob.type.startsWith("audio/") ? "audio" : "image");
                        return uploaded.storageKey;
                    }
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
                        <p className="mt-2 max-w-2xl text-sm text-stone-500">点开带封面的画布即可查看故事导演、角色和分镜；新建画布从空白开始，模型在顶栏设置。</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
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
                            导入
                        </Button>
                        <Button
                            disabled={!hydrated || !projects.length}
                            icon={<Download className="size-4" />}
                            onClick={() => {
                                const picked = selectedIds.length ? projects.filter((project) => selectedIds.includes(project.id)) : projects;
                                void (async () => {
                                    const downloadProjects = await Promise.all(
                                        picked.map(async (project) =>
                                            project.detailLoaded === false
                                                ? (await useCanvasStore.getState().ensureProjectLoaded(project.id)) || project
                                                : project,
                                        ),
                                    );
                                    await exportCanvasProjects(downloadProjects, selectedIds.length ? `无限画布-${selectedIds.length}个项目` : "无限画布-全部项目");
                                })();
                            }}
                            title={selectedIds.length ? `导出选中的 ${selectedIds.length} 个画布` : "导出全部画布"}
                        >
                            导出
                        </Button>
                        {selectedIds.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                删除选中
                            </Button>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除全部
                            </Button>
                        ) : null}
                    </div>
                </header>

                <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                        <p className="text-xs tracking-wider text-stone-400">现在用的模型</p>
                        <Link to="/" className="text-xs text-emerald-700 hover:text-emerald-900">
                            去首页改模型
                        </Link>
                    </div>
                    <CanvasCurrentModels />
                </section>

                {hydrationStatus === "error" ? (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-stone-800" role="alert">
                        <h2 className="text-lg font-medium">画布库没能读出来</h2>
                        <p className="mt-2 max-w-xl text-sm text-stone-600">{hydrationError || "本机保存的项目数据损坏或被拦截。先重试；仍不行再清理缓存。"}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button type="primary" onClick={() => void retryHydration()}>重试读取</Button>
                            <Link to="/canvas-repair">
                                <Button>清理缓存</Button>
                            </Link>
                        </div>
                    </section>
                ) : !hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-sm text-stone-500">正在加载画布...</section>
                ) : projects.length ? (
                    <div className={viewMode === "list" ? "flex flex-col gap-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"} data-view-mode={viewMode}>
                        {visibleProjects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} viewMode={viewMode} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-white text-center">
                        <h2 className="text-xl font-medium text-stone-900">从一张空白画布开始</h2>
                        <p className="mt-3 max-w-md text-sm text-stone-500">节点、连线、故事导演、视频工作流都会保存在这台浏览器里。随时可导入导出压缩包。</p>
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

function CanvasCurrentModels() {
    const relays = useStudioSession((state) => state.relays);
    useCurrentModels((state) => state.text);
    useCurrentModels((state) => state.image);
    useCurrentModels((state) => state.video);
    const slots = [
        { label: "文本", value: preferredTextKey(), kind: "text" as const },
        { label: "生图", value: preferredImageKey(), kind: "image" as const },
        { label: "生视频", value: preferredVideoKey(), kind: "video" as const },
    ];
    return (
        <div className="grid gap-3 sm:grid-cols-3">
            {slots.map((slot) => {
                const card = findCatalog(slot.value, slot.kind, relays);
                const live = card ? liveCard(card) : undefined;
                return (
                    <WiringChip
                        key={slot.label}
                        label={slot.label}
                        value={live?.model || slot.value.split("::")[1] || "未选"}
                        hint={live ? `${live.provider}${live.wired ? " · 已接线" : " · 待接线"}` : "去首页选择"}
                    />
                );
            })}
        </div>
    );
}

function WiringChip({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left">
            <div className="text-[11px] uppercase tracking-wider text-stone-400">{label}</div>
            <div className="mt-1 truncate font-mono text-sm text-stone-900">{value || "未接线"}</div>
            <div className="mt-1 text-xs text-stone-500">{hint}</div>
        </div>
    );
}
