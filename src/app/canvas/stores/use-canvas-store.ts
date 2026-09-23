import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { hydrateGalleryMedia } from "@/studio/canvas/hydrate-gallery-media";
import { deleteServerCanvases, getServerCanvas, listServerCanvases, saveServerCanvas } from "@/studio/server/canvases";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    /** Present only after the workspace loads this canvas. List rows omit the graph. */
    detailLoaded?: boolean;
    nodeCount?: number;
    connectionCount?: number;
    cover?: { storageKey?: string; content?: string } | null;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasStore = {
    hydrated: boolean;
    hydrationStatus: "loading" | "ready" | "error";
    hydrationError: string | null;
    serverPersistError: string | null;
    projects: CanvasProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    /** Loads one canvas graph from the server. No-op when the graph is already in memory. */
    ensureProjectLoaded: (id: string) => Promise<CanvasProject | null>;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
    retryHydration: () => Promise<void>;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let canvasPersistenceWrite = Promise.resolve();
let canvasStorageScope = "";
let canvasPersistenceUnlocked = false;
const pendingCanvasProjects = new Map<string, CanvasProject>();
const pendingCanvasDeletes = new Set<Promise<void>>();
const inflightCanvasLoads = new Map<string, Promise<CanvasProject | null>>();

function listItemToProject(item: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodeCount: number;
    connectionCount: number;
    cover: { storageKey?: string; content?: string } | null;
}): CanvasProject {
    return {
        id: item.id,
        title: item.title || "未命名画布",
        createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
        detailLoaded: false,
        nodeCount: item.nodeCount,
        connectionCount: item.connectionCount,
        cover: item.cover,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: initialViewport,
    };
}

function projectGraphLoaded(project: CanvasProject | undefined) {
    return Boolean(project && project.detailLoaded !== false);
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async () => {
        if (typeof window === "undefined") return null;
        const listed = await listServerCanvases();
        const projects = (listed || []).map(listItemToProject);
        return { state: { projects } as any, version: 0 };
    },
    setItem: (_name, value) => {
        if (typeof window === "undefined" || !canvasPersistenceUnlocked) return;
        const state = value.state as PersistedCanvasState;
        for (const project of Array.isArray(state.projects) ? state.projects : []) {
            // A list stub has no graph. Writing it back would wipe the server copy.
            if (!projectGraphLoaded(project)) continue;
            pendingCanvasProjects.set(project.id, project);
        }
        scheduleCanvasPersistence();
    },
    removeItem: async () => undefined,
};

function scheduleCanvasPersistence() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        void flushCanvasPersistence().catch(recordServerPersistError);
    }, 400);
}

function queueCanvasDelete(ids: string[]) {
    if (!ids.length) return;
    const operation = deleteServerCanvases({ data: { ids } }).then((result) => {
        if (result && result.ok === false) throw new Error(result.error || "服务端画布删除失败");
    });
    pendingCanvasDeletes.add(operation);
    void operation.catch(recordServerPersistError).finally(() => pendingCanvasDeletes.delete(operation));
}

