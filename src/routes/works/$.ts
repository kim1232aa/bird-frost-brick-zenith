// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { worksStorageDirs } from "@/studio/server/works-path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".json": "application/json; charset=utf-8",
};

export const Route = createFileRoute("/works/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = params._splat || "";
        const filename = decodeURIComponent(raw).replace(/^\/+/, "");
        if (!filename || filename.includes("..") || filename.includes("/")) {
          return new Response("Not Found", { status: 404 });
        }
        const dirs = worksStorageDirs();
        let filePath = "";
        for (const dir of dirs) {
          const candidate = join(dir, filename);
          if (existsSync(candidate)) {
            filePath = candidate;
            break;
          }
        }
        if (!filePath) {
          return new Response("File Not Found", { status: 404 });
        }

        const stat = statSync(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        const range = request.headers.get("range");
        if (range && stat.size > 0) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunksize = end - start + 1;
          const stream = createReadStream(filePath, { start, end });
          return new Response(stream as any, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(chunksize),
              "Content-Type": contentType,
            },
          });
        }

        const stream = createReadStream(filePath);
        return new Response(stream as any, {
          status: 200,
          headers: {
            "Content-Length": String(stat.size),
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
