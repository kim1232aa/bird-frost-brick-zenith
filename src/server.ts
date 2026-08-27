import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";

const inner = createStartHandler(defaultStreamHandler);

export type ServerEntry = { fetch: RequestHandler<Register> };

function wantsHtml(request: Request) {
  return (request.headers.get("accept") || "").includes("text/html");
}

function isAbortLike(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string; name?: string };
  };
  const code = record.code || record.cause?.code || "";
  const name = record.name || record.cause?.name || "";
  const message = `${record.message || ""} ${record.cause?.message || ""}`;
  return (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ABORT_ERR" ||
    name === "AbortError" ||
    /aborted|abort/i.test(message)
  );
}

function isUnhandledHttpErrorJson(text: string) {
  try {
    const payload = JSON.parse(text) as { status?: number; unhandled?: boolean; message?: string };
    return payload?.unhandled === true && payload?.message === "HTTPError";
  } catch {
    return false;
  }
}

function recoveryHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>无界创作台</title>
    <style>
      html,body{margin:0;min-height:100%;background:#f4f2ed;color:#44403c;font-family:"DM Sans","Noto Sans SC",sans-serif}
      main{min-height:100vh;display:grid;place-items:center;padding:24px}
      section{max-width:28rem;text-align:center}
      h1{margin:0 0 8px;font-size:20px}
      p{margin:0 0 16px;color:#78716c;font-size:14px;line-height:1.6}
      a{color:#00C758;text-decoration:none;margin:0 8px}
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>正在重新打开画布</h1>
        <p>刚才这次加载被中途掐掉，不是画布数据坏了。马上自动重试。</p>
        <p><a href="/canvas/home">回画布库</a><a href="javascript:location.reload()">立即重试</a></p>
      </section>
    </main>
    <script>
      (function () {
        try {
          var key = "boundless-canvas-retry";
          var n = Number(sessionStorage.getItem(key) || 0);
          if (n >= 2) {
            sessionStorage.removeItem(key);
            location.replace("/canvas/home");
            return;
          }
          sessionStorage.setItem(key, String(n + 1));
        } catch (e) {}
        setTimeout(function () {
          location.replace(location.pathname + location.search + location.hash);
        }, 500);
      })();
    </script>
  </body>
</html>`;
}

async function wrapFetch(...args: Parameters<RequestHandler<Register>>) {
  const request = args[0];
  try {
    const response = await inner(...args);
    if (response.status !== 500) return response;
    const text = await response.clone().text();
    if (!isUnhandledHttpErrorJson(text)) return response;
    if (wantsHtml(request)) {
      return new Response(recoveryHtml(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (isAbortLike(error) || request.signal.aborted) {
      if (wantsHtml(request)) {
        return new Response(recoveryHtml(), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return new Response(null, { status: 204 });
    }
    if (wantsHtml(request)) {
      return new Response(recoveryHtml(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    throw error;
  }
}

export default {
  fetch: wrapFetch,
} satisfies ServerEntry;
