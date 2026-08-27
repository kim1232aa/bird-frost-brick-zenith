"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { importLatestStorySeed, useCanvasStore } from "@/app/canvas/stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/app/canvas/types";
import { preferredImageKey, preferredTextKey, preferredVideoKey } from "@/studio/model-select";
import { useStudioSession } from "@/studio/session";
import { splitModel } from "@/studio/split";
import { pushStoryToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";
import { characterLock, draftPlan } from "@/studio/story/plan";
import {
  shotImageRefs,
  stillSizeForQuality,
  storyStillUrls,
  videoStillBundle,
} from "@/studio/story/director-helpers";

function mediaUrl(node: CanvasNodeData) {
  return String(node.metadata?.backendUrl || node.metadata?.content || "").trim();
}

export function CanvasWorkspaceLite() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") || "";
  const hydrated = useCanvasStore((state) => state.hydrated);
  const project = useCanvasStore((state) =>
    state.projects.find((item) => item.id === projectId),
  );
  const relays = useStudioSession((state) => state.relays);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!project) void importLatestStorySeed();
  }, [hydrated, project]);

  const director = useMemo(
    () => project?.nodes.find((node) => node.type === CanvasNodeType.StoryDirector),
    [project],
  );
  const images = useMemo(
    () => (project?.nodes || []).filter((node) => node.type === CanvasNodeType.Image && mediaUrl(node)),
    [project],
  );
  const videos = useMemo(
    () => (project?.nodes || []).filter((node) => node.type === CanvasNodeType.Video && mediaUrl(node)),
    [project],
  );
  const storyText = String(director?.metadata?.storyText || director?.metadata?.content || "清凉写真NWSF");
  const style = String(director?.metadata?.storyStyle || "清凉写真");
  const shotCount = Number(director?.metadata?.storyShotCount || 5);
  const ratio = String(director?.metadata?.storyAspectRatio || "16:9");

  const runAll = async () => {
    setBusy("一键：拆分镜 → 角色图 → 5 张分镜 → 视频");
    setError("");
    const textModel = preferredTextKey();
    const imageKey = preferredImageKey();
    const videoKey = preferredVideoKey();
    const imageSel = splitModel(imageKey);
    const videoSel = splitModel(videoKey);
    const idea = storyText.trim() || "清凉写真NWSF";
    const local = draftPlan(idea, style, shotCount);
    let plan = local;
    try {
      const { planStory } = await import("@/studio/story/plan");
      try {
        plan = await planStory({ relays, idea, textModel, style, shotCount });
      } catch (analyzeErr) {
        setError(analyzeErr instanceof Error ? `分析失败，改用本地分镜：${analyzeErr.message}` : "分析失败，改用本地分镜");
      }
      const { generateStudioImage } = await import("@/studio/generate/image");
      for (let i = 0; i < plan.cast.length; i += 1) {
        const person = plan.cast[i];
        if (person.url) continue;
        setBusy(`正在出 ${person.name} 的角色图…`);
        const result = await generateStudioImage({
          relays,
          providerId: imageSel.providerId,
          model: imageSel.model,
          prompt: `character bible portrait, locked identity, studio, adult 24+, ${person.look}, name ${person.name}, ${style}`,
          size: "1024x1024",
        });
        plan.cast[i] = { ...person, url: result.url, status: "ready" };
      }
      for (let i = 0; i < plan.shots.length; i += 1) {
        const shot = plan.shots[i];
        if (shot.url) continue;
        setBusy(`正在生成第 ${i + 1} 镜…`);
        const refs = shotImageRefs(plan.cast, plan.shots, i);
        const result = await generateStudioImage({
          relays,
          providerId: imageSel.providerId,
          model: imageSel.model,
          prompt: `${shot.prompt}. Camera: ${shot.camera}. Style: ${style}. Character lock: ${characterLock(plan.cast)}. Adult 24+ fashion photoshoot still, photorealistic.`,
          imageUrl: refs[0],
          imageUrls: refs,
          size: stillSizeForQuality("2K", ratio),
        });
        plan.shots[i] = { ...shot, url: result.url, status: "done", error: "" };
      }
      const stills = storyStillUrls(plan.shots);
      if (stills.length < 2) throw new Error("视频需要至少 2 张分镜静帧。Grok Imagine 可吃最多 5 张，不能只用一张。");
      setBusy(`正在用 ${stills.length} 张分镜静帧生成视频…`);
      const { createStudioVideo, waitStudioVideo } = await import("@/studio/generate/video");
      const bundle = videoStillBundle(plan.shots, 0);
      const created = await createStudioVideo({
        relays,
        prompt: `${plan.shots[0]?.prompt || idea}. Continuity across ${bundle.all.length} storyboard stills, adult 24+ fashion photoshoot.`,
        imageUrl: bundle.first,
        lastFrameUrl: bundle.last,
        imageUrls: bundle.all,
        duration: plan.shots[0]?.duration || 5,
        aspectRatio: ratio,
        providerId: videoSel.providerId,
        model: videoSel.model,
        generateAudio: true,
      });
      const url = await waitStudioVideo({
        relays,
        providerId: created.providerId,
        taskId: created.id,
        model: created.model,
      });
      plan.shots[0] = { ...plan.shots[0], videoUrl: url, status: "video" };
      const id = pushStoryToCanvasWorkspace({
        text: idea,
        style,
        shotCount,
        aspectRatio: ratio,
        logline: plan.logline,
        scenes: plan.scenes,
        cast: plan.cast,
        shots: plan.shots,
      });
      router.push(`/canvas/workspace?id=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  if (!hydrated) {
    return (
      <main className="canvas-workspace-board grid min-h-[calc(100vh-64px)] place-items-center bg-[#f4f2ed] text-stone-600">
        正在读取画布…
      </main>
    );
  }

  if (!project) {
    return (
      <main className="canvas-workspace-board grid min-h-[calc(100vh-64px)] place-items-center bg-[#f4f2ed] px-6 text-center text-stone-600">
        <div>
          <p>{projectId ? "正在同步这个画布的素材…" : "正在打开画布库里的项目…"}</p>
          <button type="button" className="studio-ghost mt-4" onClick={() => router.push("/canvas/home")}>
            回画布库
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="canvas-workspace-board min-h-[calc(100vh-64px)] bg-[#f4f2ed] text-stone-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white/80 px-4 py-3">
        <button type="button" className="studio-ghost" onClick={() => router.push("/canvas/home")}>
          画布库
        </button>
        <h1 className="m-0 text-lg font-semibold">{project.title}</h1>
        <span className="text-xs text-stone-500">
          {images.length} 张图 · {videos.length} 条视频 · {project.nodes.length} 个节点
        </span>
        <button
          type="button"
          className="studio-primary ml-auto"
          disabled={Boolean(busy)}
          onClick={() => void runAll()}
        >
          {busy || "一键全流程"}
        </button>
      </header>
      {error ? <p className="studio-error px-4 py-2">{error}</p> : null}
      {busy ? <p className="studio-hint px-4 py-2">{busy}</p> : null}

      <section className="grid gap-4 p-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="studio-kicker">故事导演</p>
          <h2 className="mt-1 text-base">分析故事，生成角色资产，再按镜头批量生成分镜</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-stone-600">{storyText}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-stone-500">
            <div>画风 {style}</div>
            <div>镜头 {shotCount}</div>
            <div>画幅 {ratio}</div>
            <div>模型 Grok</div>
          </dl>
        </article>

        <div className="grid gap-4">
          <div>
            <p className="studio-kicker px-1">图片</p>
            {images.length ? (
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
                {images.map((node) => (
                  <figure key={node.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <img src={mediaUrl(node)} alt={node.title} className="aspect-video w-full object-cover" />
                    <figcaption className="px-3 py-2 text-xs text-stone-600">{node.title}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="studio-hint mt-2">还没有分镜图。点右上角「一键全流程」生成 5 张。</p>
            )}
          </div>
          <div>
            <p className="studio-kicker px-1">视频</p>
            {videos.length ? (
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {videos.map((node) => (
                  <figure key={node.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-black shadow-sm">
                    <video src={mediaUrl(node)} controls className="aspect-video w-full" />
                    <figcaption className="bg-white px-3 py-2 text-xs text-stone-600">{node.title}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="studio-hint mt-2">还没有视频。一键全流程会用最多 5 张分镜静帧去生成。</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default CanvasWorkspaceLite;
