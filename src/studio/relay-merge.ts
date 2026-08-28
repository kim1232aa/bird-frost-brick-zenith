import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { isManagedRelayId } from "@/studio/relay-ids";
import { studioRelays } from "@/studio/wiring";
import { providerCredentialPool } from "@/stores/provider-credentials";

function union(left?: string[], right?: string[]) {
  return Array.from(new Set([...(left || []), ...(right || [])].map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizeUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function isServerInjectedRelay(provider: Pick<ApiRelayProvider, "baseUrl" | "id">) {
  try {
    return new URL(String(provider.baseUrl || "")).hostname.toLowerCase() === "api.x.ai";
  } catch {
    return false;
  }
}

function isStalePresetUrl(id: string, url: string) {
  const value = normalizeUrl(url);
  if (!value) return false;
  if (id === "preset-modelscope") return /api-inference\.modelscope\.cn/i.test(value);
  if (id === "preset-huggingface") {
    try {
      const parsed = new URL(value);
      if (!/(^|\.)huggingface\.co$/i.test(parsed.hostname)) return false;
      const path = parsed.pathname.replace(/\/+$/, "") || "";
      return path === "" || path === "/v1";
    } catch {
      return false;
    }
  }
  return false;
}

function resolveBaseUrl(item: ApiRelayProvider, override?: ApiRelayProvider) {
  const saved = typeof override?.baseUrl === "string" ? override.baseUrl : "";
  if (!saved || isStalePresetUrl(item.id, saved)) return item.baseUrl;
  return saved;
}

function resolveEndpoints(item: ApiRelayProvider, override?: ApiRelayProvider) {
  const saved = override?.endpoints;
  if (!saved) return item.endpoints;
  if (override?.baseUrl && isStalePresetUrl(item.id, override.baseUrl)) return item.endpoints;
  const savedImages = String(saved.images || "");
  const seedImages = String(item.endpoints?.images || "");
  if (savedImages.startsWith("/v1/") && seedImages && !seedImages.startsWith("/v1/")) return item.endpoints;
  return saved;
}

function resolveCredentials(template: ApiRelayProvider, override?: ApiRelayProvider) {
  const keys = union(
    override ? [override.apiKey, ...(override.apiKeys || [])] : [],
    [template.apiKey, ...(template.apiKeys || [])],
  );
  const [apiKey = "", ...apiKeys] = keys;
  return {
    apiKey,
    ...(apiKeys.length ? { apiKeys } : {}),
    ...(override?.apiKeyId && apiKey === override.apiKey ? { apiKeyId: override.apiKeyId } : {}),
    ...(override?.apiKeyIds && apiKeys.length ? { apiKeyIds: override.apiKeyIds } : {}),
  };
}

function resolveEnabled(template: ApiRelayProvider, override: ApiRelayProvider | undefined, apiKey: string) {
  if (apiKey) return true;
  if (template.id === "preset-xai-official") return false;
  if (override && typeof override.enabled === "boolean") return override.enabled;
  return template.enabled === true;
}

function mergeOne(template: ApiRelayProvider, override?: ApiRelayProvider): ApiRelayProvider {
  const credentials = resolveCredentials(template, override);
  if (!override) {
    return {
      ...template,
      ...credentials,
      enabled: resolveEnabled(template, undefined, credentials.apiKey),
    };
  }
  return {
    ...template,
    name: override.name || template.name,
    baseUrl: resolveBaseUrl(template, override),
    remark: override.remark || template.remark,
    endpoints: resolveEndpoints(template, override),
    authScheme: override.authScheme || template.authScheme,
    protocol: override.protocol || template.protocol,
    adapterType: override.adapterType || template.adapterType,
    ...credentials,
    models: union(template.models, override.models),
    textModels: union(template.textModels, override.textModels),
    imageModels: union(template.imageModels, override.imageModels),
    videoModels: union(template.videoModels, override.videoModels),
    audioModels: union(template.audioModels, override.audioModels),
    capabilities: union(template.capabilities, override.capabilities) as ApiRelayProvider["capabilities"],
    imageCapabilityProfiles: {
      ...(template.imageCapabilityProfiles || {}),
      ...(override.imageCapabilityProfiles || {}),
    },
    videoCapabilityProfiles: {
      ...(template.videoCapabilityProfiles || {}),
      ...(override.videoCapabilityProfiles || {}),
    },
    enabled: resolveEnabled(template, override, credentials.apiKey),
  };
}

/**
 * Re-seed managed templates while keeping user-added extras and filled keys.
 * Empty env templates must never wipe a key the user already saved in settings.
 */
export function mergePersistedRelays(
  saved: ApiRelayProvider[] | undefined,
  hiddenPresetIds: string[] = [],
): ApiRelayProvider[] {
  const base = studioRelays() || [];
  if (!Array.isArray(base) || base.length === 0) {
    return Array.isArray(saved) ? saved.filter((row) => row?.id) : [];
  }
  const hidden = new Set(hiddenPresetIds.filter(isManagedRelayId));
  if (!Array.isArray(saved) || saved.length === 0) {
    return base.filter((item) => !hidden.has(item.id)).map((item) => mergeOne(item));
  }

  const extras = saved.filter((row) => !base.some((item) => item.id === row.id));
  return base
    .filter((item) => !hidden.has(item.id))
    .map((item) => mergeOne(item, saved.find((row) => row.id === item.id)))
    .concat(extras.map((row) => ({
      ...row,
      enabled: row.enabled !== false || Boolean(providerCredentialPool(row).keys.length),
    })));
}

/** Combine canvas config + settings page without dropping either side's keys. */
export function mergeRelaySources(...lists: Array<ApiRelayProvider[] | undefined>): ApiRelayProvider[] {
  const byId = new Map<string, ApiRelayProvider>();
  for (const list of lists) {
    for (const row of list || []) {
      if (!row?.id) continue;
      const prev = byId.get(row.id);
      byId.set(row.id, prev ? mergeOne(prev, row) : row);
    }
  }
  return mergePersistedRelays([...byId.values()]);
}
