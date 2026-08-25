import { resolveVideoModelCapability, type ResolvedVideoModelCapability } from "@/services/api/video-model-capabilities";
import { providerDisplayName, type ApiRelayProvider } from "@/stores/api-relay-config";
import type { AiConfig } from "@/stores/use-config-store";

/**
 * Capability resolution is display-only. It copies the configured provider so
 * duplicate-safe text never changes the exact provider object used for routing
 * or network submission.
 */
export function resolveCanvasVideoModelCapability(
    config: Pick<AiConfig, "apiRelays">,
    model: string,
    provider: ApiRelayProvider | undefined,
): ResolvedVideoModelCapability {
    return resolveVideoModelCapability({
        model,
        provider: provider
            ? { ...provider, displayName: providerDisplayName(provider, config.apiRelays) }
            : undefined,
    });
}
