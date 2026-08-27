"use client";

import { useMemo, useState } from "react";
import { createZip } from "@/lib/zip";
import { useStudioSession } from "@/studio/session";
import { composeEcommercePrompt, ECOMMERCE_PACKS, ECOMMERCE_SCENES } from "@/studio/ecommerce-packs";
import { generateStudioImage } from "@/studio/generate/image";
import { useStudioHistory } from "@/studio/history";
import { useMembershipStore } from "@/studio/membership";
import { preferredImageKey, StudioModelField } from "@/studio/model-select";
import { useOpsStore } from "@/studio/ops";
import { WorkbenchStatus } from "@/studio/workbench-status";

type ShotState = { status: "idle" | "running" | "done" | "error"; url?: string; error?: string; note: string };

export function EcommerceSuitePage() {
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const record = useMembershipStore((state) => state.record);
  const remaining = useOpsStore((state) => state.credits.image);
  const [packId, setPackId] = useState("amazon");
  const [sceneId, setSceneId] = useState<(typeof ECOMMERCE_SCENES)[number]["id"]>("solid");
  const [product, setProduct] = useState("");
  const [reference, setReference] = useState("");
  const [selection, setSelection] = useState(preferredImageKey());
  const pack = useMemo(() => ECOMMERCE_PACKS.find((item) => item.id === packId) || ECOMMERCE_PACKS[0], [packId]);
  const [shots, setShots] = useState<Record<string, ShotState>>({});
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [batch, setBatch] = useState(true);

  const doneCount = pack.shots.filter((shot) => shots[shot.id]?.url).length;
  const history = items.filter((item) => item.kind === "ecommerce").slice(0, 8);

  const patch = (id: string, next: Partial<ShotState>) =>
    setShots((current) => {
      const prev = current[id] ?? { status: "idle" as const, note: "", error: "" };
      return { ...current, [id]: { ...prev, ...next } };
    });

  const generateOne = async (shotId: string) => {
    const shot = pack.shots.find((item) => item.id === shotId);
    if (!shot) return;
    if (!product.trim()) {
      setError("先写产品描述，或上传一张商品参考图。");
      return;
    }
    patch(shot.id, { status: "running", error: "" });
    setError("");
    try {
      const extra = shots[shot.id]?.note || "";
      const [providerId, model] = selection.split("::");
      const result = await generateStudioImage({
        relays,
        prompt: `${composeEcommercePrompt(product, shot, sceneId, packId)}${extra ? ` Extra direction: ${extra}` : ""}`,
        imageUrl: reference || undefined,
        providerId,
        model,
        size: selection.includes("volcengine") ? "2K" : undefined,
      });
      patch(shot.id, { status: "done", url: result.url });
      record("image");
      addHistory({ kind: "ecommerce", title: `${pack.label} · ${shot.label}`, prompt: product, model: result.model, urls: [result.url] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patch(shot.id, { status: "error", error: message });
      setError(message);
    }
  };

  const generatePack = async () => {
    if (!product.trim()) {
      setError("先写产品描述，或上传一张商品参考图。");
      return;
    }
    setError("");
    for (let i = 0; i < pack.shots.length; i += 1) {
      setProgress(`${i}/${pack.shots.length} 生成中 · ${pack.shots[i].label}`);
      await generateOne(pack.shots[i].id);
    }
    setProgress(`${pack.shots.length}/${pack.shots.length} 已完成`);
  };

  const downloadZip = async () => {
    const files = [];
    for (const shot of pack.shots) {
      const url = shots[shot.id]?.url;
      if (!url) continue;
      const res = await fetch(`/client-api/fetch-url?url=${encodeURIComponent(url)}`);
      files.push({ name: `${shot.id}-${shot.label}.png`, data: await res.arrayBuffer() });
    }
    if (!files.length) {
      setError("还没有可打包的成片");
      return;
    }
    const blob = await createZip(files);
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${pack.id}-suite.zip`;
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="bp-page">
      <header className="bp-hero">
        <p className="studio-kicker">ECOMMERCE</p>
        <h1>电商套图</h1>
        <p>上传商品图，选场景模板和平台方案，一次出 4–9 张，再打包 ZIP。</p>
      </header>
      <p className="alert-banner">商品参考图越清楚，套图越稳。没有图也可以先用文字描述试布局。走你选的生图模型，每张成功扣 1 点。</p>
      <div className="bench">
      <aside className="bench-side">
        <p className="studio-kicker">ECOMMERCE</p>
        <h1>电商套图</h1>
        <p className="studio-hint">上传商品图，选场景模板和平台方案，一次出 4–9 张，再打包 ZIP。</p>
        <label className="dropzone">
          <span>① 商品参考图（必填更稳）</span>
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
          {reference ? <img src={reference} alt="" className="ref-thumb" /> : <small>点这里上传单张商品图</small>}
        </label>
        <label>
          产品描述
          <textarea rows={3} value={product} onChange={(event) => setProduct(event.target.value)} placeholder="材质、颜色、卖点，例如：哑光陶瓷马克杯，米白色，旮logo" />
        </label>
        <p className="studio-kicker">② 场景模板</p>
        <div className="chip-row">
          {ECOMMERCE_SCENES.map((item) => (
            <button key={item.id} type="button" className={sceneId === item.id ? "is-active" : undefined} onClick={() => setSceneId(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="studio-kicker">② 出片方式</p>
        <div className="chip-row">
          <button type="button" className={batch ? "is-active" : undefined} onClick={() => setBatch(true)}>
            连续套图 · {pack.shots.length} 张
          </button>
          <button type="button" className={!batch ? "is-active" : undefined} onClick={() => setBatch(false)}>
            独立高清
          </button>
        </div>
        <StudioModelField kind="image" value={selection} onChange={setSelection} label="生图模型" />
        <label>
          ③ 平台方案
          <select value={packId} onChange={(event) => setPackId(event.target.value)}>
            {ECOMMERCE_PACKS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.shots.length} 张
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="bp-generate bp-generate-image"
          disabled={Boolean(progress.includes("生成中")) || !product.trim()}
          onClick={() => void generatePack()}
        >
          <span>{progress.includes("生成中") ? progress : `生成整套 ${pack.shots.length}`}</span>
          <small>{!product.trim() ? "请先填写产品描述" : progress.includes("生成中") ? progress : `${pack.shots.length} 张 · 成功各扣 1 点 · 剩余 ${remaining}`}</small>
        </button>
        <button type="button" className="studio-ghost" disabled={!doneCount} onClick={() => void downloadZip()}>
          打包 ZIP（{doneCount}/{pack.shots.length}）
        </button>
        {progress ? <p className="studio-hint">{progress}</p> : null}
        {error ? <p className="studio-error" role="alert">{error}</p> : null}
      </aside>
      <section className="bench-main story-board">
        <header className="story-logline">
          <p className="studio-kicker">分镜台</p>
          <h2>
            {pack.label} · {ECOMMERCE_SCENES.find((item) => item.id === sceneId)?.label} · {doneCount}/{pack.shots.length} 已完成
          </h2>
        </header>
        <WorkbenchStatus
          busy={progress.includes("生成中") ? progress : ""}
          error={error}
          done={doneCount ? `${doneCount}/${pack.shots.length} 张已出` : ""}
          idle="生成套图时，这里会显示第几张、是否完成"
        />
        <div className="shot-grid">
          {pack.shots.map((shot, index) => {
            const state = shots[shot.id] || { status: "idle", note: "" };
            return (
              <article key={shot.id} className="shot-card">
                {state.url ? <img src={state.url} alt={shot.label} /> : <div className="shot-empty">{state.status === "running" ? "生成中…" : `${index + 1}. ${shot.label}`}</div>}
                <div className="shot-body">
                  <b>
                    {index + 1}. {shot.label}
                  </b>
                  <input value={state.note} placeholder="这张的补充要求" onChange={(event) => patch(shot.id, { note: event.target.value })} />
                  <div className="shot-actions">
                    <button type="button" onClick={() => void generateOne(shot.id)}>
                      {state.url ? "重拍" : "生成"}
                    </button>
                    {state.url ? (
                      <a href={state.url} download={`${shot.label}.jpg`} target="_blank" rel="noreferrer">
                        下载
                      </a>
                    ) : null}
                  </div>
                  {state.error ? <p className="studio-error" role="alert">{state.error}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
        <div>
          <p className="studio-kicker">历史套图</p>
          <div className="bench-gallery">
            {history.length ? (
              history.map((item) => (
                <article key={item.id} className="bench-card">
                  {item.urls[0] ? <img src={item.urls[0]} alt="" /> : <div className="shot-empty" />}
                  <div>
                    <b>{item.title}</b>
                    <small>{item.model}</small>
                  </div>
                </article>
              ))
            ) : (
              <p className="studio-hint">生成后会出现在这里，也可到创作记录回看。</p>
            )}
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
