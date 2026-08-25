"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog } from "@/studio/catalog";
import { generateStudioImage } from "@/studio/generate/image";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { useMembershipStore } from "@/studio/membership";
import { useOpsStore } from "@/studio/ops";
import { ModelSwitcher } from "@/studio/model-switcher";
import { CompactModelSelect, preferredTextKey } from "@/studio/model-select";
import { IMAGE_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";
import { STUDIO_ROUTES } from "@/studio/wiring";

const ASPECTS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
};

export function ImageStudioPage() {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.image);
  const record = useMembershipStore((state) => state.record);
  const [prompt, setPrompt] = useState(IMAGE_TEMPLATES[0].prompt);
  const [negative, setNegative] = useState("");
  const [selection, setSelection] = useState(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [mode, setMode] = useState<"t2i" | "i2i">("t2i");
  const [quality, setQuality] = useState<"eco" | "std" | "hq">("std");
  const [aspect, setAspect] = useState("1:1");
  const [size, setSize] = useState("2K");
  const [seed, setSeed] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const next = queryParam("model");
    if (next) setSelection(next);
  }, []);

  const card = findCatalog(selection);
  const isArk = /volcengine|seedream/i.test(selection);
  const isCivitai = selection.includes("civitai");
  const isGpt = /gpt-image/i.test(selection);
  const recent = useMemo(
    () => [...items.filter((item) => item.kind === "image" && item.urls[0]), ...GALLERY_SEED.filter((item) => item.kind === "image")].slice(0, 12),
    [items],
  );

  useEffect(() => {
    if (isArk) setSize(quality === "hq" ? "3K" : "2K");
  }, [quality, isArk]);

  const dims = useMemo(() => {
    const base = ASPECTS[aspect] || ASPECTS["1:1"];
    const scale = quality === "eco" ? 0.75 : quality === "hq" ? 1.25 : 1;
    return { width: Math.round(base.w * scale), height: Math.round(base.h * scale) };
  }, [aspect, quality]);

  const generate = async () => {
    const { providerId, model } = splitModel(selection);
    setBusy("提交生图…");
    setError("");
    try {
      const result = await generateStudioImage({
        relays,
        prompt,
        providerId,
        model,
        size: isArk ? size : isGpt ? (quality === "hq" ? "1536x1536" : "1024x1024") : undefined,
        width: isCivitai ? dims.width : undefined,
        height: isCivitai ? dims.height : undefined,
        seed: isCivitai && seed ? Number(seed) : undefined,
        imageUrl: mode === "i2i" && reference ? reference : undefined,
        negativePrompt: negative || undefined,
      });
      setUrl(result.url);
      record("image");
      addHistory({ kind: "image", title: prompt.slice(0, 40), prompt, model: result.model, urls: [result.url] });
      setBusy("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生图失败");
      setBusy("");
    }
  };

  const polish = async () => {
    setBusy("润色提示词…");
    setError("");
    try {
      const next = await enhancePrompt({ relays, prompt, textModel, kind: "image" });
      setPrompt(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "润色失败");
    } finally {
      setBusy("");
    }
  };

  const sendCanvas = () => {
    dropToCanvas({ kind: url ? "image" : "prompt", url: url || undefined, prompt, model: selection, text: prompt });
    void navigate({ to: "/canvas" });
  };

  return (
    <div className="bench">
      <aside className="bench-side">
        <ModelSwitcher kind="image" value={selection} onChange={setSelection} />
        <div className="studio-seg">
          <button type="button" className={mode === "t2i" ? "is-active" : undefined} onClick={() => setMode("t2i")}>
            文生图
          </button>
          <button type="button" className={mode === "i2i" ? "is-active" : undefined} onClick={() => setMode("i2i")}>
            图生图
          </button>
        </div>
        {mode === "i2i" ? (
          <label className="dropzone">
            <span>参考图 · 拖入或点击上传</span>
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
            {reference ? <img src={reference} alt="" className="ref-thumb" /> : <small>图生图会把这张图作为构图参考</small>}
          </label>
        ) : null}
        <label>
          提示词
          <textarea rows={7} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="prompt-tools">
          <CompactModelSelect kind="text" value={textModel} onChange={setTextModel} label="文本模型（润色）" />
          <button type="button" className="studio-ghost" disabled={Boolean(busy)} onClick={() => void polish()}>
            润色提示词
          </button>
          <span>{prompt.length} 字</span>
        </div>
        <div className="chip-row">
          {IMAGE_TEMPLATES.map((item) => (
            <button key={item.label} type="button" onClick={() => setPrompt(item.prompt)}>
              {item.label}
            </button>
          ))}
        </div>
        <section className="param-block">
          <p className="studio-kicker">参数 · 随模型切换</p>
          <label>
            质量档
            <div className="studio-seg">
              {(["eco", "std", "hq"] as const).map((item) => (
                <button key={item} type="button" className={quality === item ? "is-active" : undefined} onClick={() => setQuality(item)}>
                  {item === "eco" ? "经济" : item === "hq" ? "高质" : "标准"}
                </button>
              ))}
            </div>
          </label>
          {isArk ? (
            <label>
              分辨率（火山官方 size）
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="2K">2K</option>
                <option value="3K">3K</option>
              </select>
            </label>
          ) : null}
          {isCivitai ? (
            <>
              <label>
                画幅
                <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
                  {Object.keys(ASPECTS).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <p className="studio-hint">
                {dims.width} × {dims.height}
              </p>
              <label>
                Seed（官方 metadata 可复现）
                <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="可选" />
              </label>
              <label>
                负向提示词
                <input value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="可选" />
              </label>
            </>
          ) : null}
          {isGpt ? <p className="studio-hint">GPT Image 走 Images API。高质档约 1536，标准 1024。</p> : null}
          {!isArk && !isCivitai && !isGpt ? <p className="studio-hint">该模型使用官方默认分辨率。可上传参考图走图生图。</p> : null}
        </section>
        <div className="spec-box">
          {card?.nsfw ? "NSFW / mature 允许" : "安全档"} · {card?.cost} · {card?.wired ? "已接线" : "待接线"} · 剩余 {remaining} 点
          <br />
          {card?.docs}
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
          {busy && !url ? <div className="studio-placeholder">{busy}</div> : null}
          {url ? <img src={url} alt={prompt} /> : !busy ? <div className="studio-placeholder">结果出在这里。下面是已实测样张，可点开回填提示词。</div> : null}
        </div>
        {url ? (
          <div className="result-actions">
            <a className="studio-ghost" href={url} download="studio.png" target="_blank" rel="noreferrer">
              下载
            </a>
            <button type="button" className="studio-ghost" onClick={() => void generate()}>
              再生成
            </button>
            <button
              type="button"
              className="studio-ghost"
              onClick={() => {
                setReference(url);
                setMode("i2i");
              }}
            >
              用作参考
            </button>
            <button type="button" className="studio-ghost" onClick={sendCanvas}>
              送入画布
            </button>
          </div>
        ) : null}
        <div className="bench-gallery">
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              className="bench-card"
              onClick={() => {
                if (item.urls[0]) setUrl(item.urls[0]);
                if (item.prompt) setPrompt(item.prompt);
              }}
            >
              <img src={item.urls[0]} alt={item.title} />
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
