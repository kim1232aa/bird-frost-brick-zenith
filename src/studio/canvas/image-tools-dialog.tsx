"use client";

import { useEffect, useRef, useState } from "react";

export type ImageToolKind = "crop" | "mask" | "angle" | "split";

export function ImageToolsDialog({
  kind,
  url,
  onClose,
  onCrop,
  onMask,
  onAngle,
  onSplit,
}: {
  kind: ImageToolKind;
  url: string;
  onClose: () => void;
  onCrop: (rect: { x: number; y: number; width: number; height: number }) => void;
  onMask: (edit: string) => void;
  onAngle: (params: { yaw: number; pitch: number; distance: number; wide: boolean }) => void;
  onSplit: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0.12, y: 0.12, width: 0.76, height: 0.76 });
  const [edit, setEdit] = useState("");
  const [yaw, setYaw] = useState(25);
  const [pitch, setPitch] = useState(8);
  const [distance, setDistance] = useState(4.8);
  const [wide, setWide] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (kind !== "mask" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
    };
    image.src = url;
  }, [kind, url]);

  const paint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * canvas.width;
    const y = ((event.clientY - box.top) / box.height) * canvas.height;
    ctx.fillStyle = "rgba(255,80,80,0.55)";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(12, canvas.width / 40), 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div className="img-tool">
      <div className="img-tool-card">
        <header>
          <b>{kind === "crop" ? "裁剪图片" : kind === "mask" ? "局部重绘" : kind === "angle" ? "AI 多角度" : "切九宫格"}</b>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        {kind === "crop" ? (
          <>
            <div className="img-tool-stage">
              <img src={url} alt="" />
              <i
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
              />
            </div>
            <label>
              左右 {Math.round(crop.x * 100)}%
              <input type="range" min={0} max={40} value={crop.x * 100} onChange={(event) => setCrop((current) => ({ ...current, x: Number(event.target.value) / 100 }))} />
            </label>
            <label>
              上下 {Math.round(crop.y * 100)}%
              <input type="range" min={0} max={40} value={crop.y * 100} onChange={(event) => setCrop((current) => ({ ...current, y: Number(event.target.value) / 100 }))} />
            </label>
            <label>
              宽度 {Math.round(crop.width * 100)}%
              <input type="range" min={30} max={100} value={crop.width * 100} onChange={(event) => setCrop((current) => ({ ...current, width: Number(event.target.value) / 100 }))} />
            </label>
            <label>
              高度 {Math.round(crop.height * 100)}%
              <input type="range" min={30} max={100} value={crop.height * 100} onChange={(event) => setCrop((current) => ({ ...current, height: Number(event.target.value) / 100 }))} />
            </label>
            <button type="button" className="studio-primary" onClick={() => onCrop(crop)}>
              应用裁剪
            </button>
          </>
        ) : null}
        {kind === "mask" ? (
          <>
            <p className="studio-hint">在图上涂出要改的区域，再写下改成什么。</p>
            <canvas
              ref={canvasRef}
              className="img-tool-paint"
              onPointerDown={(event) => {
                drawing.current = true;
                paint(event);
              }}
              onPointerMove={(event) => drawing.current && paint(event)}
              onPointerUp={() => {
                drawing.current = false;
              }}
            />
            <textarea rows={3} value={edit} onChange={(event) => setEdit(event.target.value)} placeholder="例如：把铜铃改成银色，保持人物不变" />
            <button type="button" className="studio-primary" disabled={!edit.trim()} onClick={() => onMask(edit)}>
              按涂抹区域重绘
            </button>
          </>
        ) : null}
        {kind === "angle" ? (
          <>
            <p className="studio-hint">左侧只预览方向，结果会基于原图重新生成。</p>
            <img src={url} alt="" className="img-tool-preview" style={{ transform: `perspective(600px) rotateY(${-yaw}deg) rotateX(${-pitch}deg)` }} />
            <label>
              左右角度 {yaw}°
              <input type="range" min={-60} max={60} value={yaw} onChange={(event) => setYaw(Number(event.target.value))} />
            </label>
            <label>
              俯仰角度 {pitch}°
              <input type="range" min={-45} max={45} value={pitch} onChange={(event) => setPitch(Number(event.target.value))} />
            </label>
            <label>
              镜头距离 {distance}
              <input type="range" min={1} max={10} step={0.1} value={distance} onChange={(event) => setDistance(Number(event.target.value))} />
            </label>
            <label className="chip-row">
              <button type="button" className={wide ? undefined : "is-active"} onClick={() => setWide(false)}>
                标准
              </button>
              <button type="button" className={wide ? "is-active" : undefined} onClick={() => setWide(true)}>
                广角
              </button>
            </label>
            <button type="button" className="studio-primary" onClick={() => onAngle({ yaw, pitch, distance, wide })}>
              按这个角度生成
            </button>
          </>
        ) : null}
        {kind === "split" ? (
          <>
            <p className="studio-hint">把当前图切成 3×3，在右侧展开成 9 个图片节点。适合九宫格分镜。</p>
            <img src={url} alt="" />
            <button type="button" className="studio-primary" onClick={onSplit}>
              切成 9 个节点
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
