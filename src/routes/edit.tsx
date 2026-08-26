import { createFileRoute } from "@tanstack/react-router";
import { ImageStudioPage } from "@/pages/image-studio-page";

function EditStudioRoute() {
  return <ImageStudioPage initialMode="edit" />;
}

export const Route = createFileRoute("/edit")({
  component: EditStudioRoute,
});
