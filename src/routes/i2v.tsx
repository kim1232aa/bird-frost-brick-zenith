import { createFileRoute } from "@tanstack/react-router";
import { VideoStudioPage } from "@/pages/video-studio-page";

function ImageToVideoRoute() {
  return <VideoStudioPage initialMode="i2v" />;
}

export const Route = createFileRoute("/i2v")({
  component: ImageToVideoRoute,
});
