import { createFileRoute } from "@tanstack/react-router";
import { proxyWebDav } from "@/lib/boundless-proxy.server";

const handler = ({ request }: { request: Request }) => proxyWebDav(request);

export const Route = createFileRoute("/webdav-proxy")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PUT: handler,
      DELETE: handler,
      OPTIONS: handler,
    },
  },
});
