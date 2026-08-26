import { createFileRoute } from "@tanstack/react-router";
import { VideoStudioPage } from "@/pages/video-studio-page";

export const Route = createFileRoute("/frames")({
  ssr: false,
  component: () => <VideoStudioPage initialMode="extract" />,
});
