export function shouldPersistCanvasProject(options: {
  projectLoaded: boolean;
  currentProjectId: string;
  loadedProjectId: string | null;
}) {
  return Boolean(
    options.projectLoaded &&
      options.currentProjectId &&
      options.loadedProjectId === options.currentProjectId,
  );
}
