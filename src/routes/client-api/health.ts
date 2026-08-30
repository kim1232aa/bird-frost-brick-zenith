import { createFileRoute } from "@tanstack/react-router";
import { healthPayload } from "@/lib/boundless-proxy.server";

export const Route = createFileRoute("/client-api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { seedRelayVaultFromEnv } = await import("@/studio/server/relay-vault");
          await seedRelayVaultFromEnv();
        } catch (error) {
          console.error("[health] relay vault env seed failed:", error);
        }
        return Response.json(healthPayload());
      },
    },
  },
});
