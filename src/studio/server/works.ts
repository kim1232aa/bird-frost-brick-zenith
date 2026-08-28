import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
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

type WorkRow = {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  model: string;
  urls_json: string;
  created_at: string;
};

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

function asKind(value: string): StoredWork["kind"] {
  if (value === "video" || value === "story" || value === "ecommerce") return value;
  return "image";
}

function asItem(row: WorkRow): StoredWork {
  const created = Date.parse(row.created_at);
  return {
    id: row.id,
    kind: asKind(row.kind),
    title: row.title || "未命名",
    prompt: row.prompt || "",
    model: row.model || "",
    urls: parseUrls(row.urls_json),
    createdAt: Number.isFinite(created) ? created : Date.now(),
  };
}

export const listStudioWorks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql.query<WorkRow>(
      "select id, kind, title, prompt, model, urls_json, created_at::text as created_at from studio_works where user_id = $1 order by created_at desc limit 80",
      [context.userId],
    );
    return rows.map(asItem);
  });

export const saveStudioWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((value: StoredWork) => ({
    id: String(value?.id || "").trim(),
    kind: asKind(String(value?.kind || "image")),
    title: String(value?.title || "").slice(0, 120),
    prompt: String(value?.prompt || "").slice(0, 8000),
    model: String(value?.model || "").slice(0, 120),
    urls: Array.isArray(value?.urls) ? value.urls.filter((item) => typeof item === "string").slice(0, 8) : [],
    createdAt: typeof value?.createdAt === "number" ? value.createdAt : Date.now(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.id || !data.urls[0]) return { ok: false as const };
    const sql = await getSql();
    await sql.query(
      `insert into studio_works (id, user_id, kind, title, prompt, model, urls_json, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
       on conflict (id) do update set
         title = excluded.title,
         prompt = excluded.prompt,
         model = excluded.model,
         urls_json = excluded.urls_json
       where studio_works.user_id = excluded.user_id`,
      [data.id, context.userId, data.kind, data.title, data.prompt, data.model, JSON.stringify(data.urls), data.createdAt],
    );
    return { ok: true as const };
  });

export const deleteStudioWork = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((value: { id: string }) => ({ id: String(value?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!data.id) return { ok: false as const };
    const sql = await getSql();
    await sql.query("delete from studio_works where id = $1 and user_id = $2", [data.id, context.userId]);
    return { ok: true as const };
  });
