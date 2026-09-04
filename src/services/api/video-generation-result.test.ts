import assert from "node:assert/strict";
import { register } from "node:module";
import test, { mock } from "node:test";

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

const recordCalls: unknown[] = [];
mock.module("@/studio/history", {
  namedExports: {
    recordGeneratedWork: async (item: unknown) => {
      recordCalls.push(item);
      return item;
    },
  },
});

const { createVideoGenerationResult } = await import("./video-generation-result.ts");

test("video result construction has no hidden history side effect", async () => {
  const globalWithWindow = globalThis as unknown as { window?: Window };
  const previousWindow = globalWithWindow.window;
  globalWithWindow.window = {} as Window;
  recordCalls.length = 0;

  try {
    createVideoGenerationResult([{ url: "https://cdn.example.test/clip.mp4" }], undefined, "Civitai / ltx2.3");
    createVideoGenerationResult([{ blob: new Blob(["video"], { type: "video/mp4" }) }], undefined, "Civitai / ltx2.3");
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    assert.equal(recordCalls.length, 0);
  } finally {
    globalWithWindow.window = previousWindow;
  }
});
