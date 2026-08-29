import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import type { ApiRelayProvider } from "@/stores/api-relay-config";

const VAULT_ID = "studio";

export type RelayVaultPayload = {
  relays: ApiRelayProvider[];
  hiddenPresetIds: string[];
  updatedAt: string;
};

function parseRelays(value: unknown): ApiRelayProvider[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is ApiRelayProvider => Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"));
}

function parseIds(value: unknown): string[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

export async function readRelayVault(): Promise<RelayVaultPayload> {
  const sql = await getSql();
  const rows = await sql.query<{ relays_json: string; hidden_json: string; updated_at: string }>(
    "select relays_json, hidden_json, updated_at::text as updated_at from studio_relay_vault where id = $1",
    [VAULT_ID],
  );
  const row = rows[0];
  if (!row) return { relays: [], hiddenPresetIds: [], updatedAt: "" };
  return {
    relays: parseRelays(row.relays_json),
    hiddenPresetIds: parseIds(row.hidden_json),
    updatedAt: row.updated_at || "",
  };
}

export async function readRelayVaultKey(relayId: string) {
  const id = String(relayId || "").trim();
  if (!id) return null;
  const vault = await readRelayVault();
  const match = vault.relays.find((item) => item.id === id);
  if (!match) return null;
  const apiKey = String(match.apiKey || "").trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: String(match.baseUrl || "").trim(),
    authScheme: match.authScheme || "Bearer",
  };
}

export const loadRelayVault = createServerFn({ method: "GET" }).handler(async () => readRelayVault());

export const saveRelayVault = createServerFn({ method: "POST" })
  .validator((value: { relays: ApiRelayProvider[]; hiddenPresetIds?: string[] }) => ({
    relays: Array.isArray(value?.relays) ? value.relays : [],
    hiddenPresetIds: Array.isArray(value?.hiddenPresetIds) ? value.hiddenPresetIds.filter((id) => typeof id === "string") : [],
  }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql.query(
      `insert into studio_relay_vault (id, relays_json, hidden_json, updated_by)
       values ($1, $2, $3, $4)
       on conflict (id) do update set
         relays_json = excluded.relays_json,
         hidden_json = excluded.hidden_json,
         updated_at = now(),
         updated_by = excluded.updated_by`,
      [VAULT_ID, JSON.stringify(data.relays), JSON.stringify(data.hiddenPresetIds), VAULT_ID],
    );
    return { ok: true as const };
  });
