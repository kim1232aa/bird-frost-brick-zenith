import { createFileRoute } from "@tanstack/react-router";
import { VideoStudioPage } from "@/pages/video-studio-page";

export const Route = createFileRoute("/i2v")({
  ssr: false,
  component: () => <VideoStudioPage initialMode="i2v" />,
});
