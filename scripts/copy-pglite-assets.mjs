import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const destDir = join(root, ".vercel/output/functions/__server.func/_libs");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

if (!existsSync(destDir)) {
  console.warn("[pglite-assets] vercel function dir missing, skip");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const name of files) {
  const from = join(srcDir, name);
  const to = join(destDir, name);
  if (!existsSync(from)) {
    console.warn(`[pglite-assets] missing ${from}`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`[pglite-assets] copied ${name}`);
}
