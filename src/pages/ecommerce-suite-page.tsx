"use client";

import { useMemo, useState } from "react";
import { useStudioSession } from "@/studio/session";
import { composeEcommercePrompt, ECOMMERCE_PACKS } from "@/studio/ecommerce-packs";
import { generateStudioImage } from "@/studio/generate/image";
import { useStudioHistory } from "@/studio/history";
import { useMembershipStore } from "@/studio/membership";
import { CompactModelSelect } from "@/studio/model-select";
import { STUDIO_ROUTES } from "@/studio/wiring";

type ShotState = { status: "idle" | "running" | "done" | "error"; url?: string; error?: string; note: string };

export function EcommerceSuitePage() {
  const relays = useStudioSession((state) => state.relays);
  const addHistory = useStudioHistory((state) => state.add);
  const record = useMembershipStore((state) => state.record);
  const [packId, setPackId] = useState("amazon");
  const [product, setProduct] = useState("matte ceramic coffee mug");
  const [reference, setReference] = useState("");
  const [mode, setMode] = useState<"batch" | "single">("single");
  const [selection, setSelection] = useState(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
  const pack = useMemo(() => ECOMMERCE_PACKS.find((item) => item.id === packId) || ECOMMERCE_PACKS[0], [packId]);
  const [shots, setShots] = useState<Record<string, ShotState>>({});

  const patch = (id: string, next: Partial<ShotState>) =>
    setShots((current) => {
      const prev = current[id] ?? { status: "idle" as const, note: "", error: "" };
      return { ...current, [id]: { ...prev, ...next } };
    });

  const generateOne = async (shotId: string) => {
    const shot = pack.shots.find((item) => item.id === shotId);
    if (!shot) return;
    patch(shot.id, { status: "running", error: "" });
    try {
      const extra = shots[shot.id]?.note || "";
      const [providerId, model] = selection.split("::");
      const result = await generateStudioImage({
        relays,
        prompt: `${composeEcommercePrompt(product, shot)}${extra ? ` Extra direction: ${extra}` : ""}`,
        imageUrl: reference || undefined,
        providerId,
        model,
        size: selection.includes("volcengine") ? "2K" : undefined,
      });
      patch(shot.id, { status: "done", url: result.url });
      record("image");
      addHistory({ kind: "ecommerce", title: `${pack.label} · ${shot.label}`, prompt: product, model: result.model, urls: [result.url] });
    } catch (err) {
      patch(shot.id, { status: "error", error: err instanceof Error ? err.message : "失败" });
    }
  };

  const generatePack = async () => {
    if (mode === "batch") {
      for (const shot of pack.shots) await generateOne(shot.id);
      return;
    }
    await generateOne(pack.shots[0].id);
  };

  return (
    <div className="studio-split ecommerce">
      <aside className="studio-form">
        <h1>电商套图</h1>
        <p className="studio-hint">上传描述或参考后选平台方案。每张镜头可单独重拍，不必整套重来。</p>
        <label>
          ① 产品
          <textarea rows={4} value={product} onChange={(event) => setProduct(event.target.value)} placeholder="描述产品" />
        </label>
        <label>
          参考图（可选）
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
        </label>
        <CompactModelSelect kind="image" value={selection} onChange={setSelection} />
        <label>
          ② 平台方案
          <select value={packId} onChange={(event) => setPackId(event.target.value)}>
            {ECOMMERCE_PACKS.map((item) => (
              <option key={item.id} value={item.id}>{item.label} · {item.shots.length} 张</option>
            ))}
          </select>
        </label>
        <div className="studio-seg">
          <button type="button" className={mode === "batch" ? "is-active" : undefined} onClick={() => setMode("batch")}>连续套图</button>
          <button type="button" className={mode === "single" ? "is-active" : undefined} onClick={() => setMode("single")}>独立高清</button>
        </div>
        <button type="button" className="studio-primary" onClick={() => void generatePack()}>
          {mode === "batch" ? `生成整套 ${pack.shots.length}` : "生成当前镜头"}
        </button>
      </aside>
      <section className="shot-board">
        <header>
          <strong>分镜台</strong>
          <span>{pack.shots.length} 个镜头</span>
        </header>
        <div className="shot-grid">
          {pack.shots.map((shot, index) => {
            const state = shots[shot.id] || { status: "idle", note: "" };
            return (
              <article key={shot.id} className="shot-card">
                <div className="shot-index">{index + 1}</div>
                {state.url ? <img src={state.url} alt={shot.label} /> : <div className="shot-empty">{state.status === "running" ? "生成中" : "待生成"}</div>}
                <div className="shot-body">
                  <b>{shot.label}</b>
                  <p>{shot.prompt}</p>
                  <input
                    value={state.note}
                    placeholder="补充要求"
                    onChange={(event) => patch(shot.id, { note: event.target.value })}
                  />
                  <div className="shot-actions">
                    <button type="button" onClick={() => void generateOne(shot.id)}>{state.url ? "重拍" : "生成"}</button>
                    {state.url ? (
                      <a href={state.url} download={`${shot.label}.jpg`} target="_blank" rel="noreferrer">下载</a>
                    ) : null}
                  </div>
                  {state.error ? <p className="studio-error">{state.error}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
