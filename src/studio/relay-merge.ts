import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { isManagedRelayId } from "@/studio/relay-ids";
import { studioRelays } from "@/studio/wiring";

/**
 * Re-seed managed templates while keeping user-added extras.
 * Presets the user deleted stay hidden until「恢复内置模板」.
 * User extras are never dropped.
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
        baseUrl: override.baseUrl || item.baseUrl,
        remark: override.remark || item.remark,
        endpoints: override.endpoints || item.endpoints,
        authScheme: override.authScheme || item.authScheme,
        protocol: override.protocol || item.protocol,
        adapterType: override.adapterType || item.adapterType,
        apiKey,
      });
    })
    .concat(extras.map((row) => ({ ...row, enabled: row.enabled !== false })));
}
