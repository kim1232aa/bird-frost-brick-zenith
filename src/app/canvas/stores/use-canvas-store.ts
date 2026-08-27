import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { getStrictLocalForageItem, localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { getCachedAuthStorageScope, normalizeStorageScope, scopedStorageKey } from "@/lib/user-storage-scope";
import { collectImageStorageKeys, setStoredImagesRetained } from "@/services/image-storage";
import { mergeSyncTombstones, type SyncTombstone } from "@/services/sync-record-merge";
import { hydrateGalleryMedia } from "@/studio/canvas/hydrate-gallery-media";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";
import { getCanvasMergeScopes, mergeCanvasProjectsByScope, type CanvasMergeProject } from "./canvas-project-merge";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
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
    projects: CanvasProject[];
    syncDeleted: SyncTombstone[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], syncDeleted?: SyncTombstone[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
    retryHydration: () => Promise<void>;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects" | "syncDeleted">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let queuedPersistValue: StorageValue<CanvasStore> | null = null;
let canvasPersistenceWrite = Promise.resolve();
let canvasStorageScope = getCachedAuthStorageScope();
let canvasPersistenceUnlocked = false;
let pendingUnlockedProjects: CanvasProject[] = [];

function getCanvasStorageKeys(name: string, scope = canvasStorageScope) {
    return getCanvasMergeScopes(scope).map((scope) => ({
        scope,
        storageKey: scopedStorageKey(name, scope),
    }));
}

function getCurrentCanvasStorageKey(name: string, scope = canvasStorageScope) {
    return scopedStorageKey(name, scope);
}

function getPersistedProjects(parsed: StorageValue<CanvasStore>) {
    return Array.isArray(parsed.state?.projects) ? parsed.state.projects : [];
}

function getPersistedSyncDeleted(parsed: StorageValue<CanvasStore>) {
    return Array.isArray(parsed.state?.syncDeleted) ? parsed.state.syncDeleted : [];
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const readScope = canvasStorageScope;
        const storageKeys = getCanvasStorageKeys(name, readScope);
        const scopedValues = await Promise.all(
            storageKeys.map(async ({ scope, storageKey }) => {
                const value = await getStrictLocalForageItem(storageKey);
                if (!value) return { scope, storageKey, value: null, parsed: null };
                try {
                    return {
                        scope,
                        storageKey,
                        value,
                        parsed: JSON.parse(value) as StorageValue<CanvasStore>,
                    };
                } catch {
                    throw new Error("保存的画布数据格式无效，已保留原始数据");
                }
            }),
        );
        if (readScope !== canvasStorageScope) return null;
        const parsedScopes = scopedValues.filter((entry): entry is { scope: string; storageKey: string; value: string; parsed: StorageValue<CanvasStore> } => Boolean(entry.parsed));
        if (!parsedScopes.length) return null;

        const primary = parsedScopes.find((entry) => entry.scope === readScope) || parsedScopes[0];
        const parsed = primary.parsed;
        const merged = mergeCanvasProjectsByScope(
            parsedScopes.map((entry) => ({
                scope: entry.scope,
                projects: getPersistedProjects(entry.parsed) as unknown as CanvasMergeProject[],
            })),
        );
        parsed.state = {
            ...parsed.state,
            projects: merged.projects as CanvasProject[],
            syncDeleted: mergeSyncTombstones(...parsedScopes.map((entry) => getPersistedSyncDeleted(entry.parsed))),
        };
        const primaryValue = JSON.stringify({
            ...primary.parsed,
            state: {
                ...primary.parsed.state,
                projects: merged.projects as CanvasProject[],
                syncDeleted: mergeSyncTombstones(...parsedScopes.map((entry) => getPersistedSyncDeleted(entry.parsed))),
            },
        });
        if (primary.value !== primaryValue) {
            void enqueueCanvasPersistenceWrite(async () => {
                await localForageStorage.setItem(primary.storageKey, primaryValue);
            });
        }
        const referencedImageKeys = collectImageStorageKeys(parsed.state.projects);
        await setStoredImagesRetained(referencedImageKeys, true).catch(() => undefined);
        if (readScope !== canvasStorageScope) return null;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        if (!canvasPersistenceUnlocked) return;
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects && queuedPersistState.syncDeleted === nextState.syncDeleted) return;
        queuedPersistState = nextState;
        queuedPersistValue = value;
        const storageKey = getCurrentCanvasStorageKey(name);
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void writeCanvasPersistence(value, storageKey).catch(() => undefined);
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(getCurrentCanvasStorageKey(name)),
};

async function writeCanvasPersistence(
    value: StorageValue<CanvasStore>,
    storageKey: string,
) {
    const serialized = JSON.stringify(value);
    return enqueueCanvasPersistenceWrite(async () => {
        await localForageStorage.setItem(storageKey, serialized);
        if (queuedPersistValue === value) queuedPersistValue = null;
    });
}

function enqueueCanvasPersistenceWrite(write: () => Promise<void>) {
    const queued = canvasPersistenceWrite.then(write);
    canvasPersistenceWrite = queued.catch(() => undefined);
    return queued;
}

export async function flushCanvasPersistence() {
    if (!canvasPersistenceUnlocked) throw new Error("画布尚未完成读取，不能覆盖持久化数据");
    const value = queuedPersistValue;
    if (!value) return;
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    await writeCanvasPersistence(value, getCurrentCanvasStorageKey(CANVAS_STORE_KEY));
}

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            hydrationStatus: "loading",
            hydrationError: null,
            projects: [],
            syncDeleted: [],
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                if (!canvasPersistenceUnlocked) pendingUnlockedProjects = [project, ...pendingUnlockedProjects];
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
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                if (!canvasPersistenceUnlocked) pendingUnlockedProjects = [project, ...pendingUnlockedProjects];
                return project.id;
            },
            openProject: (id) => get().projects.find((item) => item.id === id) || null,
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const deletedAt = new Date().toISOString();
                    const deleted = state.projects.filter((project) => ids.includes(project.id)).map((project) => ({ id: project.id, deletedAt }));
                    const projects = state.projects.filter((project) => !ids.includes(project.id));
                    return { projects, syncDeleted: mergeSyncTombstones(state.syncDeleted, deleted) };
                }),
            replaceProjects: (projects, syncDeleted) => set((state) => ({ projects, syncDeleted: syncDeleted ?? state.syncDeleted })),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== id) return project;
                        if (
                            Array.isArray(patch.nodes) &&
                            patch.nodes.length === 0 &&
                            (project.nodes?.length || 0) > 0
                        ) {
                            const { nodes: _ignored, ...rest } = patch;
                            return { ...project, ...rest, updatedAt: new Date().toISOString() };
                        }
                        return { ...project, ...patch, updatedAt: new Date().toISOString() };
                    }),
                })),
            retryHydration: async () => {
                clearCanvasRehydrateRetry();
                canvasAutoRehydrateAttempts = 0;
                canvasPersistenceUnlocked = false;
                useCanvasStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null });
                await useCanvasStore.persist.rehydrate();
            },
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                    syncDeleted: state.syncDeleted,
                }) as StorageValue<CanvasStore>["state"],
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
                const state = useCanvasStore.getState();
                const extras = pendingUnlockedProjects.filter(
                    (project) => !state.projects.some((item) => item.id === project.id),
                );
                pendingUnlockedProjects = [];
                useCanvasStore.setState({
                    hydrated: true,
                    hydrationStatus: "ready",
                    hydrationError: null,
                    projects: extras.length ? [...extras, ...state.projects] : [...state.projects],
                });
                void importLatestStorySeed();
            },
        },
    ),
);

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
    return error instanceof Error && error.message.trim() ? `读取本地画布失败：${error.message}` : "读取本地画布失败";
}

