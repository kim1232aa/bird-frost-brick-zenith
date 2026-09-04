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

const axiosCalls: Array<{ url: string; body: FormData; config?: { headers?: Record<string, string> } }> = [];
const imageHostVaultRequests: Array<{ baseUrl: string; apiKey: string }> = [];
const axiosMock = {
  post: async (url: string, body: FormData, config?: { headers?: Record<string, string> }) => {
    axiosCalls.push({ url, body, config });
    return { data: { url: "https://cdn.example.test/uploaded.png" } };
  },
  isAxiosError: () => false,
  interceptors: { request: { use: () => undefined } },
};
mock.module("axios", {
  defaultExport: axiosMock,
  namedExports: { isAxiosError: axiosMock.isAxiosError },
});
mock.module(new URL("../stores/use-config-store.ts", import.meta.url).href, {
  namedExports: {
    persistImageHostCredential: async (baseUrl: string, apiKey: string) => {
      imageHostVaultRequests.push({ baseUrl, apiKey });
      return { ok: true, baseUrl, hasApiKey: Boolean(apiKey) };
    },
  },
});
mock.module(new URL("./image-storage.ts", import.meta.url).href, {
  namedExports: { imageToDataUrl: async () => "" },
});

const { uploadImageToConfiguredHost } = await import("./image-host-upload.ts");

test.beforeEach(() => {
  axiosCalls.length = 0;
  imageHostVaultRequests.length = 0;
});

test("image-host upload stores a transient Key first and never puts it in the upload request", async () => {
  const secret = "synthetic-image-host-browser-secret";
  const result = await uploadImageToConfiguredHost(
    { imageHostBaseUrl: "https://images.example.test", imageHostApiKey: secret },
    new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    "reference.png",
    { requirePublicResult: true },
  );

  assert.equal(result, "https://cdn.example.test/uploaded.png");
  assert.deepEqual(imageHostVaultRequests, [{ baseUrl: "https://images.example.test", apiKey: secret }]);
  assert.equal(axiosCalls.length, 1);
  assert.equal(axiosCalls[0]?.url, "/client-api/upload-image-host");
  const headers = new Headers(axiosCalls[0]?.config?.headers);
  assert.equal(headers.get("x-image-host-base-url"), "https://images.example.test");
  assert.equal(headers.get("x-image-host-key"), null);
  assert.equal(headers.get("authorization"), null);
  assert.equal(JSON.stringify(axiosCalls[0]?.config || {}).includes(secret), false);
});
