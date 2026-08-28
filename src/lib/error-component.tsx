import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const raw = error.message || "";
  const aborted = /HTTPError|aborted|ECONNRESET/i.test(raw);
  const missingChunk = /Failed to fetch dynamically imported module/i.test(raw);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f2ed] px-6 text-center text-stone-800">
      <span className="text-amber-600" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">
        {aborted ? "这一页没加载完" : missingChunk ? "这一页脚本没加载到" : "这一页出了问题"}
      </h1>
      <p className="max-w-md text-sm leading-6 text-stone-500">
        {aborted
          ? "加载被中途打断，不是画布数据坏了。点下面回到画布库，再打开项目。"
          : missingChunk
            ? "多半是发布后的缓存还在用旧文件。点立即重试拉新脚本，或先去生图。"
            : raw || "请回画布库后重试。"}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link to="/image" className="text-[#00C758]">
          去生图
        </Link>
        <Link to="/canvas/home" className="text-[#00C758]">
          回画布库
        </Link>
        <button
          type="button"
          className="text-stone-700"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("_r", String(Date.now()));
            window.location.replace(url.toString());
          }}
        >
          立即重试
        </button>
      </div>
    </main>
  );
}