function clearCanvasRehydrateRetry() {
    if (typeof window === "undefined" || canvasRehydrateTimer === null) return;
    window.clearTimeout(canvasRehydrateTimer);
    canvasRehydrateTimer = null;
}

export function setCanvasStorageScope(scopeId?: string | null) {
    const nextScope = normalizeStorageScope(scopeId);
    if (nextScope === canvasStorageScope) return;
    canvasStorageScope = nextScope;
    queuedPersistState = null;
    queuedPersistValue = null;
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    clearCanvasRehydrateRetry();
    canvasAutoRehydrateAttempts = 0;
    canvasPersistenceUnlocked = false;
    useCanvasStore.setState({ hydrated: false, hydrationStatus: "loading", hydrationError: null, projects: [], syncDeleted: [] });
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

function nodeHasMedia(node: CanvasNodeData) {
    return Boolean(node.metadata?.content || node.metadata?.backendUrl);
}

function isLiveFrontendMedia(node: CanvasNodeData) {
    const url = String(node.metadata?.content || node.metadata?.backendUrl || "");
    return url.includes("imgen.x.ai") || url.startsWith("blob:") || url.startsWith("data:");
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
        const title = String(project.title || "").trim();
        const id = String(project.id || "").trim();
        const existing = current.projects.find((item) => (id && item.id === id) || (title && item.title === title));
        const hydratedNodes = await hydrateGalleryMedia(project.nodes);
        if (existing) {
            const existingHasMedia = (existing.nodes || []).some(nodeHasMedia);
            const existingLive = (existing.nodes || []).some(isLiveFrontendMedia);
            if (existingLive && existingHasMedia) return;
            const existingBroken = !existingHasMedia || (existing.nodes || []).length === 0;
            if (!existingBroken && existingHasMedia && (existing.nodes || []).length >= hydratedNodes.length) return;
            current.updateProject(existing.id, {
                nodes: hydratedNodes,
                connections: project.connections || existing.connections || [],
                viewport: project.viewport || existing.viewport,
            });
            if (title && existing.title !== title) current.renameProject(existing.id, title);
            return;
        }
        current.importProject({ ...project, nodes: hydratedNodes });
    } catch {
        /* seed is optional until a live run writes it */
    }
}
