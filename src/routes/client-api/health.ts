import { createFileRoute } from "@tanstack/react-router";
import { healthPayload } from "@/lib/boundless-proxy.server";

export const Route = createFileRoute("/client-api/health")({
  server: {
    handlers: {
      GET: async () => Response.json(healthPayload()),
    },
  },
});
