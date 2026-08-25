export function shouldPersistCanvasProject(options) {
  return Boolean(
    options.projectLoaded &&
      options.currentProjectId &&
      options.loadedProjectId === options.currentProjectId,
  );
}
