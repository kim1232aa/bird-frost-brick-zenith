import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { StudioRuntime } from "@/studio/runtime";
import { StudioShell } from "@/shell/StudioShell";
import appCss from "../styles.css?url";

const APP_NAME = "无界创作台";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: "无界创作台：在无限画布上组织文本、图片、视频与生成工作流。" },
      { name: "theme-color", content: "#00C758" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  errorComponent: ({ error }) => (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#f7f5f1", color: "#1c1917", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 520, margin: "12vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>本站页面崩了</h1>
          <p style={{ color: "#57534e", lineHeight: 1.6 }}>这是站点自己的异常，不是上游模型返回。把下面原文留下来。</p>
          <pre style={{ color: "#1c1917", fontSize: 13, whiteSpace: "pre-wrap" }}>{error instanceof Error ? error.message : String(error)}</pre>
          <p>
            <a href="/image" style={{ color: "#00c758" }}>
              去生图
            </a>
          </p>
        </div>
      </body>
    </html>
  ),
  component: () => (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <StudioRuntime>
            <StudioShell>
              <Outlet />
            </StudioShell>
          </StudioRuntime>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
