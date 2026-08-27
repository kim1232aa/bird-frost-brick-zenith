import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const raw = error.message || "";
  const aborted = /HTTPError|aborted|ECONNRESET/i.test(raw);

  useEffect(() => {
    if (!aborted) return;
    const key = "boundless-canvas-retry";
    let n = 0;
    try {
      n = Number(sessionStorage.getItem(key) || 0);
    } catch {
      n = 0;
    }
    if (n >= 2) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      window.location.replace("/canvas/home");
      return;
    }
    try {
      sessionStorage.setItem(key, String(n + 1));
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => window.location.reload(), 500);
    return () => window.clearTimeout(timer);
  }, [aborted]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f2ed] px-6 text-center text-stone-800">
      <span className="text-amber-600" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">{aborted ? "正在重新打开画布" : "这一页出了问题"}</h1>
      <p className="max-w-md text-sm leading-6 text-stone-500">
        {aborted
          ? "刚才这次加载被中途掐掉，不是画布坏了。正在自动重试。"
          : raw || "请回画布库后重试。"}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link to="/canvas/home" className="text-[#00C758]">
          回画布库
        </Link>
        <button type="button" className="text-stone-700" onClick={() => window.location.reload()}>
          立即重试
        </button>
      </div>
    </main>
  );
}
