import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { createApiRelayProvider, type ApiRelayProvider } from "@/stores/api-relay-config";
import { studioRelays } from "@/studio/wiring";

/** Must stay aligned with `DEV_USER_ID` in verify.server.ts (auth-off PGLite). */
const ENV_VAULT_USER_ID = "dev-user";

export type PublicRelayVaultProvider = Omit<ApiRelayProvider, "apiKey" | "apiKeys" | "apiKeyIds"> & {
  apiKey: "";
  apiKeys?: undefined;
  apiKeyIds?: undefined;
  hasApiKey: boolean;
};

export type RelayVaultPayload = {
  relays: PublicRelayVaultProvider[];
  hiddenPresetIds: string[];
  updatedAt: string;
};

type RawRelayVaultPayload = {
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

async function readRelayVaultRaw(userId: string): Promise<RawRelayVaultPayload> {
  const sql = await getSql();
  const rows = await sql.query<{ relays_json: string; hidden_json: string; updated_at: string }>(
    "select relays_json, hidden_json, updated_at::text as updated_at from studio_relay_vault where id = $1",
    [userId],
  );
  const row = rows[0];
  if (!row) return { relays: [], hiddenPresetIds: [], updatedAt: "" };
  return {
    relays: parseRelays(row.relays_json),
    hiddenPresetIds: parseIds(row.hidden_json),
    updatedAt: row.updated_at || "",
  };
}

export function redactRelay(relay: ApiRelayProvider): PublicRelayVaultProvider {
  const { apiKey, apiKeys, apiKeyIds: _apiKeyIds, ...publicRelay } = relay;
  return {
    ...publicRelay,
    apiKey: "",
    apiKeys: undefined,
    apiKeyIds: undefined,
    hasApiKey: Boolean(apiKey || apiKeys?.some(Boolean)),
  };
}

const requireVaultSession = createServerOnlyFn(async () => {
  const { requireUserId } = await import("@/lib/auth/verify.server");
  return requireUserId();
});

type RelayVaultInput = ApiRelayProvider & { hasApiKey?: boolean };

function mergeVaultInputs(
  incoming: RelayVaultInput[],
  existing: ApiRelayProvider[],
): ApiRelayProvider[] {
  const byId = new Map(existing.map((relay) => [relay.id, relay]));
  return incoming.map((relay) => {
    const previous = byId.get(relay.id);
    const hasIncomingKey = Boolean(relay.apiKey || relay.apiKeys?.some(Boolean));
    const { hasApiKey: _hasApiKey, ...cleanRelay } = relay;
    if (!previous || hasIncomingKey) return cleanRelay;
    // Redacted browser/env-seeded payloads must not erase a stored server key.
    return {
      ...cleanRelay,
      baseUrl: cleanRelay.baseUrl || previous.baseUrl,
      authScheme: cleanRelay.authScheme || previous.authScheme,
      apiKey: previous.apiKey,
      apiKeyId: previous.apiKeyId,
      apiKeys: previous.apiKeys ? [...previous.apiKeys] : undefined,
      apiKeyIds: previous.apiKeyIds ? [...previous.apiKeyIds] : undefined,
    };
  });
}

async function writeRelayVault(
  userId: string,
  data: { relays: RelayVaultInput[]; hiddenPresetIds?: string[] },
) {
  const sql = await getSql();
  const existing = await readRelayVaultRaw(userId);
  const relays = mergeVaultInputs(data.relays, existing.relays);
  await sql.query(
    `insert into studio_relay_vault (id, relays_json, hidden_json, updated_by)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       relays_json = excluded.relays_json,
       hidden_json = excluded.hidden_json,
       updated_at = now(),
       updated_by = excluded.updated_by`,
    [userId, JSON.stringify(relays), JSON.stringify(data.hiddenPresetIds || []), userId],
  );
  return { ok: true as const };
}

/** Server-only lookup; the returned key must never cross a public RPC boundary. */
export async function readRelayVaultKey(relayId: string) {
  const id = String(relayId || "").trim();
  if (!id) return null;
  const userId = await requireVaultSession();
  const vault = await readRelayVaultRaw(userId);
  const match = vault.relays.find((item) => item.id === id);
  if (!match) return null;
  const apiKey = [match.apiKey, ...(match.apiKeys || [])]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!apiKey) return null;
  const authScheme = match.authScheme === "Key" || match.authScheme === "x-api-key" ? match.authScheme : "Bearer";
  return {
    apiKey,
    baseUrl: String(match.baseUrl || "").trim(),
    authScheme,
  };
}

