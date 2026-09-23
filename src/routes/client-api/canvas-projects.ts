import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-api/canvas-projects")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { listServerCanvases } = await import("@/studio/server/canvases");
          const items = await listServerCanvases();
          return Response.json({ ok: true, items: items || [] });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { saveServerCanvas } = await import("@/studio/server/canvases");
          const body = (await request.json().catch(() => ({}))) as { project?: any };
          if (!body.project?.id) {
            return Response.json({ ok: false, error: "Missing project id" }, { status: 400 });
          }
          const result = await saveServerCanvas({ data: body.project });
          if (!result.ok) {
            return Response.json({ ok: false, error: (result as any).error || "保存失败" }, { status: 500 });
          }
          return Response.json({ ok: true });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const { deleteServerCanvases } = await import("@/studio/server/canvases");
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (id) {
            const result = await deleteServerCanvases({ data: { ids: [id] } });
            if (!result.ok) {
              return Response.json({ ok: false, error: (result as any).error || "删除失败" }, { status: 500 });
            }
          }
          return Response.json({ ok: true });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
    },
  },
});
