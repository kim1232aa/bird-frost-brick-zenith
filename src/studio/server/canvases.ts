import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { worksStorageDir } from "./works-path.ts";

export type StoredCanvasProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: any[];
  connections: any[];
  chatSessions: any[];
  activeChatId: string | null;
  backgroundMode: string;
  showImageInfo: boolean;
  viewport: { x: number; y: number; k: number };
};

/** List payload: metadata plus a cheap cover/count summary. No nodes, connections, or chats. */
export type CanvasListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  connectionCount: number;
  cover: { storageKey?: string; content?: string } | null;
  detailLoaded: false;
};

type CanvasMetaRow = {
  id: string;
  title: string;
  updated_at: Date | string;
};

function asListItem(
  row: CanvasMetaRow,
  summary: { createdAt?: string; nodeCount: number; connectionCount: number; cover: CanvasListItem["cover"] },
): CanvasListItem | null {
  if (!row?.id) return null;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || "");
  return {
    id: row.id,
    title: row.title || "",
    createdAt: summary.createdAt || updatedAt,
    updatedAt,
    nodeCount: summary.nodeCount,
    connectionCount: summary.connectionCount,
    cover: summary.cover,
    detailLoaded: false,
  };
}

type CanvasFileSummary = {
  createdAt?: string;
  nodeCount: number;
  connectionCount: number;
  cover: CanvasListItem["cover"];
};

const EMPTY_FILE_SUMMARY: CanvasFileSummary = { nodeCount: 0, connectionCount: 0, cover: null };

/** Cover and counts from the start of the on-disk JSON. Stops before chat history. */
async function readCanvasFileSummary(id: string): Promise<CanvasFileSummary> {
  if (!id) return EMPTY_FILE_SUMMARY;
  try {
    const io = await fs();
    const handle = await io.open(io.join(io.dir, `${id}.json`), "r");
    try {
      const stat = await handle.stat();
      const length = Math.min(stat.size, 256 * 1024);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);
      return summarizeCanvasHead(buffer.toString("utf8"));
    } finally {
      await handle.close();
    }
  } catch {
    return EMPTY_FILE_SUMMARY;
  }
}

function summarizeCanvasHead(head: string): CanvasFileSummary {
  const createdAt = matchJsonString(head, "createdAt");
  const nodeSlice = jsonArrayAfterKey(head, "nodes") || "";
  const connectionSlice = jsonArrayAfterKey(head, "connections") || "";
  const storageKey = matchJsonString(nodeSlice, "storageKey");
  const content = firstImageContent(nodeSlice);
  return {
    createdAt,
    nodeCount: countJsonObjects(nodeSlice),
    connectionCount: countJsonObjects(connectionSlice),
    cover: storageKey || content ? { storageKey, content } : null,
  };
}

/** The `[...]` that follows `"key"`, or null when the array runs past the scanned head. */
function jsonArrayAfterKey(source: string, key: string) {
  const keyAt = source.indexOf(`"${key}"`);
  if (keyAt < 0) return null;
  const arrayStart = source.indexOf("[", keyAt);
  if (arrayStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (char === "]" && depth === 0) return source.slice(arrayStart, i + 1);
    }
  }
  return null;
}

function matchJsonString(source: string, key: string) {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(source);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function firstImageContent(nodeSlice: string) {
  const marker = '"type":"image"';
  const spaced = '"type": "image"';
  const at = nodeSlice.indexOf(marker) >= 0 ? nodeSlice.indexOf(marker) : nodeSlice.indexOf(spaced);
  if (at < 0) return undefined;
  return matchJsonString(nodeSlice.slice(at, at + 4_000), "content");
}

function countJsonObjects(slice: string) {
  const arrayStart = slice.indexOf("[");
  if (arrayStart < 0) return 0;
  let depth = 0;
  let count = 0;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < slice.length; i += 1) {
    const char = slice[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") {
      if (depth === 1) count += 1;
      depth += 1;
    } else if (char === "}") depth = Math.max(0, depth - 1);
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth <= 0) break;
    }
  }
  return count;
}

