import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { worksFilePath, worksStorageDir } from "./works-path.ts";

test("vercel preview cwd stores works under static/works, not public/works", () => {
  const root = mkdtempSync(join(tmpdir(), "works-static-"));
  mkdirSync(join(root, "static"));
  assert.equal(worksStorageDir(root), join(root, "static", "works"));
  assert.equal(worksFilePath("abc-0.jpg", root), join(root, "static", "works", "abc-0.jpg"));
});

test("vite cwd without static/ still uses public/works", () => {
  const root = mkdtempSync(join(tmpdir(), "works-public-"));
  assert.equal(worksStorageDir(root), join(root, "public", "works"));
});

test("worksFilePath rejects path traversal", () => {
  assert.equal(worksFilePath("../secret.jpg"), "");
  assert.equal(worksFilePath("a/b.jpg"), "");
});

test("vercel preview also mirrors into static/works when both trees exist", async () => {
  const { worksStorageDirs } = await import("./works-path.ts");
  const root = mkdtempSync(join(tmpdir(), "works-both-"));
  mkdirSync(join(root, "static"));
  mkdirSync(join(root, "public"));
  assert.deepEqual(worksStorageDirs(root), [join(root, "static", "works")]);
});
