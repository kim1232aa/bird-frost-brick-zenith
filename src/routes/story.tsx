import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/story")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({
      to: "/canvas/workspace",
      search: { entry: "story" },
    });
  },
});
