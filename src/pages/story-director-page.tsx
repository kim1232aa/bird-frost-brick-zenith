"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStudioHistory } from "@/studio/history";
import { preferredImageKey, preferredTextKey, preferredVideoKey, CompactModelSelect } from "@/studio/model-select";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { STYLE_PRESETS } from "@/studio/canvas/types";
import { characterLock, draftPlan, type StoryCast, type StoryShot } from "@/studio/story/plan";
import { shotImageRefs, stillSizeForQuality, storyStillUrls, videoStillBundle } from "@/studio/story/director-helpers";
import { WorkbenchStatus } from "@/studio/workbench-status";
import { pushStoryToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";

export function StoryDirectorPage() {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const addHistory = useStudioHistory((state) => state.add);
  const [idea, setIdea] = useState("");
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [imageModel, setImageModel] = useState(preferredImageKey());
  const [videoModel, setVideoModel] = useState(preferredVideoKey());
  const [style, setStyle] = useState("");
  const [mode, setMode] = useState<"single" | "grid9">("single");
  const [shotCount, setShotCount] = useState(5);
  const [ratio, setRatio] = useState("16:9");
  const [quality, setQuality] = useState("2K");
  const [logline, setLogline] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [cast, setCast] = useState<StoryCast[]>([]);
  const [shots, setShots] = useState<StoryShot[]>([]);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<{ type: "char" | "shot" | "video" | "analyze" | "all"; index?: number } | null>(null);

  useEffect(() => {
    const next = queryParam("text") || queryParam("model");
    if (!next) return;
    if (next.includes("::") && /imagine-video|seedance|ltx|hunyuan|agnes-video|wan2/i.test(next)) setVideoModel(next);
    else if (next.includes("::") && /grok-4|gpt-|agnes-2|qwen-plus|qwen-max|sensenova-6/i.test(next)) setTextModel(next);
    else if (next.includes("::")) setImageModel(next);
  }, []);

  const imageSel = splitModel(imageModel);
  const videoSel = splitModel(videoModel);

  const analyze = async () => {
    if (!idea.trim()) {
      setError("先在左边写下故事，再点拆分镜。不会后台自动生成。");
      return;
    }
    setJob({ type: "analyze" });
    setBusy("正在拆分镜…");
    setError("");
    const local = draftPlan(idea, style, mode === "grid9" ? 9 : shotCount);
    setLogline(local.logline);
    setScenes(local.scenes);
    setCast(local.cast);
    setShots(local.shots);
    try {
      const { planStory } = await import("@/studio/story/plan");
      const plan = await planStory({ relays, idea, textModel, style, shotCount: mode === "grid9" ? 9 : shotCount });
      setLogline(plan.logline);
      setScenes(plan.scenes);
      setCast(plan.cast);
      setShots(plan.shots);
      addHistory({ kind: "story", title: idea.slice(0, 40), prompt: idea, model: splitModel(textModel).model, urls: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setBusy("");
      setJob(null);
    }
  };

  const oneClickAll = async () => {
    if (!idea.trim()) {
      setError("先在左边写下故事，再点一键全流程。不会后台自动生成。");
      return;
    }
    setJob({ type: "all" });
    setBusy("一键：拆分镜 → 角色图 → 5 张分镜 → 视频");
    setError("");
    const local = draftPlan(idea, style, mode === "grid9" ? 9 : shotCount);
    setLogline(local.logline);
    setScenes(local.scenes);
    setCast(local.cast);
    setShots(local.shots);
    try {
      const { planStory } = await import("@/studio/story/plan");
      let plan = local;
      try {
        plan = await planStory({ relays, idea, textModel, style, shotCount: mode === "grid9" ? 9 : shotCount });
      } catch (analyzeErr) {
        setError(analyzeErr instanceof Error ? `分析失败，改用本地分镜：${analyzeErr.message}` : "分析失败，改用本地分镜");
      }
      setLogline(plan.logline);
      setScenes(plan.scenes);
      setCast(plan.cast);
      setShots(plan.shots);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      setJob(null);
    }
  };

  return (
    <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">故事导演</p>
        <h1>把故事拆成分镜</h1>
        <label>
          故事
          <textarea rows={8} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="粘贴小说、章节或剧情梗概。" />
        </label>
        <button type="button" className="studio-primary" disabled={Boolean(job)} onClick={() => void oneClickAll()}>
          {job?.type === "all" ? busy : "一键全流程"}
        </button>
        {error ? <p className="studio-error" role="alert">{error}</p> : null}
      </aside>
    </div>
  );
}

export default StoryDirectorPage;