function projectFromFile(parsed: StoredCanvasProject): CanvasListItem | null {
  if (!parsed?.id) return null;
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const coverNode = nodes.find((item) => item?.type === "image" && (item.metadata?.storageKey || item.metadata?.content));
  return asListItem(
    { id: parsed.id, title: parsed.title || "", updated_at: parsed.updatedAt || "" },
    {
      createdAt: parsed.createdAt,
      nodeCount: nodes.length,
      connectionCount: Array.isArray(parsed.connections) ? parsed.connections.length : 0,
      cover: coverNode
        ? { storageKey: coverNode.metadata?.storageKey, content: coverNode.metadata?.content }
        : null,
    },
  );
}

const OWNER = "studio";

async function fs() {
  const [{ mkdir, open, readFile, writeFile, unlink }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const dir = join(worksStorageDir(), "canvases");
  await mkdir(dir, { recursive: true });
  return { mkdir, open, readFile, writeFile, unlink, join, dir };
}

async function ensureTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists studio_canvases (
      id text primary key,
      owner text not null default 'studio',
      title text not null default '',
      data_json text not null,
      updated_at timestamp with time zone not null default now()
    )
  `);
}

export const listServerCanvases = createServerFn({ method: "GET" }).handler(
  async (): Promise<CanvasListItem[]> => {
    let sqlError: unknown = null;
    try {
      await ensureTable();
      const sql = await getSql();
      const rows = await sql.query<CanvasMetaRow>(
        "select id, title, updated_at from studio_canvases where owner = $1 order by updated_at desc limit 100",
        [OWNER],
      );
      if (rows && rows.length > 0) {
        const items = await Promise.all(
          rows.map(async (row) => asListItem(row, await readCanvasFileSummary(row.id))),
        );
        return items.filter((item): item is CanvasListItem => Boolean(item));
      }
    } catch (err) {
      sqlError = err;
    }

    try {
      const io = await fs();
      const [{ readdir }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      const files = await readdir(io.dir);
      const items: CanvasListItem[] = [];
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        try {
          const content = await io.readFile(join(io.dir, file), "utf8");
          const parsed = projectFromFile(JSON.parse(content) as StoredCanvasProject);
          if (parsed) items.push(parsed);
        } catch {
          // ignore corrupted file
        }
      }
      return items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    } catch (fsError) {
      // An empty list here would look like "this account has no canvases" and the
      // next client write would overwrite the server copy. Fail loudly instead.
      const sqlMsg = sqlError instanceof Error ? sqlError.message : String(sqlError);
      const fsMsg = fsError instanceof Error ? fsError.message : String(fsError);
      throw new Error(`读取画布失败：数据库读取失败 (${sqlMsg}) 且磁盘读取失败 (${fsMsg})`);
    }
  },
);

async function readCanvasFile(id: string): Promise<StoredCanvasProject | null> {
  const io = await fs();
  try {
    const content = await io.readFile(io.join(io.dir, `${id}.json`), "utf8");
    const parsed = JSON.parse(content) as StoredCanvasProject;
    return parsed?.id ? parsed : null;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

/** Full canvas graph. Called only when a workspace is opened, never from the list. */
export const getServerCanvas = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<StoredCanvasProject | null> => {
    const canvasId = String(id || "").trim();
    if (!canvasId) return null;
    let sqlError: unknown = null;
    try {
      await ensureTable();
      const sql = await getSql();
      const rows = await sql.query<{ data_json: string }>(
        "select data_json from studio_canvases where owner = $1 and id = $2 limit 1",
        [OWNER, canvasId],
      );
      const raw = rows?.[0]?.data_json;
      if (raw) {
        const parsed = JSON.parse(raw) as StoredCanvasProject;
        if (parsed?.id) return parsed;
      }
    } catch (err) {
      sqlError = err;
    }
    try {
      return await readCanvasFile(canvasId);
    } catch (fsError) {
      const sqlMsg = sqlError instanceof Error ? sqlError.message : String(sqlError ?? "未找到记录");
      const fsMsg = fsError instanceof Error ? fsError.message : String(fsError);
      throw new Error(`读取画布失败：数据库读取失败 (${sqlMsg}) 且磁盘读取失败 (${fsMsg})`);
    }
  });

export async function loadServerCanvasById(id: string): Promise<StoredCanvasProject | null> {
  return getServerCanvas({ data: id });
}

async function sanitizeCanvasProject(project: StoredCanvasProject): Promise<StoredCanvasProject> {
  if (!project || !Array.isArray(project.nodes)) return project;
  const [{ writeFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const worksDir = worksStorageDir();

  const cleanedNodes = await Promise.all(
    project.nodes.map(async (node) => {
      if (!node || typeof node !== "object") return node;
      const clone = { ...node };
      const metadata = clone.metadata && typeof clone.metadata === "object" ? { ...clone.metadata } : undefined;

      // 检查 base64 自动落盘为物理文件
      const autoPersistBase64 = async (val: any): Promise<string> => {
        if (typeof val === "string" && val.startsWith("data:image/")) {
          try {
            const match = val.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
            if (match) {
              const ext = match[1] === "jpeg" ? "jpg" : match[1];
              const filename = `media-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
              const filePath = join(worksDir, filename);
              const buffer = Buffer.from(match[2], "base64");
              await writeFile(filePath, buffer);
              return `/works/${filename}`;
            }
          } catch {}
        }
        return val;
      };

      if (metadata) {
        if (metadata.content) metadata.content = await autoPersistBase64(metadata.content);
        if (metadata.source) metadata.source = await autoPersistBase64(metadata.source);
        clone.metadata = metadata;
      }
      return clone;
    }),
  );

  return { ...project, nodes: cleanedNodes };
}

