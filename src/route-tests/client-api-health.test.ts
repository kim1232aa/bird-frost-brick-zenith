import { register } from "node:module";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

mock.module("@tanstack/react-router", {
  namedExports: {
    createFileRoute: () => (options: unknown) => options,
  },
});
mock.module(new URL("../lib/boundless-proxy.server.ts", import.meta.url).href, {
  namedExports: {
    healthPayload: () => ({ status: "ok" }),
  },
});

let seedCalls = 0;
mock.module(new URL("../studio/server/relay-vault.ts", import.meta.url).href, {
  namedExports: {
    seedRelayVaultFromEnv: async () => {
      seedCalls += 1;
      return { ok: true, seeded: 0 };
    },
  },
});

const { Route } = await import("../routes/client-api/health.ts");

test("health GET is read-only and does not reseed the relay vault", async () => {
  seedCalls = 0;
  const route = Route as unknown as { server: { handlers: { GET: () => Promise<Response> } } };

  const response = await route.server.handlers.GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(seedCalls, 0);
});
