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
import { characterLock, planStory, type StoryCast, type StoryShot } from "@/studio/story/plan";
import { GRAPH_KEY } from "@/studio/canvas/types";

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
  const [error, setError] = useState("");

  useEffect(() => {
    const next = queryParam("text") || queryParam("model");
    if (next && next.includes("grok-4")) setTextModel(next);
    else if (next && /imagine-video|seedance|ltx|hunyuan/i.test(next)) setVideoModel(next);
    else if (next && next.includes("::")) setImageModel(next);
  }, []);

  const imageSel = splitModel(imageModel);
  const videoSel = splitModel(videoModel);

  const analyze = async () => {
    setBusy("分析故事…");
    setError("");
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
    }
  };

  const renderCharacter = async (index: number) => {
    const person = cast[index];
    if (!person) return;
    setBusy(`定妆 ${person.name}`);
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
      addHistory({ kind: "image", title: `定妆 ${person.name}`, prompt: person.look, model: result.model, urls: [result.url] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "定妆失败");
    } finally {
      setBusy("");
    }
  };

  const renderShot = async (index: number) => {
    const shot = shots[index];
    if (!shot) return;
    setBusy(`分镜 ${shot.title}`);
    setError("");
    try {
      const result = await generateStudioImage({
        relays,
        providerId: imageSel.providerId,
        model: imageSel.model,
        prompt: `${shot.prompt}. Camera: ${shot.camera}. Style: ${style}. Character lock: ${characterLock(cast)}`,
        imageUrl: cast.find((item) => item.url)?.url,
        size: quality === "3K" ? "3K" : "2K",
      });
      setShots((current) => current.map((item, i) => (i === index ? { ...item, url: result.url, status: "done" } : item)));
      addHistory({ kind: "image", title: shot.title, prompt: shot.prompt, model: result.model, urls: [result.url] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "分镜失败");
    } finally {
      setBusy("");
    }
  };

  const renderVideo = async (index: number) => {
    const shot = shots[index];
    if (!shot) return;
    setBusy(`视频 ${shot.title}`);
    setError("");
    try {
      const created = await createStudioVideo({
        relays,
        prompt: `${shot.prompt}. Camera: ${shot.camera || "slow push in"}`,
        imageUrl: shot.url,
        duration: 5,
        aspectRatio: ratio,
        providerId: videoSel.providerId,
        model: videoSel.model,
        generateAudio: true,
      });
      const url = await waitStudioVideo({ relays, providerId: created.providerId, taskId: created.id, model: created.model });
      setShots((current) => current.map((item, i) => (i === index ? { ...item, videoUrl: url, status: "video" } : item)));
      addHistory({ kind: "video", title: shot.title, prompt: shot.prompt, model: created.model, urls: [url] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "视频失败");
    } finally {
      setBusy("");
    }
  };

  const runStillPipeline = async () => {
    for (let i = 0; i < cast.length; i += 1) {
      if (!cast[i].url && !cast[i].locked) await renderCharacter(i);
    }
    for (let i = 0; i < shots.length; i += 1) {
      if (!shots[i].url) await renderShot(i);
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
    <div className="bench story-bench">
      <aside className="bench-side sd-page">
        <p className="studio-kicker">STORY</p>
        <h1>故事导演</h1>
        <p className="studio-hint">先把故事贴进去，点分析。角色和分镜会填到右边；需要节点连线时再推到画布。</p>
        <div className="sd-5">
          <label>
            文本模型
            <CompactModelSelect kind="text" value={textModel} onChange={setTextModel} />
          </label>
          <label>
            生图模型
            <CompactModelSelect kind="image" value={imageModel} onChange={setImageModel} />
          </label>
        </div>
        <label>
          视频模型
          <CompactModelSelect kind="video" value={videoModel} onChange={setVideoModel} />
        </label>
        <label>
          故事
          <textarea rows={10} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="粘贴小说、章节或剧情梗概。可包含角色、场景、对白和画风要求。" />
        </label>
        <div className="sd-5">
          <label>
            画风预设
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              {STYLE_PRESETS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            模式
            <select value={mode} onChange={(event) => setMode(event.target.value as "single" | "grid9")}>
              <option value="single">逐镜生成</option>
              <option value="grid9">9宫格分镜</option>
            </select>
          </label>
          <label>
            镜头数
            <input type="number" min={1} max={12} value={shotCount} onChange={(event) => setShotCount(Number(event.target.value) || 5)} />
          </label>
          <label>
            画幅
            <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
              {["16:9", "9:16", "1:1"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            质量
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="3K">3K</option>
            </select>
          </label>
        </div>
        <div className="sd-actions">
          <button type="button" disabled={Boolean(busy) || !idea.trim()} onClick={() => void analyze()}>
            <b>分析故事</b>
            <span>生成角色 / 场景 / 分镜</span>
          </button>
          <button type="button" disabled={Boolean(busy) || !cast.length} onClick={() => void runStillPipeline()}>
            <b>补齐角色图</b>
            <span>{cast.length ? `再出分镜静帧` : "需先分析故事"}</span>
          </button>
          <button type="button" disabled={Boolean(busy) || !shots.length} onClick={() => void runStillPipeline()}>
            <b>生成分镜图</b>
            <span>按镜头提交</span>
          </button>
          <button type="button" onClick={pushCanvas}>
            <b>推到画布</b>
            <span>变成可连线节点</span>
          </button>
        </div>
        {busy ? <p className="studio-hint">{busy}</p> : null}
        {error ? <p className="studio-error">{error}</p> : null}
        <div className="sd-tiles">
          <div>
            <small>角色</small>
            <b>{cast.length} 个</b>
          </div>
          <div>
            <small>场景</small>
            <b>{scenes.length} 个</b>
          </div>
          <div>
            <small>镜头</small>
            <b>{shots.length} 个</b>
          </div>
        </div>
      </aside>
      <section className="bench-main story-board">
        {!cast.length && !shots.length ? (
          <div className="studio-placeholder">
            <p>右边先空着，这是正常的。</p>
            <p>1. 左边贴故事</p>
            <p>2. 点「分析故事」</p>
            <p>3. 角色资产和分镜会出现在这里，再定妆、出图、出视频</p>
          </div>
        ) : (
          <>
            <article className="story-logline">
              <p className="studio-kicker">故事总结</p>
              <h2>{logline}</h2>
              <p>场景：{scenes.join(" / ") || "—"}</p>
            </article>
            <div>
              <p className="studio-kicker">角色资产</p>
              <div className="cast-row">
                {cast.map((person, index) => (
                  <button key={`${person.name}-${index}`} type="button" className="cast-card" onClick={() => void renderCharacter(index)}>
                    {person.url ? <img src={person.url} alt={person.name} /> : <div className="shot-empty">点此定妆</div>}
                    <span>
                      {person.name}
                      <small>
                        {person.importance === "main" ? "主角" : "配角"}
                        {person.url ? " · 已生成" : " · 待定妆"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="studio-kicker">分镜队列</p>
              <div className="shot-grid">
                {shots.map((shot, index) => (
                  <article key={`${shot.title}-${index}`} className="shot-card">
                    {shot.videoUrl ? (
                      <video src={shot.videoUrl} controls />
                    ) : shot.url ? (
                      <img src={shot.url} alt={shot.title} />
                    ) : (
                      <div className="shot-empty">{shot.title}</div>
                    )}
                    <div className="shot-body">
                      <b>
                        {index + 1}. {shot.title}
                      </b>
                      <p>
                        {shot.camera} · {shot.scene} · {shot.characters.join(" / ")}
                      </p>
                      <div className="shot-actions">
                        <button type="button" disabled={Boolean(busy)} onClick={() => void renderShot(index)}>
                          {shot.url ? "重拍静帧" : "出图"}
                        </button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => void renderVideo(index)}>
                          出视频
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