export async function flushCanvasPersistence() {
    if (!canvasPersistenceUnlocked) throw new Error("画布尚未完成服务器读取，不能覆盖服务器数据");
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    const projects = Array.from(pendingCanvasProjects.values());
    pendingCanvasProjects.clear();
    const deletes = Array.from(pendingCanvasDeletes);
    if (projects.length || deletes.length) {
        const write = canvasPersistenceWrite.then(async () => {
            const failures: string[] = [];
            await Promise.all(projects.map(async (project) => {
                try {
                    const result = await saveServerCanvas({ data: project as any });
                    if (result && result.ok === false) throw new Error(result.error || "服务端画布保存失败");
                } catch (error) {
                    // Re-queue the unsaved project: dropping it here would let the
                    // next flush report success while the server never got it.
                    if (!pendingCanvasProjects.has(project.id)) pendingCanvasProjects.set(project.id, project);
                    failures.push(error instanceof Error ? error.message : String(error));
                }
            }));
            await Promise.all(deletes);
            if (failures.length) throw new Error(`服务端画布保存失败：${failures.join("；")}`);
        });
        canvasPersistenceWrite = write.catch(() => undefined);
        await write;
    }
    await canvasPersistenceWrite;
}

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            hydrationStatus: "loading",
            hydrationError: null,
            serverPersistError: null,
            projects: [],
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    detailLoaded: true,
                    nodeCount: 0,
                    connectionCount: 0,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const requested = typeof source.id === "string" ? source.id.trim() : "";
                const id = requested && !get().projects.some((item) => item.id === requested) ? requested : nanoid();
                const project: CanvasProject = {
                    id,
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    detailLoaded: true,
                    nodeCount: source.nodes?.length || source.nodeCount || 0,
                    connectionCount: source.connections?.length || source.connectionCount || 0,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => get().projects.find((item) => item.id === id) || null,
            ensureProjectLoaded: (id) => {
                const existing = get().projects.find((item) => item.id === id);
                if (!existing) return Promise.resolve(null);
                if (projectGraphLoaded(existing)) return Promise.resolve(existing);
                const inflight = inflightCanvasLoads.get(id);
                if (inflight) return inflight;
                const load = getServerCanvas({ data: id })
                    .then((loaded) => {
                        if (!loaded?.id) return get().projects.find((item) => item.id === id) || null;
                        const next: CanvasProject = {
                            ...(loaded as CanvasProject),
                            detailLoaded: true,
                            nodeCount: Array.isArray(loaded.nodes) ? loaded.nodes.length : 0,
                            connectionCount: Array.isArray(loaded.connections) ? loaded.connections.length : 0,
                        };
                        set((state) => ({
                            projects: state.projects.map((item) => (item.id === id ? next : item)),
                        }));
                        return next;
                    })
                    .finally(() => {
                        inflightCanvasLoads.delete(id);
                    });
                inflightCanvasLoads.set(id, load);
                return load;
            },
            renameProject: (id, title) => {
                const current = get().projects.find((project) => project.id === id);
                if (current && !projectGraphLoaded(current)) {
                    void get().ensureProjectLoaded(id).then((loaded) => {
                        if (!loaded) return;
                        get().renameProject(id, title);
                    });
                    return;
                }
                set((state) => ({
                    projects: state.projects.map((project) =>
                        project.id === id
                            ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() }
                            : project,
                    ),
                }));
            },
            deleteProjects: (ids) => {
                const uniqueIds = [...new Set(ids.filter(Boolean))];
                queueCanvasDelete(uniqueIds);
                set((state) => ({ projects: state.projects.filter((project) => !uniqueIds.includes(project.id)) }));
            },
            replaceProjects: (projects) => set({ projects }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== id) return project;
                        // A list stub holds no graph yet. Accepting a patch here would
                        // mark it loaded and let its empty nodes reach the server.
                        // Callers must await ensureProjectLoaded first.
                        if (!projectGraphLoaded(project)) return project;
                        if (
                            Array.isArray(patch.nodes) &&
                            patch.nodes.length === 0 &&
                            (project.nodes?.length || 0) > 0 &&
                            !Array.isArray(patch.connections)
                        ) {
                            const { nodes: _ignored, ...rest } = patch;
                            return { ...project, ...rest, updatedAt: new Date().toISOString() };
                        }
                        const next = { ...project, ...patch, detailLoaded: true, updatedAt: new Date().toISOString() };
                        if (Array.isArray(patch.nodes)) next.nodeCount = patch.nodes.length;
                        if (Array.isArray(patch.connections)) next.connectionCount = patch.connections.length;
                        return next;
                    }),
                })),
            retryHydration: async () => {
                clearCanvasRehydrateRetry();
                canvasAutoRehydrateAttempts = 0;
                canvasPersistenceUnlocked = false;
                pendingCanvasProjects.clear();
                useCanvasStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null, serverPersistError: null, projects: [] });
                await useCanvasStore.persist.rehydrate();
            },
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) => ({ projects: state.projects }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => (_state, error) => {
                if (error) {
                    canvasPersistenceUnlocked = false;
                    useCanvasStore.setState({
                        hydrated: false,
                        hydrationStatus: "error",
                        hydrationError: canvasHydrationErrorMessage(error),
                    });
                    scheduleCanvasRehydrate();
                    return;
                }
                clearCanvasRehydrateRetry();
                canvasAutoRehydrateAttempts = 0;
                canvasPersistenceUnlocked = true;
                useCanvasStore.setState({
                    hydrated: true,
                    hydrationStatus: "ready",
                    hydrationError: null,
                    serverPersistError: null,
                });
            },
        },
    ),
);

function recordServerPersistError(err: unknown) {
    console.error("服务端画布持久化失败:", err);
    const message = err instanceof Error && err.message.trim() ? err.message : "服务端画布持久化失败";
    useCanvasStore.setState({ serverPersistError: message });
}

let canvasRehydrateTimer: number | null = null;
let canvasAutoRehydrateAttempts = 0;
const CANVAS_AUTO_REHYDRATE_LIMIT = 3;

function scheduleCanvasRehydrate() {
    if (typeof window === "undefined" || canvasRehydrateTimer !== null || canvasAutoRehydrateAttempts >= CANVAS_AUTO_REHYDRATE_LIMIT) return;
    canvasAutoRehydrateAttempts += 1;
    canvasRehydrateTimer = window.setTimeout(() => {
        canvasRehydrateTimer = null;
        void useCanvasStore.persist.rehydrate();
    }, 1_000);
}

function canvasHydrationErrorMessage(error: unknown) {
    return error instanceof Error && error.message.trim() ? `读取服务器画布失败：${error.message}` : "读取服务器画布失败";
}

function clearCanvasRehydrateRetry() {
    if (typeof window === "undefined" || canvasRehydrateTimer === null) return;
    window.clearTimeout(canvasRehydrateTimer);
    canvasRehydrateTimer = null;
}

