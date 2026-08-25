import {
  writeImageAdvancedSettings,
  type ImageAdvancedSettings,
  type ImageAdvancedSettingsByScope,
  type ImageAdvancedSettingsScope,
} from "@/stores/image-advanced-settings";
import type { AiConfig } from "@/stores/use-config-store";
import {
  explicitMediaRequestModel,
  resolveApiRequestRoute,
} from "@/services/api/ai-routing";

export type CanvasImageAdvancedSnapshot = {
  readonly scope?: ImageAdvancedSettingsScope;
  readonly settings?: ImageAdvancedSettings;
};

/**
 * Replay a node's recorded image settings only for the exact request scope.
 * A stale snapshot must never be copied into the active provider, model, or
 * operation selected for a later submission.
 */
export function applyCanvasImageAdvancedSnapshot(
  settingsByScope: ImageAdvancedSettingsByScope | undefined,
  activeScope: ImageAdvancedSettingsScope,
  snapshot: CanvasImageAdvancedSnapshot | undefined,
): ImageAdvancedSettingsByScope | undefined {
  const snapshotScope = snapshot?.scope;
  const snapshotSettings = snapshot?.settings;
  if (
    !snapshotScope ||
    !snapshotSettings ||
    snapshotScope.providerId !== activeScope.providerId ||
    snapshotScope.model !== activeScope.model ||
    snapshotScope.operation !== activeScope.operation
  ) {
    return settingsByScope;
  }
  return writeImageAdvancedSettings(
    settingsByScope,
    activeScope,
    snapshotSettings,
  );
}

/**
 * Apply a persisted node snapshot to a new submission without allowing that
 * snapshot to choose the route. The active picker-derived config is resolved
 * first; only an exact snapshot for that final route and operation may add
 * advanced settings.
 */
export function applyActiveCanvasImageAdvancedSnapshot(
  config: AiConfig,
  operation: ImageAdvancedSettingsScope["operation"],
  snapshot: CanvasImageAdvancedSnapshot | undefined,
): AiConfig {
  const route = resolveApiRequestRoute(
    config,
    "image",
    explicitMediaRequestModel(config, "image"),
    "imageGeneration",
  );
  if (route.mode !== "local") return config;
  const activeScope: ImageAdvancedSettingsScope = {
    providerId: route.provider.id,
    model: route.model,
    operation,
  };
  return {
    ...config,
    imageAdvancedSettingsByScope:
      applyCanvasImageAdvancedSnapshot(
        config.imageAdvancedSettingsByScope,
        activeScope,
        snapshot,
      ) || {},
  };
}
