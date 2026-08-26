import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { studioRelays } from "@/studio/wiring";

/**
 * Re-seed managed templates (enabled + key) while keeping user-added extras.
 * Stale persist with enabled:false used to win over wired templates.
 */
export function mergePersistedRelays(saved: ApiRelayProvider[] | undefined): ApiRelayProvider[] {
  const base = studioRelays();
  if (!Array.isArray(saved) || saved.length === 0) return base;
  const extras = saved.filter((row) => !base.some((item) => item.id === row.id));
  return base
    .map((item) => {
      const override = saved.find((row) => row.id === item.id);
      if (!override) return item;
      const apiKey = override.apiKey || item.apiKey;
      const enabled = item.enabled ? Boolean(apiKey) : Boolean(override.enabled && apiKey);
      return {
        ...item,
        apiKey,
        enabled,
        name: override.name || item.name,
        baseUrl: override.baseUrl || item.baseUrl,
        remark: override.remark || item.remark,
      };
    })
    .concat(extras);
}
