# syntax=docker/dockerfile:1
# Boundless Studio test image (Node 22).
# Nitro preset is vercel (vite.config.ts); production output is
# .vercel/output/{static,functions/__server.func}. Vite preview is not a
# production server (https://vite.dev/guide/cli https://vite.dev/guide/static-deploy).
# Runtime uses Nitro's vercel preview command plus srvx --prod:
#   npx srvx --static ../../static ./functions/__server.func/index.mjs
# https://nitro.build/deploy/providers/vercel
# https://srvx.h3.dev/guide/cli
# Health: existing GET /client-api/health — do not add a second health route.
# This image is a local/test SSR+static container, not a Vercel production claim.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Full tree (incl. vite/nitro in devDependencies) for `npm run build`.
# Official npm ci: https://docs.npmjs.com/cli/v10/commands/npm-ci
# --include=dev: do not drop vite/nitro if NODE_ENV=production leaks into this stage.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` = with-app-env vite build + copy-pglite-assets + db:migrate.
# migrate.mjs no-ops when DATABASE_URL is unset (PGLite applies schema at runtime).
# Do not bake DATABASE_URL into this stage: migrate would then hit a live DB
# during image build. Runtime DATABASE_URL is injected at container start.
RUN npm run build \
 && test -f .vercel/output/functions/__server.func/index.mjs \
 && test -d .vercel/output/static

# Nitro/Rolldown vercel output currently emits a circular ESM graph
# (_ssr/ssr.mjs <-> _ssr/ssr2.mjs) and re-exports an unbound ssr_exports.
# Node 22 then 500s every request, including GET /client-api/health:
#   SyntaxError: Export 'ssr_exports' is not defined in module
#   TypeError: __exportAll$1 is not a function
# Patch generated files in this image only. Host .vercel/output is excluded
# by .dockerignore and is never written here.
RUN node --input-type=module <<'PATCH'
import fs from "node:fs";
import path from "node:path";

const ssrDir = ".vercel/output/functions/__server.func/_ssr";
const ssrPath = path.join(ssrDir, "ssr.mjs");
const ssr2Path = path.join(ssrDir, "ssr2.mjs");
if (!fs.existsSync(ssrPath) || !fs.existsSync(ssr2Path)) {
  throw new Error("expected _ssr/ssr.mjs and _ssr/ssr2.mjs after nitro vercel build");
}

let ssr = fs.readFileSync(ssrPath, "utf8");
if (!/\bssr_exports as /.test(ssr)) {
  throw new Error("ssr.mjs no longer re-exports ssr_exports; drop this image patch");
}
if (!ssr.includes('import * as ssr_exports from "./ssr.mjs"')) {
  if (!ssr.startsWith('import "../_runtime.mjs";')) {
    throw new Error("ssr.mjs prefix changed; cannot bind ssr_exports");
  }
  ssr = ssr.replace(
    'import "../_runtime.mjs";\n',
    'import "../_runtime.mjs";\nimport * as ssr_exports from "./ssr.mjs";\n',
  );
  fs.writeFileSync(ssrPath, ssr);
}

let ssr2 = fs.readFileSync(ssr2Path, "utf8");
const importRe = /^import \{([^}]+)\} from "\.\/ssr\.mjs";\n/m;
const importMatch = ssr2.match(importRe);
if (importMatch) {
  const asMatch = importMatch[1].match(/\bas\s+(__exportAll[$\w]*)/);
  const exportAllName = asMatch?.[1];
  if (!exportAllName) {
    throw new Error("ssr2.mjs import from ./ssr.mjs does not bind exportAll; got: " + importMatch[1]);
  }
  const helper =
    "var " + exportAllName + " = (all, no_symbols) => {\n" +
    "	let target = {};\n" +
    "	for (var name in all) Object.defineProperty(target, name, {\n" +
    "		get: all[name],\n" +
    "		enumerable: true\n" +
    "	});\n" +
    "	if (!no_symbols) Object.defineProperty(target, Symbol.toStringTag, { value: \"Module\" });\n" +
    "	return target;\n" +
    "};\n";
  ssr2 = ssr2.replace(importMatch[0], helper);
  fs.writeFileSync(ssr2Path, ssr2);
} else if (!/\bvar __exportAll[$\w]* =/.test(ssr2)) {
  throw new Error("ssr2.mjs does not import ./ssr.mjs; drop or update this image patch");
}

const ssrAfter = fs.readFileSync(ssrPath, "utf8");
const ssr2After = fs.readFileSync(ssr2Path, "utf8");
if (!ssrAfter.includes('import * as ssr_exports from "./ssr.mjs"')) {
  throw new Error("ssr.mjs patch did not bind ssr_exports");
}
if (/from "\.\/ssr\.mjs"/.test(ssr2After)) {
  throw new Error("ssr2.mjs still imports ./ssr.mjs after cycle break");
}
console.log("patched circular SSR graph in _ssr/ssr.mjs and _ssr/ssr2.mjs");
PATCH

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    VITE_AUTH_ENABLED=false
# Nitro vercel output is self-contained except srvx (CLI + static middleware).
# Copy only the function bundle, static assets, and the srvx package used by
# nitro.json commands.preview — not the full source tree or build node_modules.
COPY --from=build --chown=node:node /app/.vercel/output /app/.vercel/output
COPY --from=build --chown=node:node /app/node_modules/srvx /app/node_modules/srvx
USER node
WORKDIR /app/.vercel/output
EXPOSE 8080
# Nitro vercel preview (nitro.json) + srvx --prod so the CLI does not --watch.
# --prod also enables gracefulShutdown (srvx CLI). Bind via PORT/HOST.
# Absolute srvx path: WORKDIR is /app/.vercel/output, so ../../node_modules
# would resolve to /node_modules. npx is avoided (may prompt/fetch).
CMD ["node", "/app/node_modules/srvx/bin/srvx.mjs", "--prod", "--static", "/app/.vercel/output/static", "/app/.vercel/output/functions/__server.func/index.mjs"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/client-api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
