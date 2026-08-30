import { createFileRoute } from "@tanstack/react-router";
import { VideoStudioPage } from "@/pages/video-studio-page";
import { videoI2vSearchMode } from "@/pages/studio-mode-routes";

function ImageToVideoRoute() {
  const { mode } = Route.useSearch();
  return <VideoStudioPage initialMode={mode === "flf" ? "flf" : "i2v"} />;
}

export const Route = createFileRoute("/i2v")({
  validateSearch: (search: Record<string, unknown>) => videoI2vSearchMode(search),
  component: ImageToVideoRoute,
});
