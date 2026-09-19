import { sha256HexSync } from "@/lib/sha256";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { orderedProviderCredentialIds, normalizeProviderKeyInput } from "@/stores/provider-credentials";
import { createApiRelayProvider, type ApiRelayProvider } from "@/stores/api-relay-config";
import { studioRelays } from "@/studio/wiring";

/** Must stay aligned with `DEV_USER_ID` in verify.server.ts (auth-off PGLite). */
const ENV_VAULT_USER_ID = "dev-user";
const LEGACY_STUDIO_VAULT_USER_ID = "studio";

export type PublicRelayVaultProvider = Omit<ApiRelayProvider, "apiKey" | "apiKeys"> & {
  apiKey: "";
  apiKeys?: undefined;
  hasApiKey: boolean;
};

export type PublicImageHostCredential = {
  baseUrl: string;
  hasApiKey: boolean;
};

export type ImageHostCredentialInput = {
  baseUrl: string;
  apiKey: string;
};

export type RelayVaultPayload = {
  relays: PublicRelayVaultProvider[];
  hiddenPresetIds: string[];
  updatedAt: string;
  imageHost: PublicImageHostCredential | null;
};

type RawImageHostCredential = ImageHostCredentialInput;

type RawRelayVaultPayload = {
  relays: ApiRelayProvider[];
  hiddenPresetIds: string[];
  updatedAt: string;
  imageHost: RawImageHostCredential | null;
};

type CredentialEntry = { key: string; id: string };
type CredentialRelay = Pick<ApiRelayProvider, "apiKey" | "apiKeyId" | "apiKeys" | "apiKeyIds"> & {
  hasApiKey?: boolean;
};

/** The digest is calculated only in this server module; its input is never logged or sent. */
function stableCredentialId(apiKey: string) {
  return `credential-sha256-${sha256HexSync(apiKey)}`;
}

function rawCredentialSlots(relay: CredentialRelay) {
  const seenKeys = new Set<string>();
  const slots: Array<{ key: string; suppliedId: string }> = [];
  const append = (value: unknown, suppliedId: unknown) => {
    const key = normalizeProviderKeyInput(String(value || ""));
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    slots.push({ key, suppliedId: String(suppliedId || "").trim() });
  };
  append(relay.apiKey, relay.apiKeyId);
  (Array.isArray(relay.apiKeys) ? relay.apiKeys : []).forEach((value, index) => {
    append(value, Array.isArray(relay.apiKeyIds) ? relay.apiKeyIds[index] : undefined);
  });
  return slots;
}

function credentialEntries(relay: CredentialRelay, fallbackByKey: ReadonlyMap<string, string> = new Map()) {
  const usedIds = new Set<string>();
  return rawCredentialSlots(relay).map(({ key, suppliedId }, index): CredentialEntry => {
    const candidates = [suppliedId, fallbackByKey.get(key) || "", stableCredentialId(key)];
    let id = candidates.find((candidate) => candidate && candidate !== key && !usedIds.has(candidate)) || "";
    let salt = 0;
    while (!id || id === key || usedIds.has(id)) {
      id = stableCredentialId(`${key}\u0000${index}\u0000${salt}`);
      salt += 1;
    }
    usedIds.add(id);
    return { key, id };
  });
}

function applyCredentialEntries(relay: CredentialRelay, entries: CredentialEntry[]): ApiRelayProvider {
  const [primary, ...pool] = entries;
  return {
    ...(relay as ApiRelayProvider),
    apiKey: primary?.key || "",
    apiKeyId: primary?.id,
    apiKeys: pool.length ? pool.map((entry) => entry.key) : undefined,
    apiKeyIds: pool.length ? pool.map((entry) => entry.id) : undefined,
    hasApiKey: Boolean(relay.hasApiKey || entries.length),
  };
}

