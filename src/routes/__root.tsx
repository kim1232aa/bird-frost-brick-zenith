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
      { name: "theme-color", content: "#0B0B0F" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
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
