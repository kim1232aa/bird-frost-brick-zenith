import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { isManagedRelayId } from "@/studio/relay-ids";
import { studioRelays } from "@/studio/wiring";

function union(left?: string[], right?: string[]) {
  return Array.from(new Set([...(left || []), ...(right || [])].map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizeUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
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

/**
 * Re-seed managed templates while keeping user-added extras.
 * Presets the user deleted stay hidden until「恢复内置模板」.
 * User extras are never dropped. Model lists are unioned so fetched models survive.
 * Known-wrong ModelScope .cn / Hugging Face bare /v1 bases are rewritten to the live endpoints.
 */
export function mergePersistedRelays(
  saved: ApiRelayProvider[] | undefined,
  hiddenPresetIds: string[] = [],
): ApiRelayProvider[] {
  const base = studioRelays();
  const hidden = new Set(hiddenPresetIds.filter(isManagedRelayId));
  const enable = (item: ApiRelayProvider): ApiRelayProvider => ({ ...item, enabled: true });

  if (!Array.isArray(saved) || saved.length === 0) {
    return base.filter((item) => !hidden.has(item.id)).map(enable);
  }

  const extras = saved.filter((row) => !base.some((item) => item.id === row.id));
  return base
    .filter((item) => !hidden.has(item.id))
    .map((item) => {
      const override = saved.find((row) => row.id === item.id);
      if (!override) return enable(item);
      const userKey = typeof override.apiKey === "string" ? override.apiKey.trim() : "";
      const apiKey = userKey || item.apiKey;
      return enable({
        ...item,
        name: override.name || item.name,
        baseUrl: resolveBaseUrl(item, override),
        remark: override.remark || item.remark,
        endpoints: resolveEndpoints(item, override),
        authScheme: override.authScheme || item.authScheme,
        protocol: override.protocol || item.protocol,
        adapterType: override.adapterType || item.adapterType,
        apiKey,
        models: union(item.models, override.models),
        textModels: union(item.textModels, override.textModels),
        imageModels: union(item.imageModels, override.imageModels),
        videoModels: union(item.videoModels, override.videoModels),
        audioModels: union(item.audioModels, override.audioModels),
        capabilities: union(item.capabilities, override.capabilities) as ApiRelayProvider["capabilities"],
        imageCapabilityProfiles: {
          ...(item.imageCapabilityProfiles || {}),
          ...(override.imageCapabilityProfiles || {}),
        },
        videoCapabilityProfiles: {
          ...(item.videoCapabilityProfiles || {}),
          ...(override.videoCapabilityProfiles || {}),
        },
      });
    })
    .concat(extras.map((row) => ({ ...row, enabled: row.enabled !== false })));
}
