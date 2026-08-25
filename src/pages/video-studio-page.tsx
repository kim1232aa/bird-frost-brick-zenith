"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog, catalogKey } from "@/studio/catalog";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { useMembershipStore } from "@/studio/membership";
import { liveCatalog, useOpsStore } from "@/studio/ops";
import { preferredTextKey, preferredVideoKey } from "@/studio/model-select";
import { VIDEO_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";
import { StageOverlay, WorkbenchStatus } from "@/studio/workbench-status";

export function VideoStudioPage() {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.video);
  const record = useMembershipStore((state) => state.record);
  const [selection, setSelection] = useState(preferredVideoKey());
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [prompt, setPrompt] = useState(VIDEO_TEMPLATES[0].prompt);
  const [duration, setDuration] = useState(6);
  const [ratio, setRatio] = useState("16:9");
  const [reference, setReference] = useState("");
  const [audio, setAudio] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const next = queryParam("model");
    if (next) setSelection(next);
  }, []);

  useEffect(() => {
    const allowed = liveCatalog("video", true).map((item) => catalogKey(item));
    if (selection && allowed.length && !allowed.includes(selection)) setSelection(preferredVideoKey());
  }, [selection]);

  const card = findCatalog(selection);
  const models = liveCatalog("video", true);
  const groups = useMemo(() => {
    const map = new Map<string, typeof models>();
    for (const item of models) {
      const list = map.get(item.provider) || [];
      list.push(item);
      map.set(item.provider, list);
    }
    return [...map.entries()];
  }, [models]);
  const isArk = /volcengine|seedance/i.test(selection);
  const recent = useMemo(
    () => [...items.filter((item) => item.kind === "video" && item.urls[0]), ...GALLERY_SEED.filter((item) => item.kind === "video")],
    [items],
  );

  const generate = async () => {
    const { providerId, model } = splitModel(selection);
    setBusy("提交任务…");
    setError("");
    try {
      const created = await createStudioVideo({
        relays,
        prompt,
        duration,
        aspectRatio: ratio,
        providerId,
        model,
        imageUrl: reference || undefined,
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
      setBusy("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频生成失败";
      if (message.includes("eligible")) {
        setError("Grok 视频额度暂时用尽。这条接线之前已经出过片，样片在右侧可播。");
      } else if (/cloudflare|403/i.test(message)) {
        setError("Grok 中转被 Cloudflare 拦截。请改用 Civitai LTX 2.3，或稍后再试。");
      } else {
        setError(message);
      }
      setBusy("");
    }
  };

  return (
    <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">生视频</p>
        <h1>文生视频 / 首帧驱动</h1>
        <label className="dropzone">
          <span>首帧（可选）</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setReference(String(reader.result || ""));
              reader.readAsDataURL(file);
            }}
          />
          {reference ? <img src={reference} alt="" className="ref-thumb" /> : <small>不上传则走文生视频</small>}
        </label>
        <label>
          提示词
          <textarea rows={7} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述镜头运动、主体和气氛" />
        </label>
        <p className="bp-count">必填 · {prompt.length} / 20000</p>
        <div className="prompt-tools">
          <button type="button" className="studio-ghost" disabled={Boolean(busy)} onClick={() =>
              void enhancePrompt({ relays, prompt, textModel, kind: "video" })
                .then(setPrompt)
                .catch((err) => setError(err instanceof Error ? err.message : "润色失败"))
            }
          >
            润色提示词
          </button>
        </div>
        <div className="chip-row">
          {VIDEO_TEMPLATES.map((item) => (
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
        {isArk ? (
          <label className="flow-check">
            <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
            生成原声
          </label>
        ) : null}
        <div className="bp-cta">
          <p className="studio-hint">
            {card?.verified ? "已实测可出片" : "这条没有实测过，不会出现在生成菜单"} · {card?.nsfw ? "NSFW 允许" : "安全档"} · 剩余 {remaining}
          </p>
          <button type="button" className="studio-primary" disabled={Boolean(busy) || !prompt.trim()} onClick={() => void generate()}>
            {busy ? `生成中 · ${busy}` : "生成视频"}
          </button>
          {error ? <p className="studio-error">{error}</p> : null}
        </div>
      </aside>
      <section className="bp-right">
        <header className="bp-bar">
          <div>
            <p className="studio-kicker">可跑视频模型 · {models.length}</p>
            <strong>{card?.model}</strong>
            <span className="studio-hint"> {card?.provider}</span>
          </div>
        </header>
        <div className="bp-models" data-testid="video-models">
          {groups.map(([provider, list]) => (
            <div key={provider} className="bp-model-group">
              <p>{provider}</p>
              <div>
                {list.map((item) => {
                  const key = catalogKey(item);
                  return (
                    <button key={key} type="button" className={key === selection ? "is-on" : undefined} onClick={() => setSelection(key)}>
                      <b>{item.model}</b>
                      <span>
                        {item.verified ? "已实测" : "未实测"}
                        {item.nsfw ? " · NSFW" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="bp-params">
          <div className="studio-seg">
            {[4, 5, 6, 8, 10].map((item) => (
              <button key={item} type="button" className={duration === item ? "is-active" : undefined} onClick={() => setDuration(item)}>
                {item}s
              </button>
            ))}
          </div>
          <div className="studio-seg">
            {["16:9", "9:16", "1:1"].map((item) => (
              <button key={item} type="button" className={ratio === item ? "is-active" : undefined} onClick={() => setRatio(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <WorkbenchStatus
          busy={busy}
          error={error}
          done={url ? `${card?.label || "模型"} 已出片` : ""}
          idle="右侧会显示生成中 / 完成 / 失败"
        />
        <div className="bp-stage">
          {url ? <video src={url} controls autoPlay loop /> : <p className="studio-hint">{busy ? "" : "视频出在这里。样片可点开播放。"}</p>}
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
          </div>
        ) : null}
        <div className="bp-gallery">
          {recent.map((item) => (
            <button key={item.id} type="button" className={url === item.urls[0] ? "is-active" : undefined} onClick={() => item.urls[0] && setUrl(item.urls[0])}>
              {item.kind === "video" ? <video src={item.urls[0]} muted /> : <img src={item.urls[0]} alt="" />}
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
