import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-api/assets")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { listServerAssets } = await import("@/studio/server/assets");
          return Response.json({ ok: true, items: await listServerAssets() });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error), items: [] }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { saveServerAsset } = await import("@/studio/server/assets");
          const body = (await request.json().catch(() => ({}))) as { asset?: unknown; item?: unknown };
          const result = await saveServerAsset({ data: body.asset || body.item || body });
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { deleteServerAsset } = await import("@/studio/server/assets");
          const id = new URL(request.url).searchParams.get("id") || "";
          return Response.json(await deleteServerAsset({ data: { id } }));
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
      },
    },
  },
});
