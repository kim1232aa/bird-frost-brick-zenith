/** Feature modules. Flip a flag instead of scattering conditionals. */
export const STUDIO_FEATURES = {
  infiniteCanvas: true,
  storyDirector: true,
  seedance2Workflow: true,
  promptLibrary: true,
  assetLibrary: true,
  webdav: true,
  membership: true,
  civitai: true,
  audio: true,
} as const;

export type StudioFeatureId = keyof typeof STUDIO_FEATURES;

export function isStudioFeatureEnabled(id: StudioFeatureId) {
  return STUDIO_FEATURES[id];
}
