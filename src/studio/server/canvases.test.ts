import { register } from "node:module";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const storageDir = mkdtempSync(join(tmpdir(), "canvases-server-test-"));
let sqlShouldFail = false;
let fsShouldFail = false;

mock.module("@tanstack/react-start", {
  namedExports: {
    createServerFn: () => {
      let validator: ((value: unknown) => unknown) | undefined;
      const builder = {
        validator(next: (value: unknown) => unknown) {
          validator = next;
          return builder;
        },
        handler(next: (input: { data?: unknown }) => unknown) {
          return async (input: { data?: unknown } = {}) => next({
            ...input,
            ...(validator ? { data: validator(input.data) } : {}),
          });
        },
      };
      return builder;
    },
  },
});

mock.module(new URL("../../lib/db.ts", import.meta.url).href, {
  namedExports: {
    getSql: async () => {
      if (sqlShouldFail) {
        throw new Error("Simulated SQL database failure");
      }
      return {
        query: async () => [],
      };
    },
  },
});

mock.module(new URL("./works-path.ts", import.meta.url).href, {
  namedExports: {
    worksStorageDir: () => {
      if (fsShouldFail) {
        return "/dev/null/canvases";
      }
      return storageDir;
    },
    worksStorageDirs: () => [storageDir],
    worksFilePath: (name: string) => join(storageDir, name),
  },
});

const { saveServerCanvas, deleteServerCanvases } = await import("./canvases.ts");

test.after(() => {
  rmSync(storageDir, { recursive: true, force: true });
});

test("saveServerCanvas returns failure when both SQL and disk write fail", async () => {
  sqlShouldFail = true;
  fsShouldFail = true;

  const result = await saveServerCanvas({
    data: {
      id: "test-canvas-fail",
      title: "Test Canvas",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      chatSessions: [],
      activeChatId: null,
      backgroundMode: "dots",
      showImageInfo: false,
      viewport: { x: 0, y: 0, k: 1 },
    },
  });

  assert.equal(result.ok, false);
  assert.match((result as any).error || "", /保存画布失败/);
});

test("saveServerCanvas returns success when at least disk write succeeds", async () => {
  sqlShouldFail = true;
  fsShouldFail = false;

  const result = await saveServerCanvas({
    data: {
      id: "test-canvas-ok",
      title: "Test Canvas",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      chatSessions: [],
      activeChatId: null,
      backgroundMode: "dots",
      showImageInfo: false,
      viewport: { x: 0, y: 0, k: 1 },
    },
  });

  assert.equal(result.ok, true);
});

test("deleteServerCanvases returns failure when both SQL and disk delete fail", async () => {
  sqlShouldFail = true;
  fsShouldFail = true;

  const result = await deleteServerCanvases({
    data: { ids: ["test-canvas-fail"] },
  });

  assert.equal(result.ok, false);
  assert.match((result as any).error || "", /删除画布失败/);
});
