import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-api/upload-work-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { uploadStudioWorkMedia } = await import("@/studio/server/works-media");
        return uploadStudioWorkMedia(request);
      },
    },
  },
});
