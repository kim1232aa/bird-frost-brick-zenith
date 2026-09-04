import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(projectRoot, "scripts", "patch-nitro-ssr.mjs");
const tempRoot = join(projectRoot, "temp");

function fixture(ssrSource, ssr2Source) {
  mkdirSync(tempRoot, { recursive: true });
  const outputRoot = mkdtempSync(join(tempRoot, "patch-nitro-ssr-"));
  const ssrDir = join(outputRoot, "functions", "__server.func", "_ssr");
  mkdirSync(ssrDir, { recursive: true });
  writeFileSync(join(ssrDir, "ssr.mjs"), ssrSource);
  writeFileSync(join(ssrDir, "ssr2.mjs"), ssr2Source);
  return { outputRoot, ssrDir };
}

function runPatch(outputRoot) {
  return spawnSync(process.execPath, [scriptPath, outputRoot], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

test("patch command repairs the Nitro SSR cycle and is idempotent", () => {
  const sample = fixture(
    'import "../_runtime.mjs";\nimport { a as createServerFn } from "./ssr2.mjs";\nexport { createServerFn as a, ssr_exports as s };\n',
    'import "../_runtime.mjs";\nimport { c as __exportAll$1 } from "./ssr.mjs";\nconst api = __exportAll$1({ value: () => 1 });\nexport { api };\n',
  );
  try {
    const first = runPatch(sample.outputRoot);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const patchedSsr = readFileSync(join(sample.ssrDir, "ssr.mjs"), "utf8");
    const patchedSsr2 = readFileSync(join(sample.ssrDir, "ssr2.mjs"), "utf8");
    assert.match(patchedSsr, /import \* as ssr_exports from "\.\/ssr\.mjs";/);
    assert.doesNotMatch(patchedSsr2, /from "\.\/ssr\.mjs"/);
    assert.match(patchedSsr2, /var __exportAll\$1 = \(all, no_symbols\) =>/);

    const second = runPatch(sample.outputRoot);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.equal(readFileSync(join(sample.ssrDir, "ssr.mjs"), "utf8"), patchedSsr);
    assert.equal(readFileSync(join(sample.ssrDir, "ssr2.mjs"), "utf8"), patchedSsr2);
  } finally {
    rmSync(sample.outputRoot, { recursive: true, force: true });
  }
});

test("patch command fails closed when Nitro no longer emits the expected graph", () => {
  const sample = fixture(
    'import "../_runtime.mjs";\nexport const handler = () => null;\n',
    'import "../_runtime.mjs";\nexport const value = 1;\n',
  );
  try {
    const result = runPatch(sample.outputRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no longer re-exports ssr_exports/);
  } finally {
    rmSync(sample.outputRoot, { recursive: true, force: true });
  }
});
