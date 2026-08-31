export type StudioShellLayoutKind = "document" | "flush-scroll" | "workbench";

export type StudioShellLayout = {
  path: string;
  kind: StudioShellLayoutKind;
  pageClass: string;
  rootClass: string;
  isOps: boolean;
};

function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function studioShellLayout(pathname: string): StudioShellLayout {
  const path = normalizePath(pathname);
  const isCanvas = path === "/canvas" || path.startsWith("/canvas/");
  const isWorkspace = path === "/canvas/workspace";
  const isOps = path === "/admin" || path.startsWith("/admin/");
  const isAccount = path === "/account" || path === "/login" || path === "/register";
  const isStory = path === "/story";
  // Workspace stays a locked workbench so the infinite canvas can pan.
  // Admin and story are document-tall; locking them as workbenches clipped
  // overflow because bp-work/admin-desk size to content, not a pane scroller.
  const kind: StudioShellLayoutKind = isWorkspace
    ? "workbench"
    : isCanvas || isAccount || isOps || isStory
      ? "flush-scroll"
      : "document";
  const pageClass =
    kind === "workbench"
      ? "studio-page studio-flush"
      : kind === "flush-scroll"
        ? "studio-page studio-flush studio-flush-scroll"
        : "studio-page";
  return {
    path,
    kind,
    pageClass,
    rootClass: isCanvas ? "studio-root min-h-screen is-canvas" : "studio-root min-h-screen",
    isOps,
  };
}