export const loadRelayVault = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const raw = await readRelayVaultRaw(context.userId);
    return {
      ...raw,
      relays: raw.relays.map(redactRelay),
    };
  });

export const saveRelayVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((value: { relays: RelayVaultInput[]; hiddenPresetIds?: string[] }) => ({
    relays: Array.isArray(value?.relays)
      ? value.relays.filter((relay): relay is RelayVaultInput => Boolean(relay && typeof relay === "object" && typeof relay.id === "string"))
      : [],
    hiddenPresetIds: Array.isArray(value?.hiddenPresetIds) ? value.hiddenPresetIds.filter((id) => typeof id === "string") : [],
  }))
  .handler(async ({ data, context }) => writeRelayVault(context.userId, data));

type EnvSeededRelay = {
  readonly id: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly authScheme?: ApiRelayProvider["authScheme"];
  readonly imageModels?: readonly string[];
  readonly models?: readonly string[];
};

function envText(name: string) {
  return String(process.env[name] || "").trim();
}

export function envSeededRelays(): EnvSeededRelay[] {
  const grokRelay = envText("GROK_RELAY_API_KEY");
  const civitai = envText("CIVITAI_API_KEY") || envText("CIVITAI_TOKEN");
  const fal = envText("FAL_KEY");
  const openaiCompat = envText("OPENAI_COMPAT_API_KEY");
  const seeded: EnvSeededRelay[] = [];
  if (grokRelay) {
    seeded.push({
      id: "preset-grok-relay",
      apiKey: grokRelay,
      baseUrl: envText("GROK_RELAY_BASE_URL") || "http://sub.alibb123.ccwu.cc/v1",
    });
  }
  if (civitai) seeded.push({ id: "preset-civitai", apiKey: civitai });
  if (fal) seeded.push({ id: "preset-fal", apiKey: fal, authScheme: "Key" });
  if (openaiCompat) {
    seeded.push({
      id: "preset-custom-compat",
      apiKey: openaiCompat,
      baseUrl: envText("OPENAI_COMPAT_BASE_URL") || "https://birdsun.click/v1",
      imageModels: ["gpt-image-2", "auto"],
      models: ["gpt-image-2", "auto"],
    });
  }
  return seeded;
}

function applyEnvSeededRelays(existing: ApiRelayProvider[]) {
  const templates = studioRelays();
  const byId = new Map(existing.map((relay) => [relay.id, relay]));
  for (const seed of envSeededRelays()) {
    const previous = byId.get(seed.id);
    const template = templates.find((item) => item.id === seed.id);
    const next = createApiRelayProvider({
      ...(template || previous || { id: seed.id }),
      ...(previous || {}),
      id: seed.id,
      apiKey: seed.apiKey,
      enabled: true,
      ...(seed.baseUrl ? { baseUrl: seed.baseUrl } : {}),
      ...(seed.authScheme ? { authScheme: seed.authScheme } : {}),
      ...(seed.imageModels ? { imageModels: [...seed.imageModels] } : {}),
      ...(seed.models ? { models: [...seed.models] } : {}),
    });
    byId.set(seed.id, next);
  }
  return [...byId.values()];
}

export async function seedRelayVaultFromEnv(userId = ENV_VAULT_USER_ID) {
  const seeds = envSeededRelays();
  if (!seeds.length) return { ok: true as const, seeded: 0 };
  const existing = await readRelayVaultRaw(userId);
  const relays = applyEnvSeededRelays(existing.relays);
  await writeRelayVault(userId, { relays, hiddenPresetIds: existing.hiddenPresetIds });
  return { ok: true as const, seeded: seeds.length };
}
