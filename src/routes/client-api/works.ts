import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-api/works")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { listStudioWorks } = await import("@/studio/server/works");
          const items = await listStudioWorks();
          return Response.json({ ok: true, items });
        } catch (err) {
          return Response.json({ ok: false, error: String(err), items: [] }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { saveStudioWork } = await import("@/studio/server/works");
          const body = await request.json();
          const item = body?.item || body?.data || body;
          const result = await saveStudioWork({ data: item });
          return Response.json(result);
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { removeStudioWork } = await import("@/studio/server/works");
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) {
            return Response.json({ ok: false, error: "Missing id parameter" }, { status: 400 });
          }
          const result = await removeStudioWork({ data: { id } });
          return Response.json(result);
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
    },
  },
});
