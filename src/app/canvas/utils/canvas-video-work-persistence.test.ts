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

const { persistCanvasVideoWorks } = await import("./canvas-video-work-persistence.ts");

test("canvas video works are recorded serially with provider metadata", async () => {
  const calls: Array<Record<string, unknown>> = [];
  await persistCanvasVideoWorks({
    videos: [{ url: "blob:first" }, { url: "/works/second.mp4" }],
    title: "镜头二",
    prompt: "unique canvas prompt",
    model: "ltx2.3",
    providerId: "preset-civitai",
    record: async (item) => {
      calls.push(item as Record<string, unknown>);
      return undefined;
    },
  });

  assert.deepEqual(calls, [
    {
      kind: "video",
      title: "镜头二",
      prompt: "unique canvas prompt",
      model: "ltx2.3",
      providerId: "preset-civitai",
      urls: ["blob:first"],
    },
    {
      kind: "video",
      title: "镜头二",
      prompt: "unique canvas prompt",
      model: "ltx2.3",
      providerId: "preset-civitai",
      urls: ["/works/second.mp4"],
    },
  ]);
});

test("canvas video persistence rejects an unmaterialized remote URL", async () => {
  let callCount = 0;
  await assert.rejects(
    () => persistCanvasVideoWorks({
      videos: [{ url: "https://cdn.example.test/clip.mp4" }],
      prompt: "prompt",
      model: "model",
      record: async () => {
        callCount += 1;
        return undefined;
      },
    }),
    /拒绝直接写入远程 URL/u,
  );
  assert.equal(callCount, 0);
});

test("canvas video persistence surfaces a server indexing failure", async () => {
  await assert.rejects(
    () => persistCanvasVideoWorks({
      videos: [{ url: "blob:video" }],
      prompt: "prompt",
      model: "ltx2.3",
      record: async () => ({ persistError: "作品媒体上传失败 HTTP 503" }),
    }),
    /作品库保存失败：作品媒体上传失败 HTTP 503/u,
  );
});
