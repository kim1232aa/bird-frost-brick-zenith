import { createFileRoute } from "@tanstack/react-router";
import { proxyLocalRelay } from "@/lib/boundless-proxy.server";

const handler = async ({ request, params }: { request: Request; params: { _splat?: string } }) =>
  proxyLocalRelay(request, params._splat || "");

export const Route = createFileRoute("/local-relay-proxy/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PUT: handler,
      PATCH: handler,
      DELETE: handler,
      OPTIONS: handler,
      HEAD: handler,
    },
  },
});
