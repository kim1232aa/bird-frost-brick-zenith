import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { studioRelays } from "@/studio/wiring";

/**
 * Re-seed managed templates (enabled + key) while keeping user-added extras.
 * Template keys win over stale persist that wiped keys / set enabled:false.
 * User-added relays are never dropped.
 */
export function mergePersistedRelays(saved: ApiRelayProvider[] | undefined): ApiRelayProvider[] {
  const base = studioRelays();
  if (!Array.isArray(saved) || saved.length === 0) return base;
  const extras = saved.filter((row) => !base.some((item) => item.id === row.id));
  return base
    .map((item) => {
      const override = saved.find((row) => row.id === item.id);
      if (!override) return item;
      const userKey = typeof override.apiKey === "string" ? override.apiKey.trim() : "";
      const apiKey = userKey || item.apiKey;
      const enabled = item.enabled ? Boolean(apiKey) : Boolean(override.enabled && apiKey);
      return {
        ...item,
        name: override.name || item.name,
        baseUrl: override.baseUrl || item.baseUrl,
        remark: override.remark || item.remark,
        endpoints: override.endpoints || item.endpoints,
        authScheme: override.authScheme || item.authScheme,
        protocol: override.protocol || item.protocol,
        apiKey,
        enabled,
      };
    })
    .concat(extras);
}
