import { createFileRoute } from "@tanstack/react-router";
import { VideoStudioPage } from "@/pages/video-studio-page";

function FrameExtractRoute() {
  return <VideoStudioPage initialMode="extract" />;
}

export const Route = createFileRoute("/frames")({
  component: FrameExtractRoute,
});
