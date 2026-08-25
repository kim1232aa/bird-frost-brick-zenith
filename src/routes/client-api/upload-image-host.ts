import { createFileRoute } from "@tanstack/react-router";
import { proxyImageHostUpload } from "@/lib/boundless-proxy.server";

export const Route = createFileRoute("/client-api/upload-image-host")({
  server: {
    handlers: {
      POST: ({ request }) => proxyImageHostUpload(request),
    },
  },
});
