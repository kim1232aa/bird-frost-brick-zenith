import { createFileRoute } from "@tanstack/react-router";
import { ImageStudioPage } from "@/pages/image-studio-page";

export const Route = createFileRoute("/edit")({
  ssr: false,
  component: () => <ImageStudioPage initialMode="edit" />,
});
