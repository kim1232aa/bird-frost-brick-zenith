"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog } from "@/studio/catalog";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { useMembershipStore } from "@/studio/membership";
import { useOpsStore } from "@/studio/ops";
import { ModelSwitcher } from "@/studio/model-switcher";
import { CompactModelSelect, preferredTextKey, preferredVideoKey } from "@/studio/model-select";
import { VIDEO_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";

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

  const card = findCatalog(selection);
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
      setError(message.includes("eligible") ? "Grok 视频额度暂时用尽。这条接线之前已经出过片，样片在右侧可播。" : message);
      setBusy("");
    }
  };

  return (
    <div className="bench">
      <aside className="bench-side">
        <ModelSwitcher kind="video" value={selection} onChange={setSelection} />
        <p className="studio-hint">
          已接线可跑：Grok Imagine（已实测）。火山 Seedance 走 Agent Plan，Small 档会返回未开通。Civitai LTX / Hunyuan 需 Buzz。
        </p>
        <label className="dropzone">
          <span>首帧（可选，图生视频）</span>
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
          <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="prompt-tools">
          <CompactModelSelect kind="text" value={textModel} onChange={setTextModel} label="文本模型（润色）" />
          <button
            type="button"
            className="studio-ghost"
            disabled={Boolean(busy)}
            onClick={() =>
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
            <button key={item.label} type="button" onClick={() => setPrompt(item.prompt)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="ws-row">
          <label>
            时长
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              {[4, 5, 6, 8, 10].map((item) => (
                <option key={item} value={item}>
                  {item}s
                </option>
              ))}
            </select>
          </label>
          <label>
            画幅
            <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
              {["16:9", "9:16", "1:1", "adaptive"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        {isArk ? (
          <label className="flow-check">
            <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
            生成原声（Seedance Agent Plan）
          </label>
        ) : null}
        <div className="spec-box">
          {card?.nsfw ? "NSFW 允许" : "安全档"} · {card?.cost} · {card?.wired ? "已接线" : "待接线"} · 剩余 {remaining} 点
          <br />
          {card?.blurb}
        </div>
        <div className="bench-cta">
          <button type="button" className="studio-primary" disabled={Boolean(busy) || !prompt.trim()} onClick={() => void generate()}>
            {busy || `用 ${card?.model || "当前模型"} 生成`}
          </button>
          {error ? <p className="studio-error">{error}</p> : null}
        </div>
      </aside>
      <section className="bench-main">
        <div className="bench-result">
          {url ? (
            <video src={url} controls autoPlay loop />
          ) : (
            <div className="studio-placeholder">{busy || "视频出在这里。已实测的 Grok Imagine 样片可点开播放。"}</div>
          )}
        </div>
        {url ? (
          <div className="result-actions">
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
        <div className="bench-gallery">
          {recent.map((item) => (
            <button key={item.id} type="button" className="bench-card" onClick={() => item.urls[0] && setUrl(item.urls[0])}>
              {item.kind === "video" ? <video src={item.urls[0]} muted /> : <img src={item.urls[0]} alt="" />}
              <div>
                <b>{item.title}</b>
                <small>{item.model}</small>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
