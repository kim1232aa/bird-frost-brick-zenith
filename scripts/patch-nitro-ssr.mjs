#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const [outputArg, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length) throw new Error(`unexpected argument: ${extraArgs[0]}`);

const outputRoot = outputArg ? resolve(projectRoot, outputArg) : join(projectRoot, ".vercel", "output");
const ssrDir = join(outputRoot, "functions", "__server.func", "_ssr");
const ssrPath = join(ssrDir, "ssr.mjs");
const ssr2Path = join(ssrDir, "ssr2.mjs");
if (!existsSync(ssrPath) || !existsSync(ssr2Path)) {
  throw new Error(`expected _ssr/ssr.mjs and _ssr/ssr2.mjs under ${outputRoot}`);
}

let ssr = readFileSync(ssrPath, "utf8");
if (!/\bssr_exports as /.test(ssr)) {
  throw new Error("ssr.mjs no longer re-exports ssr_exports; drop or update this patch");
}
if (!ssr.includes('import * as ssr_exports from "./ssr.mjs"')) {
  if (!ssr.startsWith('import "../_runtime.mjs";')) {
    throw new Error("ssr.mjs prefix changed; cannot bind ssr_exports");
  }
  ssr = ssr.replace(
    'import "../_runtime.mjs";\n',
    'import "../_runtime.mjs";\nimport * as ssr_exports from "./ssr.mjs";\n',
  );
  writeFileSync(ssrPath, ssr);
}

let ssr2 = readFileSync(ssr2Path, "utf8");
const importRe = /^import \{([^}]+)\} from "\.\/ssr\.mjs";\n/m;
const importMatch = ssr2.match(importRe);
if (importMatch) {
  const exportAllName = importMatch[1].match(/\bas\s+(__exportAll[$\w]*)/)?.[1];
  if (!exportAllName) {
    throw new Error(`ssr2.mjs import from ./ssr.mjs does not bind exportAll; got: ${importMatch[1]}`);
  }
  const helper =
    `var ${exportAllName} = (all, no_symbols) => {\n` +
    "\tlet target = {};\n" +
    "\tfor (var name in all) Object.defineProperty(target, name, {\n" +
    "\t\tget: all[name],\n" +
    "\t\tenumerable: true\n" +
    "\t});\n" +
    "\tif (!no_symbols) Object.defineProperty(target, Symbol.toStringTag, { value: \"Module\" });\n" +
    "\treturn target;\n" +
    "};\n";
  ssr2 = ssr2.replace(importMatch[0], helper);
  writeFileSync(ssr2Path, ssr2);
} else if (!/\bvar __exportAll[$\w]* =/.test(ssr2)) {
  throw new Error("ssr2.mjs does not import ./ssr.mjs; drop or update this patch");
}

const patchedSsr = readFileSync(ssrPath, "utf8");
const patchedSsr2 = readFileSync(ssr2Path, "utf8");
if (!patchedSsr.includes('import * as ssr_exports from "./ssr.mjs"')) {
  throw new Error("ssr.mjs patch did not bind ssr_exports");
}
if (/from "\.\/ssr\.mjs"/.test(patchedSsr2)) {
  throw new Error("ssr2.mjs still imports ./ssr.mjs after cycle break");
}

console.log(`[nitro-ssr-patch] patched ${ssrDir}`);

// Inject production env loader into __server.func/index.mjs
const indexPath = join(outputRoot, "functions", "__server.func", "index.mjs");
if (existsSync(indexPath)) {
  let indexSrc = readFileSync(indexPath, "utf8");
  if (!indexSrc.includes("__auto_load_data_env__")) {
    const envLoader = `// __auto_load_data_env__
try {
  const _fs = await import("node:fs");
  for (const _p of ["/app/data/.env", ".env.test.local"]) {
    if (_fs.existsSync(_p)) {
      const _lines = _fs.readFileSync(_p, "utf-8").split("\\n");
      for (const _l of _lines) {
        const _trim = _l.trim();
        if (_trim && !_trim.startsWith("#") && _trim.includes("=")) {
          const _eq = _trim.indexOf("=");
          const _k = _trim.slice(0, _eq).trim();
          const _v = _trim.slice(_eq + 1).trim();
          if (_k && !process.env[_k]) process.env[_k] = _v;
        }
      }
    }
  }
} catch {}
`;
    writeFileSync(indexPath, envLoader + indexSrc);
    console.log(`[nitro-ssr-patch] injected env loader into ${indexPath}`);
  }
}
