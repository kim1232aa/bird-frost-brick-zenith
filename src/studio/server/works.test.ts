import { register } from "node:module";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const storageDir = mkdtempSync(join(tmpdir(), "works-server-test-"));
let databaseRows: Array<Record<string, unknown>> = [];

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
    getSql: async () => ({
      query: async <T>(text: string) => {
        if (/^select /i.test(text)) return databaseRows as T[];
        return [] as T[];
      },
    }),
  },
});

mock.module(new URL("./works-path.ts", import.meta.url).href, {
  namedExports: {
    worksStorageDir: () => storageDir,
    worksStorageDirs: () => [storageDir],
    worksFilePath: (name: string) => join(storageDir, name),
  },
});

const { listStudioWorks } = await import("./works.ts");

test.after(() => {
  rmSync(storageDir, { recursive: true, force: true });
});

test("a malformed manifest does not hide valid database works", async () => {
  writeFileSync(join(storageDir, "manifest.json"), "{not-json", "utf8");
  databaseRows = [{
    id: "db-work",
    kind: "image",
    title: "数据库作品",
    prompt: "",
    model: "test-model",
    urls_json: '["/works/db-work.png"]',
    created_at: "2026-09-03T00:00:00.000Z",
  }];

  const works = await listStudioWorks();

  assert.deepEqual(works.map((item) => item.id), ["db-work"]);
});

test("database works preserve their provider id", async () => {
  writeFileSync(join(storageDir, "manifest.json"), JSON.stringify({ items: [] }), "utf8");
  databaseRows = [{
    id: "civitai-work",
    kind: "video",
    title: "Civitai 成片",
    prompt: "new prompt",
    model: "ltx2.3",
    provider_id: "preset-civitai",
    urls_json: '["/works/civitai-work.mp4"]',
    created_at: "2026-09-03T00:00:00.000Z",
  }];

  const works = await listStudioWorks();

  assert.equal(works[0]?.providerId, "preset-civitai");
});