function normalizeVaultRelay(relay: ApiRelayProvider): ApiRelayProvider {
  const entries = credentialEntries(relay);
  if (entries.length) return applyCredentialEntries(relay, entries);
  const ids = orderedProviderCredentialIds(relay);
  return {
    ...relay,
    apiKey: "",
    apiKeyId: ids[0],
    apiKeys: undefined,
    apiKeyIds: ids.length > 1 ? ids.slice(1) : undefined,
    hasApiKey: Boolean(relay.hasApiKey || ids.length),
  };
}

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
  return raw
    .filter((row): row is ApiRelayProvider => Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"))
    .map(normalizeVaultRelay);
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

function parseImageHostCredential(value: unknown): RawImageHostCredential | null {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as { baseUrl?: unknown; apiKey?: unknown };
  let baseUrl = "";
  try {
    baseUrl = normalizeImageHostBaseUrl(record.baseUrl);
  } catch {
    return null;
  }
  const apiKey = String(record.apiKey || "").trim();
  return baseUrl || apiKey ? { baseUrl, apiKey } : null;
}

function parseVaultRow(row: { relays_json: string; hidden_json: string; image_host_json?: string; updated_at: string }): RawRelayVaultPayload {
  return {
    relays: parseRelays(row.relays_json),
    hiddenPresetIds: parseIds(row.hidden_json),
    updatedAt: row.updated_at || "",
    imageHost: parseImageHostCredential(row.image_host_json),
  };
}

function emptyVault(): RawRelayVaultPayload {
  return { relays: [], hiddenPresetIds: [], updatedAt: "", imageHost: null };
}

async function readRelayVaultRow(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ relays_json: string; hidden_json: string; image_host_json?: string; updated_at: string }>(
    "select relays_json, hidden_json, image_host_json, updated_at::text as updated_at from studio_relay_vault where id = $1",
    [userId],
  );
  return rows[0] || null;
}

async function readRelayVaultRaw(userId: string): Promise<RawRelayVaultPayload> {
  const seen = new Set<string>();
  const sharedIds = [LEGACY_STUDIO_VAULT_USER_ID, ENV_VAULT_USER_ID];
  // Only the shared single-tenant rows may fall back to each other; a signed-in
  // user with no vault row of their own must never see the shared/seeded keys.
  const candidates = (sharedIds.includes(userId) ? [userId, ...sharedIds] : [userId]).filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of candidates) {
    const row = await readRelayVaultRow(id);
    if (row) {
      const parsed = parseVaultRow(row);
      const applied = applyEnvSeededRelays(parsed.relays);
      return {
        relays: applied.relays,
        hiddenPresetIds: parsed.hiddenPresetIds,
        updatedAt: parsed.updatedAt,
        imageHost: parsed.imageHost,
      };
    }
  }
  const defaultSeeds = applyEnvSeededRelays([]);
  return {
    relays: defaultSeeds.relays,
    hiddenPresetIds: [],
    updatedAt: new Date().toISOString(),
    imageHost: null,
  };
}

export function redactRelay(relay: ApiRelayProvider): PublicRelayVaultProvider {
  const normalized = normalizeVaultRelay(relay);
  const { apiKey: _apiKey, apiKeys: _apiKeys, ...publicRelay } = normalized;
  const identities = orderedProviderCredentialIds(normalized);
  return {
    ...publicRelay,
    apiKey: "",
    apiKeys: undefined,
    apiKeyId: identities[0],
    apiKeyIds: identities.length > 1 ? identities.slice(1) : undefined,
    hasApiKey: Boolean(relay.hasApiKey || identities.length),
  };
}

const requireVaultSession = createServerOnlyFn(async () => {
  const { resolveStudioVaultUserId } = await import("@/lib/auth/verify.server");
  return resolveStudioVaultUserId();
});

type RelayVaultInput = ApiRelayProvider & { hasApiKey?: boolean };

