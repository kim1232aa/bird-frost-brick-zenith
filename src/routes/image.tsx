import { createFileRoute } from "@tanstack/react-router";
import { ImageStudioPage } from "@/pages/image-studio-page";
import { imageStudioSearchMode } from "@/pages/studio-mode-routes";

function ImageStudioRoute() {
  const { mode } = Route.useSearch();
  return <ImageStudioPage initialMode={mode === "i2i" ? "i2i" : "t2i"} />;
}

export const Route = createFileRoute("/image")({
  validateSearch: (search: Record<string, unknown>) => imageStudioSearchMode(search),
  component: ImageStudioRoute,
});
