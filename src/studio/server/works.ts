import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

export type StoredWork = {
  id: string;
  kind: "image" | "video" | "story" | "ecommerce";
  title: string;
  prompt: string;
  model: string;
  urls: string[];
  createdAt: number;
};

const OWNER = "studio";

function asKind(value: string): StoredWork["kind"] {
  if (value === "video" || value === "story" || value === "ecommerce") return value;
  return "image";
}

function parseUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

async function fs() {
  const [{ mkdir, readFile, writeFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const dir = join(process.cwd(), "public", "works");
  const manifest = join(dir, "manifest.json");
  return { mkdir, readFile, writeFile, join, dir, manifest };
}

async function readManifest(): Promise<StoredWork[]> {
  try {
    const io = await fs();
    const raw = JSON.parse(await io.readFile(io.manifest, "utf8")) as { items?: StoredWork[] };
    return Array.isArray(raw.items) ? raw.items.filter((item) => item?.id && item.urls?.[0]) : [];
  } catch {
    return [];
  }
}

async function writeManifest(items: StoredWork[]) {
  try {
    const io = await fs();
    await io.mkdir(io.dir, { recursive: true });
    await io.writeFile(io.manifest, JSON.stringify({ items: items.slice(0, 80) }, null, 2));
  } catch {
    /* preview disk is enough; serverless may be read-only */
  }
}

function extOf(kind: string, mime: string, url: string) {
  if (kind === "video" || mime.includes("mp4") || url.includes(".mp4")) return "mp4";
  if (mime.includes("jpeg") || mime.includes("jpg") || url.startsWith("data:image/jpeg") || url.includes(".jpg")) return "jpg";
  if (mime.includes("webp") || url.startsWith("data:image/webp")) return "webp";
  return "png";
}

async function materialize(id: string, index: number, kind: string, url: string) {
  if (!url) return "";
  if (url.startsWith("/works/") || url.startsWith("/gallery/")) return url;
  let bytes: Buffer | null = null;
  let mime = "";
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return url;
      mime = match[1];
      bytes = Buffer.from(match[2], "base64");
    } else if (/^https?:\/\//i.test(url)) {
      const response = await fetch(url);
      if (!response.ok) return url;
      mime = response.headers.get("content-type") || "";
      bytes = Buffer.from(await response.arrayBuffer());
    }
  } catch {
    return url;
  }
  if (!bytes?.length) return url;
  try {
    const io = await fs();
    const ext = extOf(kind, mime, url);
    const name = `${id}-${index}.${ext}`;
    await io.mkdir(io.dir, { recursive: true });
    await io.writeFile(io.join(io.dir, name), bytes);
    return `/works/${name}`;
  } catch {
    return url;
  }
}

async function upsertDb(item: StoredWork) {
  try {
    const sql = await getSql();
    await sql.query(
      `insert into studio_works (id, user_id, kind, title, prompt, model, urls_json, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
       on conflict (id) do update set
         title = excluded.title,
         prompt = excluded.prompt,
         model = excluded.model,
         urls_json = excluded.urls_json`,
      [item.id, OWNER, item.kind, item.title, item.prompt, item.model, JSON.stringify(item.urls), item.createdAt],
    );
  } catch {
    /* file manifest is the durable copy in preview */
  }
}

async function listDb(): Promise<StoredWork[]> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{
      id: string;
      kind: string;
      title: string;
      prompt: string;
      model: string;
      urls_json: string;
      created_at: string;
    }>(
      "select id, kind, title, prompt, model, urls_json, created_at::text as created_at from studio_works where user_id = $1 order by created_at desc limit 80",
      [OWNER],
    );
    return rows.map((row) => ({
      id: row.id,
      kind: asKind(row.kind),
      title: row.title || "未命名",
      prompt: row.prompt || "",
      model: row.model || "",
      urls: parseUrls(row.urls_json),
      createdAt: Date.parse(row.created_at) || Date.now(),
    }));
  } catch {
    return [];
  }
}

export const listStudioWorks = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const seen = new Set<string>();
    const out: StoredWork[] = [];
    for (const item of [...(await listDb()), ...(await readManifest())]) {
      if (!item.id || seen.has(item.id) || !item.urls?.[0]) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 80);
  } catch {
    return [];
  }
});

export const saveStudioWork = createServerFn({ method: "POST" })
  .validator((value: StoredWork) => ({
    id: String(value?.id || "").trim(),
    kind: asKind(String(value?.kind || "image")),
    title: String(value?.title || "").slice(0, 120),
    prompt: String(value?.prompt || "").slice(0, 8000),
    model: String(value?.model || "").slice(0, 120),
    urls: Array.isArray(value?.urls) ? value.urls.filter((item) => typeof item === "string").slice(0, 8) : [],
    createdAt: typeof value?.createdAt === "number" ? value.createdAt : Date.now(),
  }))
  .handler(async ({ data }) => {
    try {
      if (!data.id || !data.urls[0]) return { ok: false as const, item: null };
      const urls = [];
      for (const [index, url] of data.urls.entries()) {
        urls.push(await materialize(data.id, index, data.kind, url));
      }
      const item: StoredWork = { ...data, urls: urls.filter(Boolean) };
      if (!item.urls[0]) return { ok: false as const, item: null };
      const current = await readManifest();
      await writeManifest([item, ...current.filter((row) => row.id !== item.id)]);
      await upsertDb(item);
      return { ok: true as const, item };
    } catch {
      return { ok: false as const, item: null };
    }
  });

export const deleteStudioWork = createServerFn({ method: "POST" })
  .validator((value: { id: string }) => ({ id: String(value?.id || "").trim() }))
  .handler(async ({ data }) => {
    try {
      if (!data.id) return { ok: false as const };
      const current = await readManifest();
      await writeManifest(current.filter((row) => row.id !== data.id));
      const sql = await getSql();
      await sql.query("delete from studio_works where id = $1 and user_id = $2", [data.id, OWNER]);
    } catch {
      /* ignore */
    }
    return { ok: true as const };
  });
