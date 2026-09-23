import { createFileRoute } from "@tanstack/react-router";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { STUDIO_PROVIDERS } from "@/studio/wiring";

function getCatalogCacheFile(): string {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }); } catch {}
  }
  return join(dir, "catalog-cache.json");
}

export const Route = createFileRoute("/client-api/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const forceRefresh = url.searchParams.get("refresh") === "true";
        const cacheFile = getCatalogCacheFile();

        if (!forceRefresh && existsSync(cacheFile)) {
          try {
            const content = readFileSync(cacheFile, "utf-8");
            const parsed = JSON.parse(content);
            return Response.json({ ok: true, cached: true, ...parsed });
          } catch (err) {
            // cache corrupt, fallback to rebuild
          }
        }

        // Build catalog snapshot
        const catalogSnapshot = {
          providers: STUDIO_PROVIDERS,
          updatedAt: new Date().toISOString(),
        };

        try {
          writeFileSync(cacheFile, JSON.stringify(catalogSnapshot, null, 2), "utf-8");
        } catch {}

        return Response.json({ ok: true, cached: false, ...catalogSnapshot });
      },
    },
  },
});
