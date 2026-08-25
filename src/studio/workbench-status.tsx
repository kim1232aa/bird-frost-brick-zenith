"use client";

import { useEffect, useState } from "react";

export function WorkbenchStatus({
  busy,
  error,
  done,
  idle = "点左侧生成，进度会出现在这里",
}: {
  busy: string;
  error?: string;
  done?: string;
  idle?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000))), 200);
    return () => window.clearInterval(timer);
  }, [busy]);

  const state = busy ? "run" : error ? "err" : done ? "ok" : "idle";
  const label = busy ? "生成中" : error ? "失败" : done ? "完成" : "就绪";
  const detail = busy || error || done || idle;

  return (
    <div className={`bp-status is-${state}`} data-state={state} role="status" aria-live="polite">
      <span className="bp-status-dot" aria-hidden />
      <b>{label}</b>
      <span>{detail}</span>
      {busy ? <em>{elapsed}s</em> : null}
    </div>
  );
}

export function StageOverlay({ busy }: { busy: string }) {
  if (!busy) return null;
  return (
    <div className="bp-overlay">
      <span className="bp-spinner" aria-hidden />
      <p>{busy}</p>
    </div>
  );
}