export function setCanvasStorageScope(scopeId?: string | null) {
    const nextScope = String(scopeId || "").trim();
    if (nextScope === canvasStorageScope) return;
    canvasStorageScope = nextScope;
    pendingCanvasProjects.clear();
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    clearCanvasRehydrateRetry();
    canvasAutoRehydrateAttempts = 0;
    canvasPersistenceUnlocked = false;
    useCanvasStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null, serverPersistError: null, projects: [] });
    void useCanvasStore.persist.rehydrate();
}

if (typeof window !== "undefined") {
    window.setTimeout(() => {
        const current = useCanvasStore.getState();
        if (current.hydrated || current.hydrationStatus === "error" || canvasPersistenceUnlocked) return;
        void useCanvasStore.persist.rehydrate();
    }, 4_000);
}

const LATEST_STORY_SEED_URL = "/recovery/latest-story-canvas.json";
export const INFINITE_CANVAS_SEED_ID = "infinite-canvas-1";
export const INFINITE_CANVAS_SEED_TITLE = "无限画布 1";

function mediaUrl(node: CanvasNodeData) {
    return String(node.metadata?.content || node.metadata?.backendUrl || "").trim();
}

/** Survives reload. blob:/data:/expired CDN URLs must not block the seed. */
function hasDurableFrontendMedia(node: CanvasNodeData) {
    if (String(node.metadata?.storageKey || "").trim()) return true;
    const url = mediaUrl(node);
    return url.startsWith("/gallery/");
}

function isIncompleteSeedGraph(project: CanvasProject, seedNodeCount: number, seedConnectionCount: number) {
    // List rows have no graph. Treat a non-empty saved canvas as complete so the
    // recovery seed cannot replace it before the workspace loads the real nodes.
    if (project.detailLoaded === false) return (project.nodeCount || 0) < 2;
    const nodes = project.nodes || [];
    const connections = project.connections || [];
    const hasDirector = nodes.some((node) => node.type === "story_director");
    // A live director means the user already owns this canvas. Never clobber it
    // with /recovery/latest-story-canvas.json just because imageCount < 2.
    if (hasDirector) return false;
    const imageCount = nodes.filter((node) => node.type === "image").length;
    return (
        imageCount < 2 ||
        nodes.length < Math.min(seedNodeCount, 8) ||
        connections.length < Math.min(seedConnectionCount, 8) ||
        !nodes.some(hasDurableFrontendMedia)
    );
}

export async function importLatestStorySeed() {
    if (typeof window === "undefined" || !canvasPersistenceUnlocked) return;
    try {
        const response = await fetch(`${LATEST_STORY_SEED_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { project?: Partial<CanvasProject> };
        const project = payload?.project;
        if (!project || !Array.isArray(project.nodes) || project.nodes.length === 0) return;
        const current = useCanvasStore.getState();
        const title = String(project.title || INFINITE_CANVAS_SEED_TITLE).trim() || INFINITE_CANVAS_SEED_TITLE;
        const id = String(project.id || INFINITE_CANVAS_SEED_ID).trim() || INFINITE_CANVAS_SEED_ID;
        if (/清凉写真|qingliang|nwsf/i.test(title) || /清凉写真|qingliang|nwsf/i.test(id)) {
            return;
        }
        const seedLooksBanned = (project.nodes || []).some((node) => {
            const meta = node.metadata || {};
            return /清凉写真NWSF|qingliang|nwsf/i.test(
                `${node.title || ""} ${meta.storyText || ""} ${meta.content || ""} ${meta.storyStyle || ""}`,
            );
        });
        if (seedLooksBanned) return;
        const hydratedNodes = await hydrateGalleryMedia(project.nodes);
        const seedConnections = Array.isArray(project.connections) ? project.connections : [];
        const existingById = current.projects.find((item) => item.id === id);
        if (existingById && !isIncompleteSeedGraph(existingById, hydratedNodes.length, seedConnections.length)) {
            if (title && existingById.title !== title) current.renameProject(existingById.id, title);
            return;
        }
        const nextProject: CanvasProject = {
            id,
            title,
            createdAt: existingById?.createdAt || project.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            detailLoaded: true,
            nodeCount: hydratedNodes.length,
            connectionCount: seedConnections.length,
            nodes: hydratedNodes,
            connections: seedConnections,
            chatSessions: existingById?.chatSessions || project.chatSessions || [],
            activeChatId: existingById?.activeChatId || project.activeChatId || null,
            backgroundMode: project.backgroundMode || existingById?.backgroundMode || "lines",
            showImageInfo: project.showImageInfo ?? existingById?.showImageInfo ?? false,
            viewport: project.viewport || existingById?.viewport || { x: 0, y: 0, k: 1 },
        };
        const withoutCanonicalAndEmptyTwin = current.projects.filter((item) => {
            if (item.id === id) return false;
            const emptyTwin = item.title === title && (!item.nodes || item.nodes.length === 0);
            return !emptyTwin;
        });
        current.replaceProjects([nextProject, ...withoutCanonicalAndEmptyTwin]);
    } catch {
        /* seed is optional until a live run writes it */
    }
}