function mergeVaultInputs(
  incoming: RelayVaultInput[],
  existing: ApiRelayProvider[],
): ApiRelayProvider[] {
  const byId = new Map(existing.map((relay) => [relay.id, normalizeVaultRelay(relay)]));
  return incoming.map((relay) => {
    const previous = byId.get(relay.id);
    const { hasApiKey: _hasApiKey, ...cleanRelay } = relay;
    if (!previous) return normalizeVaultRelay(cleanRelay as ApiRelayProvider);

    const previousEntries = credentialEntries(previous);
    const incomingSlots = rawCredentialSlots(relay);
    if (incomingSlots.length) {
      const fallbackByKey = new Map(previousEntries.map((entry) => [entry.key, entry.id]));
      return applyCredentialEntries(cleanRelay, credentialEntries(relay, fallbackByKey));
    }

    const requestedIds = orderedProviderCredentialIds(relay);
    const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));
    const selected = requestedIds.map((id) => previousById.get(id)).filter((entry): entry is CredentialEntry => Boolean(entry));
    const selectedSet = new Set(selected);
    const orderedEntries = [...selected, ...previousEntries.filter((entry) => !selectedSet.has(entry))];
    const mergedRelay = {
      ...cleanRelay,
      baseUrl: cleanRelay.baseUrl || previous.baseUrl,
      authScheme: cleanRelay.authScheme || previous.authScheme,
    };
    if (orderedEntries.length) return applyCredentialEntries(mergedRelay, orderedEntries);

    const identities = requestedIds.length ? requestedIds : orderedProviderCredentialIds(previous);
    return normalizeVaultRelay({
      ...(mergedRelay as ApiRelayProvider),
      apiKeyId: identities[0],
      apiKeyIds: identities.length > 1 ? identities.slice(1) : undefined,
      hasApiKey: Boolean(relay.hasApiKey || previous.hasApiKey || identities.length),
    });
  });
}

function normalizeImageHostBaseUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("图床地址必须是有效的 http(s) URL");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("图床地址必须是无认证信息、无查询参数的 http(s) URL");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
  return parsed.toString().replace(/\/$/u, "");
}

function normalizeImageHostCredential(input: { baseUrl?: unknown; apiKey?: unknown }) {
  const baseUrl = normalizeImageHostBaseUrl(input.baseUrl);
  const apiKey = String(input.apiKey || "").trim();
  if (apiKey && !baseUrl) throw new Error("图床 API Key 必须绑定图床地址");
  if (apiKey && !baseUrl.startsWith("https://")) throw new Error("图床 API Key 只能保存到 HTTPS 地址");
  return baseUrl ? { baseUrl, apiKey } : null;
}

function publicImageHostCredential(value: RawImageHostCredential | null): PublicImageHostCredential | null {
  if (!value?.baseUrl) return null;
  return { baseUrl: value.baseUrl, hasApiKey: Boolean(value.apiKey) };
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

async function writeImageHostCredential(userId: string, input: ImageHostCredentialInput) {
  const credential = normalizeImageHostCredential(input);
  const sql = await getSql();
  await sql.query(
    `insert into studio_relay_vault (id, image_host_json, updated_by)
     values ($1, $2, $3)
     on conflict (id) do update set
       image_host_json = excluded.image_host_json,
       updated_at = now(),
       updated_by = excluded.updated_by`,
    [userId, credential ? JSON.stringify(credential) : "", userId],
  );
  return {
    ok: true as const,
    baseUrl: credential?.baseUrl || "",
    hasApiKey: Boolean(credential?.apiKey),
  };
}

/** Server-only lookup; the returned key must never cross a public RPC boundary. */
export async function readRelayVaultKey(relayId: string, credentialId?: string) {
  const id = String(relayId || "").trim();
  if (!id) return null;
  const requestedCredentialId = String(credentialId || "").trim();
  const userId = await requireVaultSession();
  const vault = await readRelayVaultRaw(userId);
  let match = vault.relays.find((item) => item.id === id);
  if (!match || !credentialEntries(match)[0]?.key) {
    const seeds = applyEnvSeededRelays([]);
    const seedMatch = seeds.relays.find((item) => item.id === id);
    if (seedMatch && credentialEntries(seedMatch)[0]?.key) {
      match = seedMatch;
    }
  }
  if (!match) return null;

  const entries = credentialEntries(match);
  const selected = requestedCredentialId
    ? entries.find((entry) => entry.id === requestedCredentialId)
    : entries[0];
  if (!selected) return null;
  const authScheme = match.authScheme === "Key" || match.authScheme === "x-api-key" ? match.authScheme : "Bearer";
  return {
    apiKey: selected.key,
    baseUrl: String(match.baseUrl || "").trim(),
    authScheme,
  };
}

/** Server-only lookup for the single configured image-host credential. */
export async function readImageHostVaultKey(baseUrl: string) {
  const requestedBaseUrl = normalizeImageHostBaseUrl(baseUrl);
  if (!requestedBaseUrl || !requestedBaseUrl.startsWith("https://")) return null;
  const userId = await requireVaultSession();
  const vault = await readRelayVaultRaw(userId);
  const credential = vault.imageHost;
  if (!credential?.apiKey || credential.baseUrl !== requestedBaseUrl) return null;
  return { apiKey: credential.apiKey, baseUrl: credential.baseUrl };
}

type VaultHandlerContext = { userId?: unknown } | null | undefined;

/** Middleware-injected userId wins; fall back to the request session. */
async function vaultUserIdFromContext(context: VaultHandlerContext): Promise<string> {
  const fromContext = typeof context?.userId === "string" ? context.userId.trim() : "";
  return fromContext || requireVaultSession();
}

export const loadRelayVault = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    const raw = await readRelayVaultRaw(await vaultUserIdFromContext(context as VaultHandlerContext));
    return {
      relays: raw.relays.map(redactRelay),
      hiddenPresetIds: raw.hiddenPresetIds,
      updatedAt: raw.updatedAt,
      imageHost: publicImageHostCredential(raw.imageHost),
    };
  });

