"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { generateStudioImage } from "@/studio/generate/image";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { useStudioHistory } from "@/studio/history";
import { CompactModelSelect, preferredImageKey, preferredTextKey, preferredVideoKey } from "@/studio/model-select";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { STYLE_PRESETS } from "@/studio/canvas/types";
import { characterLock, draftPlan, planStory, type StoryCast, type StoryShot } from "@/studio/story/plan";
import { GRAPH_KEY } from "@/studio/canvas/types";
import { WorkbenchStatus } from "@/studio/workbench-status";

export function StoryDirectorPage() {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const addHistory = useStudioHistory((state) => state.add);
  const [idea, setIdea] = useState("雨夜码头，女警探林晚追踪一枚会发光的铜铃。克制、潮湿、霓虹，电影感写实。");
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [imageModel, setImageModel] = useState(preferredImageKey());
  const [videoModel, setVideoModel] = useState(preferredVideoKey());
  const [style, setStyle] = useState("电影感写实");
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
    if (next && next.includes("grok-4")) setTextModel(next);
    else if (next && /imagine-video|seedance|ltx|hunyuan/i.test(next)) setVideoModel(next);
    else if (next && next.includes("::")) setImageModel(next);
  }, []);

  const imageSel = splitModel(imageModel);
  const videoSel = splitModel(videoModel);

  const analyze = async () => {
    setJob({ type: "analyze" });
    setBusy("正在拆分镜…");
    setError("");
    const local = draftPlan(idea, style, mode === "grid9" ? 9 : shotCount);
    setLogline(local.logline);
    setScenes(local.scenes);
    setCast(local.cast);
    setShots(local.shots);
    try {
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

  const renderCharacter = async (index: number, people = cast) => {
    const person = people[index];
    if (!person) return;
    setJob({ type: "char", index });
    setBusy(`正在出 ${person.name} 的角色图…`);
    setError("");
    try {
      const result = await generateStudioImage({
        relays,
        providerId: imageSel.providerId,
        model: imageSel.model,
        prompt: `character bible portrait, locked identity, studio, ${person.look}, name ${person.name}, ${style}`,
        size: quality === "3K" ? "3K" : "2K",
      });
      setCast((current) => current.map((item, i) => (i === index ? { ...item, url: result.url, status: "ready" } : item)));
      addHistory({ kind: "image", title: `角色 ${person.name}`, prompt: person.look, model: result.model, urls: [result.url] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "角色图失败";
      setError(message);
      setCast((current) => current.map((item, i) => (i === index ? { ...item, status: message } : item)));
    } finally {
      setBusy("");
      setJob(null);
    }
  };

  const renderShot = async (index: number, boardShots = shots) => {
    const shot = boardShots[index];
    if (!shot) return;
    setJob({ type: "shot", index });
    setBusy(`正在生成第 ${index + 1} 镜…`);
    setError("");
    try {
      const result = await generateStudioImage({
        relays,
        providerId: imageSel.providerId,
        model: imageSel.model,
        prompt: `${shot.prompt}. Camera: ${shot.camera}. Style: ${style}. Character lock: ${characterLock(cast.length ? cast : [])}`,
        imageUrl: cast.find((item) => item.url)?.url,
        size: quality === "3K" ? "3K" : "2K",
      });
      setShots((current) => current.map((item, i) => (i === index ? { ...item, url: result.url, status: "done", error: "" } : item)));
      addHistory({ kind: "image", title: shot.title, prompt: shot.prompt, model: result.model, urls: [result.url] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "这一镜出图失败";
      setError(message);
      setShots((current) => current.map((item, i) => (i === index ? { ...item, status: "error", error: message } : item)));
    } finally {
      setBusy("");
      setJob(null);
    }
  };

  const renderVideo = async (index: number) => {
    const shot = shots[index];
    if (!shot) return;
    setJob({ type: "video", index });
    setBusy(`正在生成第 ${index + 1} 镜视频…`);
    setError("");
    try {
      const created = await createStudioVideo({
        relays,
        prompt: `${shot.prompt}. Camera: ${shot.camera || "slow push in"}`,
        imageUrl: shot.url,
        duration: shot.duration || 5,
        aspectRatio: ratio,
        providerId: videoSel.providerId,
        model: videoSel.model,
        generateAudio: true,
      });
      const url = await waitStudioVideo({ relays, providerId: created.providerId, taskId: created.id, model: created.model });
      setShots((current) => current.map((item, i) => (i === index ? { ...item, videoUrl: url, status: "video" } : item)));
      addHistory({ kind: "video", title: shot.title, prompt: shot.prompt, model: created.model, urls: [url] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频失败";
      setError(message);
      setShots((current) => current.map((item, i) => (i === index ? { ...item, error: message } : item)));
    } finally {
      setBusy("");
      setJob(null);
    }
  };

  const fillCast = async (people = cast) => {
    const missing = people.filter((item) => !item.url && !item.locked);
    let done = 0;
    for (let i = 0; i < people.length; i += 1) {
      if (people[i].url || people[i].locked) continue;
      setProgress(`${done}/${missing.length || 1} 角色图 ${people[i].name}`);
      await renderCharacter(i, people);
      done += 1;
      setProgress(`${done}/${missing.length || 1} 角色图完成`);
    }
  };

  const fillShots = async (boardShots = shots) => {
    const missing = boardShots.filter((item) => !item.url);
    let done = 0;
    for (let i = 0; i < boardShots.length; i += 1) {
      if (boardShots[i].url) continue;
      setProgress(`${done}/${missing.length || 1} 分镜 ${boardShots[i].title}`);
      await renderShot(i, boardShots);
      done += 1;
      setProgress(`${done}/${missing.length || 1} 分镜完成`);
    }
  };

  const runStillPipeline = async (board?: { cast: StoryCast[]; shots: StoryShot[] }) => {
    const people = board?.cast || cast;
    const boardShots = board?.shots || shots;
    await fillCast(people);
    await fillShots(boardShots);
  };

  const oneClickAll = async () => {
    setJob({ type: "all" });
    setBusy("一键：拆分镜 → 角色图 → 全部分镜");
    setError("");
    const local = draftPlan(idea, style, mode === "grid9" ? 9 : shotCount);
    setLogline(local.logline);
    setScenes(local.scenes);
    setCast(local.cast);
    setShots(local.shots);
    try {
      const plan = await planStory({ relays, idea, textModel, style, shotCount: mode === "grid9" ? 9 : shotCount });
      setLogline(plan.logline);
      setScenes(plan.scenes);
      setCast(plan.cast);
      setShots(plan.shots);
      await runStillPipeline(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      setJob(null);
    }
  };

  const pushCanvas = () => {
    dropToCanvas({ kind: "story", text: idea, prompt: idea, model: textModel });
    try {
      const raw = localStorage.getItem(GRAPH_KEY);
      const graph = raw ? (JSON.parse(raw) as { nodes: unknown[]; edges: unknown[] }) : { nodes: [], edges: [] };
      const id = `story-${Date.now()}`;
      const node = {
        id,
        type: "story",
        position: { x: 80, y: 80 },
        data: {
          kind: "story",
          text: idea,
          textModel,
          imageModel,
          videoModel,
          style,
          mode,
          shotCount,
          ratio,
          quality,
          logline,
          scenes,
          cast,
          shots,
          status: logline || "待分析",
        },
      };
      localStorage.setItem(GRAPH_KEY, JSON.stringify({ nodes: [node, ...(graph.nodes || [])], edges: graph.edges || [] }));
    } catch {
      /* ignore */
    }
    void navigate({ to: "/canvas" });
  };

  return (
    <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">故事导演</p>
        <h1>把故事拆成分镜</h1>
        <label>
          故事
          <textarea rows={9} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="粘贴小说、章节或剧情梗概。可包含角色、场景、对白和画风。" />
        </label>
        <CompactModelSelect kind="text" value={textModel} onChange={setTextModel} label="文本模型" />
        <CompactModelSelect kind="image" value={imageModel} onChange={setImageModel} label="生图模型" />
        <CompactModelSelect kind="video" value={videoModel} onChange={setVideoModel} label="视频模型" />
        <div className="chip-row">
          {STYLE_PRESETS.slice(0, 6).map((item) => (
            <button key={item} type="button" className={style === item ? "is-active" : undefined} onClick={() => setStyle(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="studio-seg">
          <button type="button" className={mode === "single" ? "is-active" : undefined} onClick={() => setMode("single")}>
            逐镜
          </button>
          <button type="button" className={mode === "grid9" ? "is-active" : undefined} onClick={() => setMode("grid9")}>
            9 宫格
          </button>
        </div>
        <div className="chip-row">
          {[3, 5, 6, 9].map((item) => (
            <button key={item} type="button" className={shotCount === item ? "is-active" : undefined} onClick={() => setShotCount(item)}>
              {item} 镜
            </button>
          ))}
          {["16:9", "9:16", "1:1"].map((item) => (
            <button key={item} type="button" className={ratio === item ? "is-active" : undefined} onClick={() => setRatio(item)}>
              {item}
            </button>
          ))}
          {["2K", "3K"].map((item) => (
            <button key={item} type="button" className={quality === item ? "is-active" : undefined} onClick={() => setQuality(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="bp-cta">
          <button type="button" className="studio-primary" disabled={Boolean(job)} onClick={() => void oneClickAll()}>
            {job?.type === "all" ? busy : "一键全流程"}
          </button>
          <button type="button" className="studio-ghost" disabled={Boolean(job)} onClick={() => void analyze()}>
            只拆分镜
          </button>
          <button type="button" className="studio-ghost" disabled={Boolean(job) || !cast.length} onClick={() => void fillCast()}>
            给所有角色出图
          </button>
          <button type="button" className="studio-ghost" disabled={Boolean(job) || !shots.length} onClick={() => void fillShots()}>
            给所有镜头出图
          </button>
          <button type="button" className="studio-ghost" onClick={pushCanvas}>
            推到画布
          </button>
          {error ? <p className="studio-error">{error}</p> : null}
        </div>
      </aside>
      <section className="bp-right story-board">
        <header className="bp-bar">
          <b>
            分镜台 · {cast.length} 角色 · {shots.filter((item) => item.url).length}/{shots.length || 0} 已出图
          </b>
        </header>
        <WorkbenchStatus
          busy={busy}
          error={error}
          done={logline ? `${cast.length} 角色 · ${shots.filter((item) => item.url).length}/${shots.length || 0} 分镜` : ""}
          idle="拆完分镜后，点角色卡「生成角色图」，或镜头卡「生成这一镜」"
        />
        {!cast.length && !shots.length ? (
          <div className="bp-stage">
            <p className="studio-hint">右边会出角色资产和分镜。左边贴故事，点「分析故事」或「一键全流程」。</p>
          </div>
        ) : (
          <div className="story-result">
            <article className="story-logline">
              <p className="studio-kicker">故事总结</p>
              <h2>{logline}</h2>
              <p>场景：{scenes.join(" / ") || "—"}</p>
            </article>
            <p className="studio-kicker">角色（先出角色图，分镜才能长得一样）</p>
            <div className="cast-row">
              {cast.map((person, index) => {
                const running = job?.type === "char" && job.index === index;
                return (
                <article key={`${person.name}-${index}`} className="cast-card">
                  <div className="card-media">
                    {person.url ? <img src={person.url} alt={person.name} /> : <div className="shot-empty">还没有角色图</div>}
                    {running ? (
                      <div className="card-busy">
                        <span className="orig-spinner sm" />
                        出图中
                      </div>
                    ) : null}
                  </div>
                  <span>
                    {person.name}
                    <small>
                      {person.importance === "main" ? "主角" : "配角"}
                      {person.locked ? " · 外貌已锁" : person.url ? " · 已出图" : " · 还没出图"}
                    </small>
                  </span>
                  {person.status && person.status !== "pending" && person.status !== "ready" ? <p className="studio-error">{person.status}</p> : null}
                  <div className="shot-actions">
                    <button type="button" disabled={running} onClick={() => void renderCharacter(index)}>
                      {person.url ? "重做角色图" : "生成角色图"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCast((current) => current.map((item, i) => (i === index ? { ...item, locked: !item.locked } : item)))}
                    >
                      {person.locked ? "解锁外貌" : "锁定外貌"}
                    </button>
                  </div>
                </article>
              );
              })}
            </div>
            <p className="studio-kicker">分镜队列</p>
            <div className="shot-grid">
              {shots.map((shot, index) => {
                const running = (job?.type === "shot" || job?.type === "video") && job.index === index;
                return (
                <article key={`${shot.title}-${index}`} className="shot-card">
                  <div className="card-media">
                    {shot.videoUrl ? (
                      <video src={shot.videoUrl} controls />
                    ) : shot.url ? (
                      <img src={shot.url} alt={shot.title} />
                    ) : (
                      <div className="shot-empty">{index + 1}. {shot.title}</div>
                    )}
                    {running ? (
                      <div className="card-busy">
                        <span className="orig-spinner sm" />
                        {job?.type === "video" ? "视频生成中" : "这一镜出图中"}
                      </div>
                    ) : null}
                  </div>
                  <div className="shot-body">
                    <b>
                      {index + 1}. {shot.title}
                    </b>
                    <p>
                      {shot.camera} · {shot.scene} · {shot.characters.join(" / ")} · {shot.duration || 5}s
                    </p>
                    <p>台词：{shot.dialogue || "无对白"}</p>
                    {shot.error ? <p className="studio-error">{shot.error}</p> : null}
                    <div className="shot-actions">
                      <button type="button" disabled={running} onClick={() => void renderShot(index)}>
                        {shot.url ? "重做这一镜" : "生成这一镜"}
                      </button>
                      <button type="button" disabled={running} onClick={() => void renderVideo(index)}>
                        生成视频
                      </button>
                    </div>
                  </div>
                </article>
              );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
