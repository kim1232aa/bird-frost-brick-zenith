"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

export function CanvasRepairPage() {
  const navigate = useNavigate();
  const [log, setLog] = useState("");

  const clear = async () => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && /canvas|infinite-canvas|boundless-studio:canvas/i.test(key)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
    try {
      const { default: localforage } = await import("localforage");
      await localforage.clear();
    } catch {
      /* ignore */
    }
    setLog(`已清理 ${keys.length} 个本机画布键。`);
  };

  return (
    <div className="studio-form" style={{ maxWidth: 560, margin: "48px auto" }}>
      <p className="studio-kicker">REPAIR</p>
      <h1>画布修复</h1>
      <p className="studio-hint">画布库读不出来时才需要这一步。清理的是本机保存的画布项目，不会动顶栏设置里的模型接线。</p>
      <button type="button" className="studio-primary" onClick={() => void clear()}>
        清理本机画布缓存
      </button>
      <button type="button" className="studio-ghost" onClick={() => void navigate({ to: "/canvas/home" })}>
        返回画布库
      </button>
      {log ? <p className="studio-hint">{log}</p> : null}
    </div>
  );
}
