import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
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

const { createZip, readZip } = await import("../lib/zip.ts");
const { exportStudioLibrary, importStudioLibrary } = await import("./library-zip.ts");

test("library ZIP import preserves the public provider id", async () => {
  const zip = await createZip([
    {
      name: "media/000-0.mp4",
      data: new Blob(["video-bytes"], { type: "video/mp4" }),
    },
    {
      name: "manifest.json",
      data: JSON.stringify({
        app: "boundless-studio",
        version: 1,
        items: [{
          kind: "video",
          title: "Civitai LTX 成片",
          prompt: "unique test prompt",
          model: "ltx2.3",
          providerId: "preset-civitai",
          files: ["media/000-0.mp4"],
        }],
      }),
    },
  ]);

  const [item] = await importStudioLibrary(zip);

  assert.equal(item?.providerId, "preset-civitai");
  assert.equal(item?.model, "ltx2.3");
  assert.equal(item?.kind, "video");
});

test("library ZIP import does not fall back to a remote URL when a file is missing", async () => {
  const zip = await createZip([
    {
      name: "manifest.json",
      data: JSON.stringify({
        app: "boundless-studio",
        version: 1,
        items: [{
          kind: "video",
          title: "失效远程成片",
          prompt: "unique remote fallback prompt",
          model: "ltx2.3",
          urls: ["https://cdn.example.test/expired.mp4"],
          files: ["media/missing.mp4"],
        }],
      }),
    },
  ]);

  await assert.rejects(() => importStudioLibrary(zip), /压缩包里没有可用素材/u);
});

test("library ZIP export omits remote URLs and keeps only public metadata", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new Blob(["video-bytes"], { type: "video/mp4" }), { status: 200 })) as typeof fetch;
  try {
    const zip = await exportStudioLibrary([{
      id: "work-1",
      kind: "video",
      title: "公开作品",
      prompt: "unique export prompt",
      model: "ltx2.3",
      providerId: "preset-civitai",
      urls: ["https://cdn.example.test/clip.mp4?token=secret"],
      createdAt: 1,
    }]);
    const manifestFile = (await readZip(zip)).get("manifest.json");
    assert.ok(manifestFile);
    const manifest = JSON.parse(await manifestFile.text()) as { items?: Array<Record<string, unknown>> };
    assert.deepEqual(manifest.items?.[0]?.urls, []);
    assert.equal(manifest.items?.[0]?.providerId, "preset-civitai");
    assert.equal(JSON.stringify(manifest).includes("secret"), false);
  } finally {
    globalThis.fetch = original;
  }
});
