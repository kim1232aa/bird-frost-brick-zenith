import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";

const inner = createStartHandler(defaultStreamHandler);

export type ServerEntry = { fetch: RequestHandler<Register> };

function isAbortLike(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string; name?: string };
  };
  const code = record.code || record.cause?.code || "";
  const name = record.name || record.cause?.name || "";
  const message = `${record.message || ""} ${record.cause?.message || ""}`;
  return (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ABORT_ERR" ||
    name === "AbortError" ||
    /aborted|abort/i.test(message)
  );
}

async function wrapFetch(...args: Parameters<RequestHandler<Register>>) {
  const request = args[0];
  try {
    return await inner(...args);
  } catch (error) {
    // Client already gone (preview proxy / navigation). Never replace the
    // document with a fake "retry" page — that page has no app runtime and
    // loops /canvas/home forever.
    if (isAbortLike(error) || request.signal.aborted) {
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
    }
    throw error;
  }
}

export default {
  fetch: wrapFetch,
} satisfies ServerEntry;
