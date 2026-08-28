"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog, catalogKey } from "@/studio/catalog";
import { captureVideoFrame, evenFrameTimes, extractVideoFrames, videoFileUrl } from "@/studio/frame-extract";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { useStudioJobs } from "@/studio/generate/jobs";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { filesToDataUrls } from "@/studio/image-refs";
import { useMediaDraft } from "@/studio/media-draft";
import { useMembershipStore } from "@/studio/membership";
import { liveCatalog, liveCard, useOpsStore } from "@/studio/ops";
import { preferredTextKey, preferredVideoKey, StudioModelField } from "@/studio/model-select";
import { VIDEO_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";
import { StageOverlay, WorkbenchStatus } from "@/studio/workbench-status";
import { GuestGenerateBanner, useGenerateAccess } from "@/studio/auth-gate";

type VideoMode = "t2v" | "i2v" | "flf" | "extract";

const TEMPLATE_GROUPS = (() => {
  const map = new Map<string, typeof VIDEO_TEMPLATES>();
  for (const item of VIDEO_TEMPLATES) {
    const group = item.group || "模板";
    const list = map.get(group) || [];
    list.push(item);
    map.set(group, list);
  }
  return [...map.entries()];
})();

export function VideoStudioPage({ initialMode = "t2v" }: { initialMode?: VideoMode }) {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.video);
  const record = useMembershipStore((state) => state.record);
  const startJob = useStudioJobs((state) => state.start);
  const succeedJob = useStudioJobs((state) => state.succeed);
  const failJob = useStudioJobs((state) => state.fail);
  const access = useGenerateAccess();
  const [selection, setSelection] = useState(preferredVideoKey());
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(6);
  const [ratio, setRatio] = useState("16:9");
  const firstFrame = useMediaDraft((state) => state.firstFrame);
  const lastFrame = useMediaDraft((state) => state.lastFrame);
  const setFirstFrame = useMediaDraft((state) => state.setFirstFrame);
  const setLastFrame = useMediaDraft((state) => state.setLastFrame);
  const clipUrl = useMediaDraft((state) => state.clipUrl);
  const setClipUrl = useMediaDraft((state) => state.setClipUrl);
  const frames = useMediaDraft((state) => state.frames);
  const setFrames = useMediaDraft((state) => state.setFrames);
  const [audio, setAudio] = useState(true);
  const [mode, setMode] = useState<VideoMode>(initialMode);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishError, setPolishError] = useState("");
  const [url, setUrl] = useState("");
  const [frameCount, setFrameCount] = useState(6);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const fromQuery = queryParam("mode");
    if (fromQuery === "i2v" || fromQuery === "flf" || fromQuery === "extract" || fromQuery === "t2v") setMode(fromQuery);
    else setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const next = queryParam("model");
    if (next) setSelection(next);
  }, []);

  const models = liveCatalog("video", false);
  const card = models.find((item) => catalogKey(item) === selection) || findCatalog(selection);
  const isArk = /volcengine|seedance/i.test(selection);
  const selectedLive = card ? liveCard(card) : models[0] ? liveCard(models[0]) : undefined;
  const mine = useMemo(() => items.filter((item) => item.kind === "video" && item.urls[0]), [items]);
  const seeds = useMemo(() => {
    const all = GALLERY_SEED.filter((item) => item.kind === "video");
    const model = (card?.model || splitModel(selection).model || "").toLowerCase();
    if (!model) return [];
    return all.filter((item) => {
      const seedModel = String(item.model || "").toLowerCase();
      return seedModel && (seedModel === model || model.includes(seedModel) || seedModel.includes(model));
    });
  }, [card, selection]);
  const creditCost = duration >= 8 ? 2 : 1;

  const goMode = (next: VideoMode) => {
    setMode(next);
    setError("");
    if (next === "extract") void navigate({ to: "/frames" });
    else if (next === "i2v" || next === "flf") void navigate({ to: "/i2v" });
    else void navigate({ to: "/video" });
  };

  const pickImage = async (files: FileList | null, slot: "first" | "last") => {
    const next = await filesToDataUrls(files, 1);
    if (!next[0]) return;
    if (slot === "first") setFirstFrame(next[0]);
    else setLastFrame(next[0]);
  };

  const disabledReason = busy
    ? busy
    : mode === "extract"
      ? !clipUrl
        ? "先上传要抽帧的视频"
        : ""
      : access.blockedReason
        ? access.blockedReason
        : !prompt.trim()
          ? "请先填写提示词"
          : !models.length
            ? "没有可选视频模型"
            : (mode === "i2v" || mode === "flf") && !firstFrame
              ? "图生视频需要首帧"
              : mode === "flf" && !lastFrame
                ? "首尾帧模式需要尾帧"
                : selectedLive && !selectedLive.wired
                  ? `${card?.model || "该模型"} 待接线，换一个已填密钥的，或去设置填 Key`
                  : remaining < creditCost
                    ? `积分不足，需要 ${creditCost} 点`
                    : "";

  const generate = async () => {
    if (!access.allowed) {
      setError(access.blockedReason || "请先登录");
      return;
    }
    const { providerId, model } = splitModel(selection);
    setBusy("提交任务…");
    setError("");
    const jobId = startJob({
      kind: mode === "t2v" ? "video" : "i2v",
      prompt,
      model,
      providerId,
      credits: creditCost,
    });
    try {
      const created = await createStudioVideo({
        relays,
        prompt,
        duration,
        aspectRatio: ratio,
        providerId,
        model,
        imageUrl: mode === "t2v" ? undefined : firstFrame || undefined,
        lastFrameUrl: mode === "t2v" ? undefined : lastFrame || undefined,
        generateAudio: isArk ? audio : undefined,
      });
      const videoUrl = await waitStudioVideo({
        relays,
        providerId: created.providerId,
        taskId: created.id,
        model: created.model,
        ticketId: created.ticketId,
        onTick: (n) => setBusy(`生成中 · 轮询 ${n}`),
      });
      setUrl(videoUrl);
      record("video");
      addHistory({ kind: "video", title: prompt.slice(0, 40), prompt, model: created.model, urls: [videoUrl] });
      succeedJob(jobId, [videoUrl]);
      setBusy("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频生成失败";
      failJob(jobId, message);
      if (message.includes("eligible")) {
        setError(`${card?.model || "当前模型"} 返回额度不足。换一条已接线的视频模型，或稍后再试。不会自动改线路。`);
      } else if (/cloudflare|403/i.test(message)) {
        setError(`${card?.provider || "当前中转"} 被拦截（403）。换一条已接线的视频模型，或稍后再试。不会自动改线路。`);
      } else {
        setError(message);
      }
      setBusy("");
    }
  };

  const extractCurrent = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const frame = captureVideoFrame(video);
      setFrames((current) => [...current, frame].slice(-24));
    } catch (err) {
      setError(err instanceof Error ? err.message : "抽帧失败");
    }
  };

  const extractEven = async () => {
    if (!clipUrl) return;
    setBusy("正在抽帧…");
    setError("");
    try {
      const video = videoRef.current;
      const durationSec = video?.duration || 0;
      const times = evenFrameTimes(durationSec, frameCount);
      const next = await extractVideoFrames(clipUrl, times);
      setFrames(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "抽帧失败");
    } finally {
      setBusy("");
    }
  };

  const saveFrames = () => {
    if (!frames.length) return;
    addHistory({
      kind: "image",
      title: `抽帧 ${frames.length} 张`,
      prompt: prompt || "视频抽帧",
      model: "extract",
      urls: frames,
    });
  };

  const hero =
    mode === "extract"
      ? { kicker: "FRAMES", title: "视频抽帧", copy: "上传本地视频，抽当前帧、首尾帧或均匀取样。不消耗生成额度。" }
      : mode === "flf"
        ? { kicker: "VIDEO", title: "首尾帧驱动", copy: "首帧和尾帧都会提交。火山 Seedance 走 last_frame。" }
        : mode === "i2v"
          ? { kicker: "VIDEO", title: "图生视频", copy: "必须上传首帧。尾帧可选，火山适配器已接通 lastFrameUrl。" }
          : { kicker: "VIDEO", title: "文生视频", copy: "写镜头、选时长和画幅。点生成走你选的视频模型，成功才扣本账号视频点。" };

  if (mode === "extract") {
    return (
      <div className="bp-page">
        <header className="bp-hero">
          <p className="studio-kicker">{hero.kicker}</p>
          <h1>{hero.title}</h1>
          <p>{hero.copy}</p>
        </header>
        <div className="studio-seg" style={{ maxWidth: 520, marginBottom: 20 }}>
          <button type="button" onClick={() => goMode("t2v")}>文生视频</button>
          <button type="button" onClick={() => goMode("i2v")}>图生视频</button>
          <button type="button" onClick={() => goMode("flf")}>首尾帧</button>
          <button type="button" className="is-active">抽帧</button>
        </div>
        <div className="bp-work">
          <aside className="bp-left">
            <label className="dropzone">
              <span>上传视频 · mp4 / webm</span>
              <input
                type="file"
                accept="video/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (clipUrl) URL.revokeObjectURL(clipUrl);
                  setClipUrl(videoFileUrl(file));
                  setFrames([]);
                  event.target.value = "";
                }}
              />
              <small>抽帧在浏览器完成，不打上游。</small>
            </label>
            <div className="studio-seg">
              {[4, 6, 8, 12].map((item) => (
                <button key={item} type="button" className={frameCount === item ? "is-active" : undefined} onClick={() => setFrameCount(item)}>
                  {item} 帧
                </button>
              ))}
            </div>
            <div className="bp-cta">
              <button type="button" className="bp-generate bp-generate-image" disabled={Boolean(disabledReason) || Boolean(busy)} onClick={() => void extractEven()}>
                <span>{busy || "均匀抽帧"}</span>
                <small>{disabledReason || "不扣积分"}</small>
              </button>
              <button type="button" className="studio-ghost" disabled={!clipUrl} onClick={extractCurrent}>
                抽当前帧
              </button>
              {error ? <p className="studio-error" role="alert">{error}</p> : null}
            </div>
          </aside>
          <section className="bp-right">
            <header className="bp-bar">
              <div>
                <p className="studio-kicker">预览</p>
                <strong>拖进度条再点「抽当前帧」</strong>
              </div>
            </header>
            <div className="bp-stage">
              {clipUrl ? <video ref={videoRef} src={clipUrl} controls /> : <p className="studio-hint">还没有视频</p>}
            </div>
            {frames.length ? (
              <>
                <p className="bp-examples-title">抽出 {frames.length} 张</p>
                <div className="bp-examples">
                  {frames.map((frame, index) => (
                    <button
                      key={`${index}-${frame.slice(0, 12)}`}
                      type="button"
                      onClick={() => {
                        setFirstFrame(frame);
                        goMode("i2v");
                      }}
                    >
                      <img src={frame} alt={`帧 ${index + 1}`} />
                      <span>用作首帧</span>
                    </button>
                  ))}
                </div>
                <div className="result-actions" style={{ padding: "0 16px 16px" }}>
                  <button type="button" className="studio-ghost" onClick={saveFrames}>
                    保存到作品
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() => {
                      if (frames[0]) setFirstFrame(frames[0]);
                      if (frames.length > 1) setLastFrame(frames[frames.length - 1]);
                      goMode("flf");
                    }}
                  >
                    作首尾帧去生成
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() => {
                      dropToCanvas({ kind: "image", url: frames[0], prompt: "视频抽帧", text: "视频抽帧" });
                      void navigate({ to: "/canvas" });
                    }}
                  >
                    送入画布
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-page">
      <header className="bp-hero">
        <p className="studio-kicker">{hero.kicker}</p>
        <h1>{hero.title}</h1>
        <p>{hero.copy}</p>
      </header>
      <GuestGenerateBanner kind="video" />
      <p className="alert-banner warn">选哪个模型就打哪条接线。额度不够或中转失败时，错误出在按钮下面，不会自动换供应商。</p>
      <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">{card?.model || "生视频"}</p>
        <h1>{hero.title}</h1>
        <div className="studio-seg">
          <button type="button" className={mode === "t2v" ? "is-active" : undefined} onClick={() => goMode("t2v")}>
            文生视频
          </button>
          <button type="button" className={mode === "i2v" ? "is-active" : undefined} onClick={() => goMode("i2v")}>
            图生视频
          </button>
          <button type="button" className={mode === "flf" ? "is-active" : undefined} onClick={() => goMode("flf")}>
            首尾帧
          </button>
        </div>
        <div className="bp-model-fields">
          <StudioModelField kind="video" value={selection} onChange={setSelection} label="视频模型" />
          <StudioModelField kind="text" value={textModel} onChange={setTextModel} label="润色文本模型" />
        </div>
        <label>
          描述你的想法
          <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述镜头运动、主体和气氛" />
        </label>
        <div className="prompt-tools">
          <span className="bp-count">必填 · {prompt.length} / 20000</span>
          <button
            type="button"
            className="studio-ghost"
            disabled={Boolean(busy) || polishBusy}
            onClick={() => {
              setPolishBusy(true);
              setPolishError("");
              void enhancePrompt({ relays, prompt, textModel, kind: "video" })
                .then(setPrompt)
                .catch((err) => setPolishError(err instanceof Error ? err.message : "润色失败"))
                .finally(() => setPolishBusy(false));
            }}
          >
            {polishBusy ? "正在润色…" : "提示词模板 / 润色"}
          </button>
        </div>
        {polishError ? <p className="studio-hint" role="alert">{polishError}</p> : null}
        {mode !== "t2v" ? (
          <div className="ref-grid">
            <label className="dropzone dropzone-mini">
              <span>{mode === "flf" ? "首帧（必填）" : "首帧（必填）"}</span>
              <input type="file" accept="image/*" onChange={(event) => void pickImage(event.target.files, "first")} />
              {firstFrame ? <img src={firstFrame} alt="" className="ref-thumb" /> : <small>图生视频必须上传</small>}
            </label>
            <label className="dropzone dropzone-mini">
              <span>{mode === "flf" ? "尾帧（必填）" : "尾帧（可选）"}</span>
              <input type="file" accept="image/*" onChange={(event) => void pickImage(event.target.files, "last")} />
              {lastFrame ? <img src={lastFrame} alt="" className="ref-thumb" /> : <small>{isArk ? "火山会按 last_frame 提交" : "有尾帧的模型会一起提交"}</small>}
            </label>
          </div>
        ) : (
          <label className="dropzone">
            <span>可选首帧 · 上传后切到图生视频</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                void pickImage(event.target.files, "first").then(() => goMode("i2v"));
              }}
            />
            <small>不上传则走文生视频</small>
          </label>
        )}
        {TEMPLATE_GROUPS.map(([group, list]) => (
          <div key={group}>
            <p className="studio-kicker">{group}</p>
            <div className="chip-row">
              {list.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={prompt === item.prompt ? "is-active" : undefined}
                  onClick={() => setPrompt(item.prompt)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="studio-kicker">时长 / 画幅</p>
        <div className="studio-seg">
          {[4, 5, 6, 8, 10].map((item) => (
            <button key={item} type="button" className={duration === item ? "is-active" : undefined} onClick={() => setDuration(item)}>
              {item}s
            </button>
          ))}
        </div>
        <div className="aspect-grid">
          {["16:9", "9:16", "1:1"].map((item) => {
            const [w, h] = item.split(":").map(Number);
            const max = 22;
            const box = w >= h ? { width: max, height: Math.max(8, Math.round((max * h) / w)) } : { width: Math.max(8, Math.round((max * w) / h)), height: max };
            return (
              <button key={item} type="button" className={ratio === item ? "is-active" : undefined} onClick={() => setRatio(item)}>
                <span className="aspect-preview" style={box} />
                {item}
              </button>
            );
          })}
        </div>
        {isArk ? (
          <label className="flow-check">
            <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
            生成原声
          </label>
        ) : null}
        <div className="bp-cta">
          <button type="button" className="bp-generate bp-generate-video" disabled={Boolean(disabledReason)} onClick={() => void generate()}>
            <span>{busy ? `生成中 · ${busy}` : mode === "flf" ? "按首尾帧生成" : "生成视频"}</span>
            <small>{disabledReason || `${creditCost} 点 · 剩余 ${remaining}`}</small>
          </button>
          {error ? <p className="studio-error" role="alert">{error}</p> : null}
        </div>
      </aside>
      <section className="bp-right">
        <header className="bp-bar">
          <div>
            <p className="studio-kicker">{url || busy ? "生成结果" : "预览"}</p>
            <strong>{card?.provider ? `${card.provider} · ${card.model}` : card?.model || "未选模型"}</strong>
          </div>
        </header>
        <WorkbenchStatus
          busy={busy}
          error={error}
          done={url ? `${card?.model || "模型"} 已出片` : ""}
          idle="生成后视频会出现在上面。下面参考样片只带提示词，不会冒充当前模型的成片。"
        />
        {url || busy ? (
          <>
            <div className="bp-stage">
              {url ? <video src={url} controls autoPlay loop /> : null}
              <StageOverlay busy={busy} />
            </div>
            {url ? (
              <div className="result-actions" style={{ padding: "0 16px 8px" }}>
                <a className="studio-ghost" href={url} download="studio.mp4" target="_blank" rel="noreferrer">
                  下载
                </a>
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() => {
                    dropToCanvas({ kind: "video", url, prompt, model: selection });
                    void navigate({ to: "/canvas" });
                  }}
                >
                  送入画布
                </button>
                <button type="button" className="studio-ghost" onClick={() => { setClipUrl(url); goMode("extract"); }}>
                  抽帧
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="bp-stage">
            <p className="studio-hint">还没有成片。写镜头描述，点绿色按钮即可。</p>
          </div>
        )}
        {mine.length ? (
          <>
            <p className="bp-examples-title">我的成片</p>
            <div className="bp-examples">
              {mine.map((item) => (
                <button key={item.id} type="button" className={url === item.urls[0] ? "is-active" : undefined} onClick={() => item.urls[0] && setUrl(item.urls[0])}>
                  <video src={item.urls[0]} muted />
                  <span>
                    {item.title}
                    <br />
                    {item.model}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <p className="bp-examples-title">参考样片（点一下只带提示词，不是当前模型成片）</p>
        <div className="bp-examples">
          {seeds.length ? seeds.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.prompt) setPrompt(item.prompt);
              }}
            >
              <video src={item.urls[0]} muted />
              <span>
                {item.title}
                <br />
                参考 · {item.model}
              </span>
            </button>
          )) : (
            <p className="studio-hint">当前模型没有匹配的参考样片。点生成才会出你选的模型的成片。</p>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
