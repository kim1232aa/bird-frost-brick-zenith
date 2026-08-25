import { createFileRoute } from "@tanstack/react-router";
import { proxyFetchUrl } from "@/lib/boundless-proxy.server";

export const Route = createFileRoute("/client-api/fetch-url")({
  server: {
    handlers: {
      GET: ({ request }) => proxyFetchUrl(request),
    },
  },
});
