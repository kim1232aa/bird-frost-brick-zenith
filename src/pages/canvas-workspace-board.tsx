"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { importLatestStorySeed, useCanvasStore } from "@/app/canvas/stores/use-canvas-store";
import type { CanvasNodeData } from "@/app/canvas/types";

function mediaUrl(node: CanvasNodeData) {
  const raw = String(node.metadata?.backendUrl || node.metadata?.content || "").trim();
  return raw;
}

function isImageNode(node: CanvasNodeData) {
  return node.type === "image" && Boolean(mediaUrl(node));
}

function isVideoNode(node: CanvasNodeData) {
  return node.type === "video" && Boolean(mediaUrl(node));
}

export function CanvasWorkspaceBoard() {
  const navigate = useNavigate();
  const { id } = useSearch({ from: "/canvas/workspace" });
  const hydrated = useCanvasStore((state) => state.hydrated);
  const hydrationStatus = useCanvasStore((state) => state.hydrationStatus);
  const projects = useCanvasStore((state) => state.projects);
  const [seedTried, setSeedTried] = useState(false);

  const project = useMemo(() => {
    if (!id) return projects[0] || null;
    return projects.find((item) => item.id === id) || projects.find((item) => item.title.includes("清凉写真")) || null;
  }, [id, projects]);

  useEffect(() => {
    if (!hydrated || seedTried) return;
    let cancelled = false;
    void (async () => {
      await importLatestStorySeed();
      if (!cancelled) setSeedTried(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, seedTried]);

  useEffect(() => {
    if (!hydrated || !seedTried) return;
    if (id && !project && projects.length) {
      void navigate({ to: "/canvas/workspace", search: { id: projects[0].id } });
    }
  }, [hydrated, seedTried, id, project, projects, navigate]);

  if (!hydrated || hydrationStatus === "loading") {
    return (
      <main className="grid min-h-[calc(100vh-64px)] place-items-center bg-[#f4f2ed] text-stone-600">
        <p className="text-sm">正在读取本机画布…</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="grid min-h-[calc(100vh-64px)] place-items-center bg-[#f4f2ed] px-6 text-center text-stone-700">
        <div>
          <h1 className="text-xl font-semibold">还没有可打开的画布</h1>
          <p className="mt-2 text-sm text-stone-500">先回画布库，或去故事导演用「清凉写真NWSF」跑一遍再推过来。</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link to="/canvas/home" className="rounded-md bg-[#0F172A] px-4 py-2 text-sm text-white">
              返回画布库
            </Link>
            <Link to="/story" className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm">
              打开故事导演
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const images = project.nodes.filter(isImageNode);
  const videos = project.nodes.filter(isVideoNode);
  const director = project.nodes.find((node) => node.type === "story_director");
  const shots = Array.isArray(director?.metadata?.storyShots) ? director.metadata.storyShots : [];

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#f4f2ed] text-stone-900">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#f4f2ed]/95 px-5 py-3 backdrop-blur">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-emerald-600">BOUNDLESS CANVAS</p>
          <h1 className="text-lg font-semibold">{project.title}</h1>
          <p className="text-xs text-stone-500">
            {images.length} 张图 · {videos.length} 段视频 · {shots.length || images.length} 镜
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/canvas/home" className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm">
            画布库
          </Link>
          <Link to="/story" className="rounded-md bg-[#00C758] px-3 py-1.5 text-sm font-medium text-white">
            故事导演重跑
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs tracking-wider text-stone-400">故事导演</p>
          <h2 className="mt-1 text-base font-semibold">{String(director?.metadata?.storyText || "清凉写真NWSF")}</h2>
          <p className="mt-2 text-sm text-stone-500">
            风格 {String(director?.metadata?.storyStyle || "清凉写真")} · 模型能力按 5 张静帧出视频
          </p>
          <ol className="mt-4 space-y-2 text-sm">
            {(shots.length ? shots : images.map((node) => ({ title: node.title, id: node.id }))).map((shot: { title?: string; id?: string }, index: number) => (
              <li key={String(shot.id || index)} className="rounded-lg bg-stone-50 px-3 py-2">
                {index + 1}. {shot.title || `第${index + 1}镜`}
              </li>
            ))}
          </ol>
        </aside>

        <div className="space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600">分镜静帧（{images.length}）</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {images.map((node) => (
                <article key={node.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                  <img src={mediaUrl(node)} alt={node.title} className="aspect-video w-full object-cover" />
                  <div className="px-3 py-2 text-sm font-medium">{node.title}</div>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600">图片生成视频（{videos.length}）</h3>
            {videos.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {videos.map((node) => (
                  <article key={node.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <video src={mediaUrl(node)} controls className="aspect-video w-full bg-black" />
                    <div className="px-3 py-2 text-sm font-medium">{node.title}</div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-sm text-stone-500">
                还没有视频。去故事导演点「一键全流程」，会用最多 5 张分镜静帧生成视频。
              </p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

export default CanvasWorkspaceBoard;
