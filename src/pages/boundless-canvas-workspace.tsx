"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CanvasProviders } from "@/app/canvas/canvas-providers";
import { useCanvasStore } from "@/app/canvas/stores/use-canvas-store";
import { mediaPayloadFromWorkspaceSearch } from "@/studio/canvas/media-workspace-project";
import { pushMediaToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";
import { buildStoryDirectorEntryProject } from "@/studio/canvas/story-canvas-entry";

const CanvasPage = lazy(() =>
  import("@/app/canvas/workspace/canvas-client-page").catch((error) => {
    console.error("画布运行时加载异常:", error);
    return {
      default: () => (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-[#f4f2ed] text-stone-700">
          <p className="text-sm font-medium text-stone-600">画布组件载入遇到网络波动，点击重试：</p>
          <button
            type="button"
            className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-stone-800"
            onClick={() => window.location.reload()}
          >
            重新加载画布
          </button>
        </div>
      ),
    };
  }),
);

function CanvasBootIndicator() {
  return (
    <main className="canvas-workspace-board relative grid h-full min-h-[calc(100vh-64px)] w-full flex-1 place-items-center bg-[#f4f2ed] text-stone-800 selection:bg-stone-200">
      <div className="flex flex-col items-center gap-6">
        <div className="relative grid size-20 place-items-center">
          <div className="absolute inset-0 animate-ping rounded-3xl bg-stone-900/5 duration-1000" />
          <div className="absolute inset-1 rounded-2xl border border-stone-900/15 bg-white/60 shadow-xl backdrop-blur-md" />
          <div className="relative flex items-center gap-1.5">
            <span className="size-2 animate-bounce rounded-full bg-stone-900 [animation-delay:-0.3s]" />
            <span className="size-2 animate-bounce rounded-full bg-stone-700 [animation-delay:-0.15s]" />
            <span className="size-2 animate-bounce rounded-full bg-stone-400" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold tracking-tight text-stone-800" role="status" aria-live="polite">
            正在载入无界画布
          </h2>
          <p className="mt-1 text-xs text-stone-500">正在恢复画布拓扑、故事节点与生成素材…</p>
        </div>
      </div>
    </main>
  );
}

export function BoundlessCanvasWorkspace() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/canvas/workspace" });
  const { id, entry } = search;
  const hydrated = useCanvasStore((state) => state.hydrated);
  const targetDetailLoaded = useCanvasStore((state) =>
    id ? state.projects.find((item) => item.id === id)?.detailLoaded : undefined,
  );
  const storyEntryStarted = useRef(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem("boundless-canvas-retry");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setDetailError(null);
  }, [id]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      const store = useCanvasStore.getState();
      if (entry === "story" && !id) {
        if (storyEntryStarted.current) return;
        storyEntryStarted.current = true;
        const projectId = store.importProject(buildStoryDirectorEntryProject());
        void navigate({ to: "/canvas/workspace", search: { id: projectId } });
        return;
      }
      if (id && store.openProject(id)) {
        if (store.openProject(id)?.detailLoaded === false) {
          // The canvas must not mount on a list stub: its empty nodes would be
          // taken for a real empty graph and persisted over the server copy.
          try {
            const loaded = await store.ensureProjectLoaded(id);
            if (cancelled) return;
            if (!loaded || loaded.detailLoaded === false) {
              setDetailError("画布内容还没读取完成，请重试。已保留服务器上的画布，未写入空画布。");
            }
          } catch (error) {
            if (cancelled) return;
            setDetailError(
              `${error instanceof Error ? error.message : "读取画布内容失败"}。已保留服务器上的画布，未写入空画布。`,
            );
          }
        }
        return;
      }
      const mediaPayload = id ? mediaPayloadFromWorkspaceSearch({ ...search, id }) : null;
      if (id && mediaPayload) {
        const rebuilt = pushMediaToCanvasWorkspace({
          ...mediaPayload,
          id,
          title: mediaPayload.title || mediaPayload.prompt,
        });
        if (rebuilt.id !== id) {
          void navigate({ to: "/canvas/workspace", search: { ...search, id: rebuilt.id } });
        }
        return;
      }
      const bannedSeed = /清凉写真|qingliang|nwsf/i;
      const fallback =
        store.projects.find((item) => item.title === "无限画布 1") ||
        store.projects.find((item) => item.title.includes("无限画布")) ||
        store.projects.find((item) => !bannedSeed.test(item.title || "") && !bannedSeed.test(item.id || "")) ||
        store.projects[0];
      if (fallback) {
        if (!id || id !== fallback.id) {
          void navigate({ to: "/canvas/workspace", search: { id: fallback.id } });
        }
        return;
      }
      if (!id) void navigate({ to: "/canvas/home" });
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, hydrated, id, navigate, search]);

  // Mounting on a stub (detailLoaded === false) lets the canvas adopt its empty
  // nodes and persist them back, wiping the server graph. Wait for the detail.
  const awaitingDetail = Boolean(id) && targetDetailLoaded === false && !detailError;

  return (
    <CanvasProviders>
      <div className="canvas-workspace-shell relative flex h-full min-h-[calc(100vh-64px)] flex-1 flex-col">
        {detailError ? (
          <CanvasDetailErrorShell message={detailError} onRetry={() => window.location.reload()} />
        ) : awaitingDetail ? (
          <CanvasBootIndicator />
        ) : (
          <Suspense fallback={<CanvasBootIndicator />}>
            <div className="absolute inset-0">
              <CanvasPage />
            </div>
          </Suspense>
        )}
      </div>
    </CanvasProviders>
  );
}

function CanvasDetailErrorShell({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="canvas-workspace-board relative grid h-full min-h-[calc(100vh-64px)] w-full flex-1 place-items-center bg-[#f4f2ed] px-6 text-stone-800">
      <section className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-sm" role="alert">
        <h2 className="text-base font-semibold tracking-tight text-stone-800">无法读取画布内容</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">{message}</p>
        <button
          type="button"
          className="mt-5 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          onClick={onRetry}
        >
          重试读取画布
        </button>
      </section>
    </main>
  );
}

export default BoundlessCanvasWorkspace;
