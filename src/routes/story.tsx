import { createFileRoute } from "@tanstack/react-router";
import StoryDirectorPage from "@/pages/story-director-page";

export const Route = createFileRoute("/story")({
  ssr: false,
  component: StoryDirectorPage,
});