export const loadImageHostCredential = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    const raw = await readRelayVaultRaw(await vaultUserIdFromContext(context as VaultHandlerContext));
    return publicImageHostCredential(raw.imageHost);
  });

export const saveRelayVault = createServerFn({ method: "POST" })
  .validator((value: { relays: RelayVaultInput[]; hiddenPresetIds?: string[] }) => ({
    relays: Array.isArray(value?.relays)
      ? value.relays.filter((relay): relay is RelayVaultInput => Boolean(relay && typeof relay === "object" && typeof relay.id === "string"))
      : [],
    hiddenPresetIds: Array.isArray(value?.hiddenPresetIds) ? value.hiddenPresetIds.filter((id) => typeof id === "string") : [],
  }))
  .handler(async ({ data, context }) => writeRelayVault(await vaultUserIdFromContext(context as VaultHandlerContext), data));

export const saveImageHostCredential = createServerFn({ method: "POST" })
  .validator((value: Partial<ImageHostCredentialInput>) => ({
    baseUrl: normalizeImageHostBaseUrl(value?.baseUrl),
    apiKey: String(value?.apiKey || "").trim(),
  }))
  .handler(async ({ data, context }) => writeImageHostCredential(await vaultUserIdFromContext(context as VaultHandlerContext), data));

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

function isHttpsEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function defaultGrokRelayBaseUrl() {
  return studioRelays().find((relay) => relay.id === "preset-grok-relay")?.baseUrl || "";
}

function normalizeEnvRelayBaseUrl(value: string) {
  const raw = value.trim();
  if (!raw) return defaultGrokRelayBaseUrl();
  try {
    const url = new URL(raw);
    if (url.protocol === "http:") url.protocol = "https:";
    const normalized = url.toString().replace(/\/+$/, "");
    return isHttpsEndpoint(normalized) ? normalized : "";
  } catch {
    return "";
  }
}

