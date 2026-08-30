/** Pure studio mode URL helpers. No aliases, no store. */

export type ImageStudioRouteMode = "t2i" | "i2i" | "edit";
export type VideoStudioRouteMode = "t2v" | "i2v" | "flf" | "extract";

export function imageStudioModeFromQuery(value: string, fallback: ImageStudioRouteMode = "t2i"): ImageStudioRouteMode {
  if (value === "edit" || value === "i2i" || value === "t2i") return value;
  return fallback;
}

export function imageStudioModeLocation(mode: ImageStudioRouteMode):
  | { to: "/edit" }
  | { to: "/image"; search: { mode: "t2i" | "i2i" } } {
  if (mode === "edit") return { to: "/edit" };
  if (mode === "i2i") return { to: "/image", search: { mode: "i2i" } };
  return { to: "/image", search: { mode: "t2i" } };
}

export function videoStudioModeFromQuery(value: string, fallback: VideoStudioRouteMode = "t2v"): VideoStudioRouteMode {
  if (value === "i2v" || value === "flf" || value === "extract" || value === "t2v") return value;
  return fallback;
}

export function videoStudioModeLocation(mode: VideoStudioRouteMode):
  | { to: "/frames" }
  | { to: "/video" }
  | { to: "/i2v"; search: { mode: "i2v" | "flf" } } {
  if (mode === "extract") return { to: "/frames" };
  if (mode === "flf") return { to: "/i2v", search: { mode: "flf" } };
  if (mode === "i2v") return { to: "/i2v", search: { mode: "i2v" } };
  return { to: "/video" };
}

export function imageStudioSearchMode(search: Record<string, unknown>): { mode?: "t2i" | "i2i" } {
  const mode = imageStudioModeFromQuery(typeof search.mode === "string" ? search.mode : "");
  if (mode === "i2i" || mode === "t2i") return { mode };
  return {};
}

export function videoI2vSearchMode(search: Record<string, unknown>): { mode?: "i2v" | "flf" } {
  const mode = videoStudioModeFromQuery(typeof search.mode === "string" ? search.mode : "");
  if (mode === "flf" || mode === "i2v") return { mode };
  return {};
}