export const saveServerCanvas = createServerFn({ method: "POST" })
  .validator((d: StoredCanvasProject) => d)
  .handler(async ({ data }) => {
    if (!data || !data.id) return { ok: false, error: "缺少画布数据或画布标识" };
    const cleaned = await sanitizeCanvasProject(data);
    const json = JSON.stringify(cleaned);

    let sqlSuccess = false;
    let sqlError: unknown = null;
    try {
      await ensureTable();
      const sql = await getSql();
      await sql.query(
        `insert into studio_canvases (id, owner, title, data_json, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (id) do update set
           title = excluded.title,
           data_json = excluded.data_json,
           updated_at = now()`,
        [data.id, OWNER, data.title || "无限画布", json],
      );
      sqlSuccess = true;
    } catch (err) {
      sqlError = err;
    }

    let fsSuccess = false;
    let fsError: unknown = null;
    try {
      const io = await fs();
      await io.writeFile(io.join(io.dir, `${data.id}.json`), json, "utf8");
      fsSuccess = true;
    } catch (err) {
      fsError = err;
    }

    if (!sqlSuccess && !fsSuccess) {
      const sqlMsg = sqlError instanceof Error ? sqlError.message : String(sqlError);
      const fsMsg = fsError instanceof Error ? fsError.message : String(fsError);
      return {
        ok: false,
        error: `保存画布失败：数据库写入失败 (${sqlMsg}) 且磁盘写入失败 (${fsMsg})`,
      };
    }

    return { ok: true };
  },
);

export const deleteServerCanvases = createServerFn({ method: "POST" })
  .validator((d: { ids: string[] }) => d)
  .handler(async ({ data }) => {
    const ids = Array.isArray(data?.ids) ? data.ids.filter(Boolean) : [];
    if (ids.length === 0) return { ok: true };

    let sqlSuccess = false;
    let sqlError: unknown = null;
    try {
      await ensureTable();
      const sql = await getSql();
      await sql.query("delete from studio_canvases where owner = $1 and id = any($2::text[])", [OWNER, ids]);
      sqlSuccess = true;
    } catch (err) {
      sqlError = err;
    }

    let fsSuccess = false;
    let fsError: unknown = null;
    try {
      const io = await fs();
      for (const id of ids) {
        try {
          await io.unlink(io.join(io.dir, `${id}.json`));
        } catch (err: any) {
          if (err && err.code === "ENOENT") {
            // 文件不存在视为已经删除成功
          } else {
            throw err;
          }
        }
      }
      fsSuccess = true;
    } catch (err) {
      fsError = err;
    }

    if (!sqlSuccess && !fsSuccess) {
      const sqlMsg = sqlError instanceof Error ? sqlError.message : String(sqlError);
      const fsMsg = fsError instanceof Error ? fsError.message : String(fsError);
      return {
        ok: false,
        error: `删除画布失败：数据库删除失败 (${sqlMsg}) 且磁盘删除失败 (${fsMsg})`,
      };
    }

    return { ok: true };
  },
);
