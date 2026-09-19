import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { worksStorageDir } from "./works-path";

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

const OWNER = "studio";

async function fs() {
  const [{ mkdir, readFile, writeFile, unlink }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const dir = join(worksStorageDir(), "canvases");
  await mkdir(dir, { recursive: true });
  return { mkdir, readFile, writeFile, unlink, join, dir };
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
  async (): Promise<StoredCanvasProject[]> => {
    try {
      await ensureTable();
      const sql = await getSql();
      const rows = await sql.query<{ data_json: string }>(
        "select data_json from studio_canvases where owner = $1 order by updated_at desc limit 100",
        [OWNER],
      );
      if (rows && rows.length > 0) {
        return rows
          .map((r) => {
            try {
              return JSON.parse(r.data_json) as StoredCanvasProject;
            } catch {
              return null;
            }
          })
          .filter((item): item is StoredCanvasProject => Boolean(item && item.id));
      }
    } catch {
      /* fallback to disk */
    }

    try {
      const io = await fs();
      const [{ readdir }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
      const files = await readdir(io.dir);
      const items: StoredCanvasProject[] = [];
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        try {
          const content = await io.readFile(join(io.dir, file), "utf8");
          const parsed = JSON.parse(content) as StoredCanvasProject;
          if (parsed?.id) items.push(parsed);
        } catch {
          // ignore corrupted file
        }
      }
      return items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    } catch {
      return [];
    }
  },
);

export const saveServerCanvas = createServerFn({ method: "POST" })
  .validator((d: StoredCanvasProject) => d)
  .handler(async ({ data }) => {
    if (!data || !data.id) return { ok: false };
    const json = JSON.stringify(data);

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
    } catch {
      // ignore sql fallback
    }

    try {
      const io = await fs();
      await io.writeFile(io.join(io.dir, `${data.id}.json`), json, "utf8");
    } catch {
      // ignore fs fallback
    }

    return { ok: true };
  },
);

export const deleteServerCanvases = createServerFn({ method: "POST" })
  .validator((d: { ids: string[] }) => d)
  .handler(async ({ data }) => {
    const ids = Array.isArray(data?.ids) ? data.ids.filter(Boolean) : [];
    if (ids.length === 0) return { ok: true };

    try {
      await ensureTable();
      const sql = await getSql();
      await sql.query("delete from studio_canvases where owner = $1 and id = any($2::text[])", [OWNER, ids]);
    } catch {
      // ignore
    }

    try {
      const io = await fs();
      for (const id of ids) {
        try {
          await io.unlink(io.join(io.dir, `${id}.json`));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    return { ok: true };
  },
);
