import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readCss(file: string) {
  return fs.readFileSync(path.join(srcRoot, file), "utf8");
}

function ruleBodies(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g"))].map((match) =>
    match[1].replace(/\s+/g, " ").trim(),
  );
}

function decl(body: string, property: string) {
  const match = body.match(new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+);`, "i"));
  return match?.[1]?.trim() ?? "";
}

test("generic document pages must not use overflow:hidden; only the settings wire desk may clip", () => {
  const light = readCss("studio-light.css");
  const brand = readCss("brand.css");
  const genericLight = ruleBodies(light, ".studio-page:not(.studio-flush)").filter(
    (body) => /overflow\s*:/.test(body) && !/wire-desk/.test(body),
  );
  for (const body of genericLight) {
    assert.doesNotMatch(
      decl(body, "overflow"),
      /hidden|clip/,
      `studio-light .studio-page:not(.studio-flush) overflow must stay user-scrollable, got ${body}`,
    );
  }
  const genericBrand = ruleBodies(brand, ".studio-page:not(.studio-flush)").filter((body) => /overflow\s*:/.test(body));
  assert.equal(genericBrand.length, 0, "brand.css must not lock all non-flush pages");
  const wireDesk = ruleBodies(brand, ".studio-page:not(.studio-flush):has(.wire-desk)");
  assert.ok(wireDesk.some((body) => /overflow\s*:\s*hidden/.test(body)), "settings wire desk may keep overflow:hidden");
});

test("flush-scroll pages keep overflow:auto and a flex-constrained height, not height:auto !important", () => {
  const brand = readCss("brand.css");
  const bodies = ruleBodies(brand, ".studio-page.studio-flush-scroll");
  assert.ok(bodies.length > 0, "missing .studio-page.studio-flush-scroll rule");
  const overflow = bodies.map((body) => decl(body, "overflow")).find(Boolean) || "";
  assert.match(overflow, /auto|scroll/, `flush-scroll overflow is ${overflow || "(unset)"}`);
  for (const body of bodies) {
    const height = decl(body, "height");
    assert.doesNotMatch(
      height,
      /^auto(\s*!important)?$/,
      "height:auto !important makes the scroller grow and get clipped by studio-root",
    );
  }
});

test("studio-root stays a viewport shell while document studio-page remains a scroll container", () => {
  const brand = readCss("brand.css");
  const light = readCss("studio-light.css");
  const rootBodies = [...ruleBodies(brand, ".studio-root"), ...ruleBodies(light, ".studio-root")];
  assert.ok(
    rootBodies.some((body) => /overflow\s*:\s*hidden/.test(body) || /height\s*:\s*100vh/.test(body)),
    "studio-root should keep a viewport-sized app shell",
  );
  const pageBodies = ruleBodies(brand, ".studio-page");
  const pageOverflow = pageBodies.map((body) => decl(body, "overflow")).find(Boolean) || "";
  assert.match(pageOverflow, /auto|scroll/, `brand .studio-page overflow is ${pageOverflow || "(unset)"}`);
});

test("mobile flush-scroll rules keep a scroll container under the clipped root", () => {
  const mobile = readCss("studio-mobile.css");
  const bodies = ruleBodies(mobile, ".studio-page.studio-flush-scroll");
  for (const body of bodies) {
    const overflow = decl(body, "overflow");
    if (!overflow) continue;
    assert.doesNotMatch(
      overflow,
      /visible/,
      "overflow:visible inside overflow:hidden studio-root still cannot scroll",
    );
  }
});

test("no dead #app selectors: the app mounts in <body> with a .studio-root shell", () => {
  for (const file of ["styles.css", "studio.css", "studio-extra.css", "studio-light.css", "brand.css", "studio-mobile.css"]) {
    const css = readCss(file);
    assert.doesNotMatch(
      css,
      /#app\b/,
      `${file} must not target the non-existent #app element`,
    );
  }
});

test("studio-root uses a definite viewport height, not a percentage that resolves to auto", () => {
  const brand = readCss("brand.css");
  const bodies = ruleBodies(brand, ".studio-root");
  const height = bodies.map((body) => decl(body, "height")).find(Boolean) || "";
  assert.match(
    height,
    /100vh|100dvh|100svh/,
    `brand .studio-root height must be a definite viewport unit, got ${height || "(unset)"}`,
  );
});

test("mobile settings panes allow wheel chaining to the outer page scrollport", () => {
  const mobile = readCss("studio-mobile.css");
  const paneRules = [
    ...mobile.matchAll(/(?:\.wire-list\s*,\s*\.wire-editor|\.wire-editor\s*,\s*\.wire-list)\s*\{([^}]+)\}/g),
  ].map((match) => match[1].replace(/\s+/g, " ").trim());
  assert.ok(
    paneRules.some((body) => decl(body, "overscroll-behavior") === "auto"),
    "stacked mobile wire panes must override desktop overscroll-behavior:contain so wheel input reaches .studio-page",
  );
});

test("mobile settings page: wire desk pages become a scrollport, not a clipped 100vh trap", () => {
  const mobile = readCss("studio-mobile.css");
  const pageBodies = ruleBodies(mobile, ".studio-page:not(.studio-flush):has(.wire-desk)");
  assert.ok(pageBodies.length > 0, "mobile must override the desktop wire-desk page lock");
  for (const body of pageBodies) {
    const overflow = decl(body, "overflow");
    if (!overflow) continue;
    assert.doesNotMatch(overflow, /hidden|clip/, `mobile wire-desk page overflow is ${overflow}`);
  }
  const deskBodies = ruleBodies(mobile, ".studio-page:not(.studio-flush):has(.wire-desk) > .wire-desk");
  assert.ok(deskBodies.length > 0, "mobile must override the desktop wire-desk sizing rule");
  for (const body of deskBodies) {
    const height = decl(body, "height");
    assert.doesNotMatch(height, /^100%$/, "mobile wire-desk must not lock to 100% height");
    const maxHeight = decl(body, "max-height");
    assert.doesNotMatch(maxHeight, /^calc/, "mobile wire-desk must not keep a viewport max-height");
  }
});
