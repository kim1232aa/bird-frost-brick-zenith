import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Dev-only /works static serving straight from disk.
 *
 * `server.watch.ignored` excludes both works trees so a generation save can no
 * longer full-reload the page mid-flow — but Vite only serves publicDir files
 * its watcher registered, so ignoring the trees also hides every NEW work.
 * This middleware closes the gap: try public/works then static/works on every
 * request, before Vite's cached publicDir middleware runs. Supports HTTP Range
 * so <video> playback works.
 */
function worksStaticDevPlugin(): Plugin {
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".json": "application/json; charset=utf-8",
  };
  return {
    name: "app-builder:works-static-dev",
    apply: "serve",
    configureServer(server) {
      const roots = [join(server.config.root, "public", "works"), join(server.config.root, "static", "works")];
      server.middlewares.use("/works", (req, res, next) => {
        try {
          const rawName = decodeURIComponent((req.url || "").split("?")[0] || "").replace(/^\/+/, "");
          if (!rawName || rawName.includes("..") || rawName.includes("/")) {
            next();
            return;
          }
          const file = roots.map((root) => join(root, rawName)).find((candidate) => existsSync(candidate));
          if (!file) {
            next();
            return;
          }
          const size = statSync(file).size;
          const type = types[extname(file).toLowerCase()] || "application/octet-stream";
          res.setHeader("content-type", type);
          res.setHeader("cache-control", "no-cache");
          res.setHeader("accept-ranges", "bytes");
          const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
          if (range && (range[1] || range[2])) {
            const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
            const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
            if (start >= size || start > end) {
              res.statusCode = 416;
              res.setHeader("content-range", `bytes */${size}`);
              res.end();
              return;
            }
            res.statusCode = 206;
            res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
            res.setHeader("content-length", end - start + 1);
            createReadStream(file, { start, end }).pipe(res);
            return;
          }
          res.setHeader("content-length", size);
          createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

/**
 * Live-preview OAuth popup — handled HERE so the agent never has to create a
 * `/auth/popup` route (and cannot break it by scaffolding a React page that
 * paints the full app shell in the popup).
 *
 * `signIn` (client.ts) opens `/auth/popup?providerId=…` in a top-level window.
 * This middleware runs before TanStack Start, calls `handleAuthPopupRequest`,
 * and returns the 302 / completion HTML. Deployed apps do not use the popup
 * (full-page OAuth redirect), so `apply: "serve"` is enough.
 */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      // Register immediately (not in a returned post-hook) so we run BEFORE
      // TanStack Start / the SPA HTML fallback. A model-authored
      // `src/routes/auth/popup.tsx` React page must never win this path.
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          if (pathOnly !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const host = String(
            req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080",
          );
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          // Ensure Host is the public preview host so Better Auth's dynamic
          // baseURL / redirect_uri match the popup origin.
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);

          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: "GET",
            headers: requestHeaders,
          });

          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          // Preserve multiple Set-Cookie headers (OAuth state + session).
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    watch: {
      // Works are generated artifacts dual-written into public/works and
      // static/works at runtime. Without this ignore, every save triggers a
      // Vite full-reload that wipes in-flight story-board state mid-flow
      // (cards losing freshly generated stills, occasional blank page).
      ignored: ["**/public/works/**", "**/static/works/**"],
    },
    warmup: {
      clientFiles: [
        "./src/pages/boundless-canvas-home.tsx",
        "./src/pages/boundless-canvas-workspace.tsx",
        "./src/app/canvas/home/page.tsx",
        "./src/app/canvas/workspace/canvas-client-page.tsx",
      ],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  define: {
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify("1.1.0"),
    "process.env.NEXT_PUBLIC_DOC_URL": JSON.stringify(""),
    "process.env.NEXT_PUBLIC_DEV_BACKEND": JSON.stringify(""),
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@": resolve(__dirname, "src"),
      "next/navigation": resolve(__dirname, "src/compat/next-navigation.ts"),
      "next/link": resolve(__dirname, "src/compat/next-link.tsx"),
      "next/image": resolve(__dirname, "src/compat/next-image.tsx"),
    },
  },
  plugins: [
    worksStaticDevPlugin(),
    pgliteBootstrapPlugin(),
    // Before tanstackStart so /auth/popup never falls through to the SPA.
    authPopupPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
