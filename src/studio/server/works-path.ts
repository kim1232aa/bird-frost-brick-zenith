import { existsSync } from "node:fs";
import { join } from "node:path";

export function worksStorageDir(cwd = process.cwd()) {
  const normalized = cwd.replaceAll("\\", "/");
  const staticDir = join(cwd, "static");
  // Nitro vercel preview cwd is `.vercel/output`; srvx serves `--static ./static`.
  // Local vite still serves `public/`. Writing to the unserved tree made /works 404.
  if (existsSync(staticDir) || normalized.endsWith("/.vercel/output")) {
    return join(cwd, "static", "works");
  }
  return join(cwd, "public", "works");
}

export function worksStorageDirs(cwd = process.cwd()) {
  const primary = worksStorageDir(cwd);
  const extra = join(cwd, "static", "works");
  return extra === primary ? [primary] : [primary, extra];
}

export function worksFilePath(name: string, cwd = process.cwd()) {
  const safe = String(name || "").replace(/^\/+/, "").replace(/\\/g, "/");
  if (!safe || safe.includes("/") || safe.includes("..")) return "";
  return join(worksStorageDir(cwd), safe);
}