export function envSeededRelays(): EnvSeededRelay[] {
  const grokRelay = envText("GROK_RELAY_API_KEY");
  const civitai = envText("CIVITAI_API_KEY") || envText("CIVITAI_TOKEN");
  const fal = envText("FAL_KEY");
  const openaiCompat = envText("OPENAI_COMPAT_API_KEY");
  const volcengineKey = envText("VOLCENGINE_API_KEY") || envText("ARK_API_KEY") || envText("SUB_API_KEY");
  const volcengineBaseUrl = normalizeEnvRelayBaseUrl(envText("VOLCENGINE_BASE_URL") || "https://sub.alibb123.ccwu.cc/v1");
  const nanogptKey = envText("NANOGPT_API_KEY");
  const hfKey = envText("HF_TOKEN") || envText("HUGGINGFACE_API_KEY");
  const modelscopeKey = envText("MODELSCOPE_API_KEY");
  const modelscopeCnKey = envText("MODELSCOPE_CN_API_KEY");

  const seeded: EnvSeededRelay[] = [];
  const grokBaseUrl = normalizeEnvRelayBaseUrl(envText("GROK_RELAY_BASE_URL") || "https://sub.alibb123.ccwu.cc/v1");
  if (grokRelay && grokBaseUrl) {
    seeded.push({
      id: "preset-grok-relay",
      apiKey: grokRelay,
      baseUrl: grokBaseUrl,
    });
  }
  if (volcengineKey && volcengineBaseUrl) {
    const arkTextEp = ["ark", "8c2c51f6", "b302-48fc-8f26-207f83bd8129-b50b0"].join("-");
    const arkImageEp = ["ark", "7dba6482", "ede8-4905-b858-cc9a558ce1d0-45616"].join("-");
    const arkSeedream5LiteEp = ["ark", "8965f7dc", "a069-4b32-a536-605c1cf8ff4c-de941"].join("-");
    seeded.push({
      id: "preset-volcengine-plan",
      apiKey: volcengineKey,
      baseUrl: volcengineBaseUrl,
      models: [
        arkSeedream5LiteEp,
        "doubao-seedream-5.0-lite",
        "doubao-seedream-5.0",
        arkTextEp,
        arkImageEp,
        "doubao-seedream-5-0-260128",
        "doubao-seedance-2-0-260128",
      ],
      imageModels: [
        arkSeedream5LiteEp,
        "doubao-seedream-5.0-lite",
        "doubao-seedream-5.0",
        arkTextEp,
        arkImageEp,
        "doubao-seedream-5-0-260128",
      ],
    });
  }
  if (civitai) {
    seeded.push({ id: "preset-civitai", apiKey: civitai });
    seeded.push({ id: "preset-civitai-orchestration", apiKey: civitai });
  }
  if (fal) seeded.push({ id: "preset-fal", apiKey: fal, authScheme: "Key" });
  if (nanogptKey) seeded.push({ id: "preset-nanogpt", apiKey: nanogptKey });
  if (hfKey) seeded.push({ id: "preset-huggingface", apiKey: hfKey });
  if (modelscopeKey) seeded.push({ id: "preset-modelscope", apiKey: modelscopeKey });
  if (modelscopeCnKey) seeded.push({ id: "preset-modelscope-cn", apiKey: modelscopeCnKey });
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
  const byId = new Map(existing.map((relay) => [relay.id, normalizeVaultRelay(relay)]));
  let seeded = 0;
  for (const seed of envSeededRelays()) {
    const previous = byId.get(seed.id);
    const previousEntries = previous ? credentialEntries(previous) : [];
    const seedKey = normalizeProviderKeyInput(seed.apiKey);
    const seedId = previousEntries.find((entry) => entry.key === seedKey)?.id || stableCredentialId(seedKey);
    const template = templates.find((item) => item.id === seed.id);
    const next = normalizeVaultRelay(createApiRelayProvider({
      ...(template || previous || { id: seed.id }),
      ...(previous || {}),
      id: seed.id,
      apiKey: seed.apiKey,
      apiKeyId: seedId,
      enabled: true,
      ...(seed.baseUrl ? { baseUrl: seed.baseUrl } : {}),
      ...(seed.authScheme ? { authScheme: seed.authScheme } : {}),
      ...(seed.imageModels ? { imageModels: [...seed.imageModels] } : {}),
      ...(seed.models ? { models: [...seed.models] } : {}),
    }));
    const hasKey = Boolean(next.apiKey || next.apiKeys?.some(Boolean));
    if (hasKey && !isHttpsEndpoint(next.baseUrl)) continue;
    byId.set(seed.id, next);
    seeded += 1;
  }
  return { relays: [...byId.values()], seeded };
}

export async function seedRelayVaultFromEnv(userId = ENV_VAULT_USER_ID) {
  const seeds = envSeededRelays();
  if (!seeds.length) return { ok: true as const, seeded: 0 };
  const existing = await readRelayVaultRaw(userId);
  const applied = applyEnvSeededRelays(existing.relays);
  if (!applied.seeded) return { ok: true as const, seeded: 0 };
  await writeRelayVault(userId, { relays: applied.relays, hiddenPresetIds: existing.hiddenPresetIds });
  return { ok: true as const, seeded: applied.seeded };
}
