import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { createSerializedManifestUpdater, parseManifestItems } from "./works-manifest.ts";
import { worksStorageDir, worksStorageDirs } from "./works-path.ts";

// NOTE: do not re-export works-path helpers here — this module is imported by
// client code for its createServerFn RPC stubs, and any re-export would drag
// node:fs into the browser bundle (Vite externalizes and throws on access).

export type StoredWork = {
  id: string;
  kind: "image" | "video" | "story" | "ecommerce";
  title: string;
  prompt: string;
  model: string;
  /** Public provider id only; never persist a key or credential here. */
  providerId?: string;
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
  const [{ mkdir, readFile, writeFile, rename, unlink }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const dir = worksStorageDir();
  const manifest = join(dir, "manifest.json");
  return { mkdir, readFile, writeFile, rename, unlink, join, dir, manifest };
}

function isStoredWork(value: unknown): value is StoredWork {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredWork>;
  return typeof item.id === "string"
    && item.id.trim().length > 0
    && Array.isArray(item.urls)
    && item.urls.some((url) => typeof url === "string" && url.trim().length > 0);
}

function isMissingFileError(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "ENOENT",
  );
}

async function readManifest(): Promise<StoredWork[]> {
  const io = await fs();
  try {
    return parseManifestItems(await io.readFile(io.manifest, "utf8"), isStoredWork);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function writeManifest(items: StoredWork[]) {
  let temporary = "";
  let io: Awaited<ReturnType<typeof fs>> | undefined;
  try {
    io = await fs();
    const payload = JSON.stringify({ items: items.slice(0, 80) }, null, 2);
    // Dual-write across every served tree (see worksStorageDirs): the primary
    // dir alone is not always the one the dev server / static host serves.
    for (const dir of worksStorageDirs()) {
      await io.mkdir(dir, { recursive: true });
      const manifest = io.join(dir, "manifest.json");
      temporary = `${manifest}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      await io.writeFile(temporary, payload, { encoding: "utf8", flag: "wx" });
      await io.rename(temporary, manifest);
      temporary = "";
    }
    return { ok: true as const };
  } catch (error) {
    if (temporary) await io?.unlink(temporary).catch(() => undefined);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "作品文件索引写入失败",
    };
  }
}

const updateManifest = createSerializedManifestUpdater<StoredWork>(
  readManifest,
  async (items) => {
    const result = await writeManifest(items);
    if (!result.ok) throw new Error(result.error);
  },
);

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
      const response = await fetch(url, { redirect: "follow", headers: { Referer: "" } });
      if (!response.ok) throw new Error(`作品原图下载失败 HTTP ${response.status}`);
      mime = response.headers.get("content-type") || "";
      bytes = Buffer.from(await response.arrayBuffer());
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "作品原图下载失败");
  }
  if (!bytes?.length) throw new Error("作品原图为空，无法落盘");
  const io = await fs();
  const ext = extOf(kind, mime, url);
  const name = `${id}-${index}.${ext}`;
  let written = false;
  for (const dir of worksStorageDirs()) {
    try {
      await io.mkdir(dir, { recursive: true });
      await io.writeFile(io.join(dir, name), bytes);
      written = true;
    } catch {
      /* try the other served tree */
    }
  }
  if (!written) throw new Error(`作品文件未能写入 ${io.dir}`);
  return `/works/${name}`;
}

async function upsertDb(item: StoredWork) {
  try {
    const sql = await getSql();
    await sql.query(
      `insert into studio_works (id, user_id, kind, title, prompt, model, provider_id, urls_json, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))
       on conflict (id) do update set
         title = excluded.title,
         prompt = excluded.prompt,
         model = excluded.model,
         provider_id = excluded.provider_id,
         urls_json = excluded.urls_json`,
      [item.id, OWNER, item.kind, item.title, item.prompt, item.model, item.providerId || "", JSON.stringify(item.urls), item.createdAt],
    );
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "作品数据库索引写入失败",
    };
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
      provider_id?: string;
      urls_json: string;
      created_at: string;
    }>(
      "select id, kind, title, prompt, model, provider_id, urls_json, created_at::text as created_at from studio_works where user_id = $1 order by created_at desc limit 80",
      [OWNER],
    );
    return rows.map((row) => ({
      id: row.id,
      kind: asKind(row.kind),
      title: row.title || "未命名",
      prompt: row.prompt || "",
      model: row.model || "",
      ...(row.provider_id?.trim() ? { providerId: row.provider_id.trim() } : {}),
      urls: parseUrls(row.urls_json),
      createdAt: Date.parse(row.created_at) || Date.now(),
    }));
  } catch {
    return [];
  }
}

export const listStudioWorks = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const [databaseItems, manifestItems] = await Promise.all([
      listDb().catch(() => [] as StoredWork[]),
      readManifest().catch(() => [] as StoredWork[]),
    ]);
    const seen = new Set<string>();
    const out: StoredWork[] = [];
    for (const item of [...databaseItems, ...manifestItems]) {
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
    providerId: String(value?.providerId || "").trim().slice(0, 120) || undefined,
    urls: Array.isArray(value?.urls) ? value.urls.filter((item) => typeof item === "string").slice(0, 8) : [],
    createdAt: typeof value?.createdAt === "number" ? value.createdAt : Date.now(),
  }))
  .handler(async ({ data }) => {
    try {
      if (!data.id || !data.urls[0]) return { ok: false as const, item: null, error: "作品没有可保存的文件" };
      const urls = [];
      for (const [index, url] of data.urls.entries()) {
        urls.push(await materialize(data.id, index, data.kind, url));
      }
      const item: StoredWork = { ...data, urls: urls.filter(Boolean) };
      if (!item.urls[0]) return { ok: false as const, item: null, error: "作品原图为空，无法落盘" };
      const manifestPromise = updateManifest((current) => [item, ...current.filter((row) => row.id !== item.id)]).then(
        () => ({ ok: true as const }),
        (error) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : "作品文件索引写入失败",
        }),
      );
      const [manifestResult, databaseResult] = await Promise.all([manifestPromise, upsertDb(item)]);
      const persistenceFailures = [
        !manifestResult.ok ? `文件索引：${manifestResult.error}` : "",
        !databaseResult.ok ? `数据库索引：${databaseResult.error}` : "",
      ].filter(Boolean);
      if (persistenceFailures.length === 2) {
        return {
          ok: false as const,
          item: null,
          error: `作品文件已保存，但索引均写入失败（${persistenceFailures.join("；")}）`,
        };
      }
      return {
        ok: true as const,
        item,
        ...(persistenceFailures[0] ? { warning: `作品已保存，但${persistenceFailures[0]}` } : {}),
      };
    } catch (err) {
      return { ok: false as const, item: null, error: err instanceof Error ? err.message : "作品未能写入服务器" };
    }
  });

export const deleteStudioWork = createServerFn({ method: "POST" })
  .validator((value: { id: string }) => ({ id: String(value?.id || "").trim() }))
  .handler(async ({ data }) => {
    try {
      if (!data.id) return { ok: false as const };
      await updateManifest((current) => current.filter((row) => row.id !== data.id));
      const sql = await getSql();
      await sql.query("delete from studio_works where id = $1 and user_id = $2", [data.id, OWNER]);
    } catch {
      /* ignore */
    }
    return { ok: true as const };
  });
