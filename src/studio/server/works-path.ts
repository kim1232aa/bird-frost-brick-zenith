import { existsSync } from "node:fs";
import { join } from "node:path";

export function worksStorageDir(cwd = process.cwd()) {
  const vercelStatic = join(cwd, ".vercel", "output", "static", "works");
  if (existsSync(join(cwd, ".vercel", "output", "static")) || existsSync(vercelStatic)) {
    return vercelStatic;
  }
  const staticDir = join(cwd, "static");
  if (existsSync(staticDir) || cwd.replaceAll("\\", "/").endsWith("/.vercel/output")) {
    return join(cwd, "static", "works");
  }
  return join(cwd, "public", "works");
}

export function worksStorageDirs(cwd = process.cwd()) {
  const dirs: string[] = [];
  const vercelStatic = join(cwd, ".vercel", "output", "static");
  if (existsSync(vercelStatic) || existsSync(join(vercelStatic, "works"))) {
    dirs.push(join(vercelStatic, "works"));
  }
  const staticDir = join(cwd, "static");
  if (existsSync(staticDir) || cwd.replaceAll("\\", "/").endsWith("/.vercel/output")) {
    dirs.push(join(cwd, "static", "works"));
  }
  dirs.push(join(cwd, "public", "works"));
  return Array.from(new Set(dirs));
}

export function worksFilePath(name: string, cwd = process.cwd()) {
  const safe = String(name || "").replace(/^\/+/, "").replace(/\\/g, "/");
  if (!safe || safe.includes("/") || safe.includes("..")) return "";
  for (const dir of worksStorageDirs(cwd)) {
    const full = join(dir, safe);
    if (existsSync(full)) return full;
  }
  return join(worksStorageDir(cwd), safe);
}
