import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import type { Asset } from "@/stores/use-asset-store";

export type StoredAsset = Asset;

const OWNER = "studio";
const ASSET_KINDS = new Set(["text", "image", "video"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAsset(value: unknown): StoredAsset | null {
  if (!isRecord(value)) return null;
  const id = String(value.id || "").trim();
  const kind = String(value.kind || "").trim();
  if (!id || !ASSET_KINDS.has(kind)) return null;
  const data = isRecord(value.data) ? value.data : {};
  const base = {
    id,
    kind: kind as Asset["kind"],
    title: String(value.title || "未命名素材").trim().slice(0, 200),
    coverUrl: String(value.coverUrl || "").trim(),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 50) : [],
    ...(String(value.source || "").trim() ? { source: String(value.source).trim().slice(0, 120) } : {}),
    ...(String(value.note || "").trim() ? { note: String(value.note).trim().slice(0, 2000) } : {}),
    createdAt: String(value.createdAt || new Date().toISOString()),
    updatedAt: String(value.updatedAt || new Date().toISOString()),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };

  if (kind === "text") {
    return { ...base, kind: "text", data: { content: String(data.content || "") } } as StoredAsset;
  }
  if (kind === "video") {
    return {
      ...base,
      kind: "video",
      data: {
        url: String(data.url || "").trim(),
        ...(String(data.storageKey || "").trim() ? { storageKey: String(data.storageKey).trim() } : {}),
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        bytes: Number(data.bytes) || 0,
        mimeType: String(data.mimeType || "video/mp4"),
      },
    } as StoredAsset;
  }
  return {
    ...base,
    kind: "image",
    data: {
      dataUrl: String(data.dataUrl || "").trim(),
      ...(String(data.storageKey || "").trim() ? { storageKey: String(data.storageKey).trim() } : {}),
      width: Number(data.width) || 0,
      height: Number(data.height) || 0,
      bytes: Number(data.bytes) || 0,
      mimeType: String(data.mimeType || "image/png"),
    },
  } as StoredAsset;
}

function parseStoredAsset(dataJson: string) {
  try {
    return normalizeAsset(JSON.parse(dataJson));
  } catch {
    return null;
  }
}

async function ensureTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists studio_assets (
      id text primary key,
      owner text not null default 'studio',
      kind text not null,
      title text not null default '',
      cover_url text not null default '',
      tags_json text not null default '[]',
      source text not null default '',
      note text not null default '',
      data_json text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

export const listServerAssets = createServerFn({ method: "GET" }).handler(async (): Promise<any[]> => {
  await ensureTable();
  const sql = await getSql();
  const rows = await sql.query<{ data_json: string }>(
    "select data_json from studio_assets where owner = $1 order by updated_at desc limit 500",
    [OWNER],
  );
  return rows.map((row) => parseStoredAsset(row.data_json)).filter((asset): asset is StoredAsset => Boolean(asset));
});

export const saveServerAsset = createServerFn({ method: "POST" })
  .validator((value: unknown) => normalizeAsset(value))
  .handler(async ({ data }): Promise<any> => {
    if (!data) return { ok: false as const, error: "素材数据无效" };
    await ensureTable();
    const sql = await getSql();
    const createdAt = Date.parse(data.createdAt) || Date.now();
    const updatedAt = Date.parse(data.updatedAt) || Date.now();
    await sql.query(
      `insert into studio_assets (id, owner, kind, title, cover_url, tags_json, source, note, data_json, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0), to_timestamp($11 / 1000.0))
       on conflict (id) do update set
         kind = excluded.kind,
         title = excluded.title,
         cover_url = excluded.cover_url,
         tags_json = excluded.tags_json,
         source = excluded.source,
         note = excluded.note,
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
      [
        data.id,
        OWNER,
        data.kind,
        data.title,
        data.coverUrl,
        JSON.stringify(data.tags),
        data.source || "",
        data.note || "",
        JSON.stringify(data),
        createdAt,
        updatedAt,
      ],
    );
    return { ok: true as const, asset: data };
  });

export const deleteServerAsset = createServerFn({ method: "POST" })
  .validator((value: unknown) => ({ id: String(isRecord(value) ? value.id || "" : "").trim() }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: true as const };
    await ensureTable();
    const sql = await getSql();
    await sql.query("delete from studio_assets where owner = $1 and id = $2", [OWNER, data.id]);
    return { ok: true as const };
  });
