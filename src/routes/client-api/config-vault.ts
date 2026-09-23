import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-api/config-vault")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { loadRelayVault } = await import("@/studio/server/relay-vault");
          const vault = await loadRelayVault();
          return Response.json({ ok: true, vault });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { saveRelayVault } = await import("@/studio/server/relay-vault");
          const body = (await request.json().catch(() => ({}))) as {
            relays?: any[];
            hiddenPresetIds?: string[];
            imageHost?: any;
          };
          const saved = await saveRelayVault({
            data: {
              relays: body.relays || [],
              hiddenPresetIds: body.hiddenPresetIds || [],
              imageHost: body.imageHost || null,
            },
          });
          return Response.json({ ok: true, saved });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
    },
  },
});
