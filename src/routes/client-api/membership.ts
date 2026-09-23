import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/client-api/membership")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { existsSync, readFileSync, mkdirSync } = await import("node:fs");
          const { join } = await import("node:path");
          const dataDir = join(process.cwd(), "data");
          if (!existsSync(dataDir)) {
            try { mkdirSync(dataDir, { recursive: true }); } catch {}
          }
          const file = join(dataDir, "membership-ledger.json");
          if (!existsSync(file)) {
            return Response.json({
              ok: true,
              credits: { image: 200, video: 40, text: 1000 },
              ledger: [],
            });
          }
          const raw = readFileSync(file, "utf-8");
          const data = JSON.parse(raw);
          return Response.json({ ok: true, ...data });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
          const { join } = await import("node:path");
          const dataDir = join(process.cwd(), "data");
          if (!existsSync(dataDir)) {
            try { mkdirSync(dataDir, { recursive: true }); } catch {}
          }
          const file = join(dataDir, "membership-ledger.json");
          let data = {
            credits: { image: 200, video: 40, text: 1000 },
            ledger: [] as any[],
          };
          if (existsSync(file)) {
            try {
              data = JSON.parse(readFileSync(file, "utf-8"));
            } catch {}
          }
          const body = (await request.json().catch(() => ({}))) as {
            kind?: "image" | "video" | "text";
            delta?: number;
            model?: string;
            reason?: string;
          };
          if (body.kind && typeof body.delta === "number") {
            const cur = (data.credits as any)[body.kind] ?? 0;
            (data.credits as any)[body.kind] = Math.max(0, cur - body.delta);
            data.ledger.unshift({
              id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              at: Date.now(),
              kind: body.kind,
              delta: body.delta,
              model: body.model || "",
              reason: body.reason || "generation",
            });
            if (data.ledger.length > 200) {
              data.ledger = data.ledger.slice(0, 200);
            }
            writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
          }
          return Response.json({ ok: true, credits: data.credits });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 500 });
        }
      },
    },
  },
});
