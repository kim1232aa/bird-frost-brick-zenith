import assert from "node:assert/strict";
import test from "node:test";
import { studioShellLayout } from "./studio-page-layout.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOCUMENT_PATHS = ["/", "/image", "/edit", "/video", "/i2v", "/frames", "/ecommerce", "/library", "/catalog", "/settings"];
const FLUSH_SCROLL_PATHS = ["/canvas", "/canvas/home", "/account", "/login", "/register", "/admin", "/story"];
const WORKBENCH_PATHS = ["/canvas/workspace"];

test("document pages keep the default scrolling studio-page class", () => {
  for (const path of DOCUMENT_PATHS) {
    const layout = studioShellLayout(path);
    assert.equal(layout.pageClass, "studio-page", path);
    assert.equal(layout.kind, "document", path);
    assert.match(layout.rootClass, /\bstudio-root\b/);
    assert.doesNotMatch(layout.rootClass, /\bis-canvas\b/);
  }
  assert.equal(studioShellLayout("/canvas-repair").kind, "document");
  assert.doesNotMatch(studioShellLayout("/canvas-repair").rootClass, /\bis-canvas\b/);
});

test("account, admin, story, and canvas home use flush-scroll so tall content stays user-scrollable", () => {
  for (const path of FLUSH_SCROLL_PATHS) {
    const layout = studioShellLayout(path);
    assert.equal(layout.pageClass, "studio-page studio-flush studio-flush-scroll", path);
    assert.equal(layout.kind, "flush-scroll", path);
  }
  assert.match(studioShellLayout("/canvas").rootClass, /\bis-canvas\b/);
  assert.doesNotMatch(studioShellLayout("/admin").rootClass, /\bis-canvas\b/);
  assert.doesNotMatch(studioShellLayout("/story").rootClass, /\bis-canvas\b/);
});

test("StudioShell consumes studioShellLayout instead of inlining page-class branches", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "StudioShell.tsx"), "utf8");
  assert.match(source, /studioShellLayout/);
  assert.match(source, /layout\.pageClass/);
  assert.match(source, /layout\.rootClass/);
  assert.doesNotMatch(source, /studio-flush-scroll/);
});

test("only canvas workspace stays workbench-locked", () => {
  for (const path of WORKBENCH_PATHS) {
    const layout = studioShellLayout(path);
    assert.equal(layout.pageClass, "studio-page studio-flush", path);
    assert.equal(layout.kind, "workbench", path);
    assert.match(layout.rootClass, /\bis-canvas\b/);
  }
});

test("near-miss prefixes do not get ops or workbench treatment", () => {
  // /adminfoo looks like /admin but is not the ops route; it must stay a
  // scrollable document page, not a viewport-locked flush page.
  assert.equal(studioShellLayout("/adminfoo").kind, "document");
  assert.equal(studioShellLayout("/adminfoo").pageClass, "studio-page");
  assert.equal(studioShellLayout("/adminfoo").isOps, false);
  assert.equal(studioShellLayout("/admin").isOps, true);
  // /canvas/workspace-xyz is not the workspace route; it is still a canvas
  // page (flush-scroll), but must NOT be treated as a locked workbench.
  assert.equal(studioShellLayout("/canvas/workspace-xyz").kind, "flush-scroll");
  assert.doesNotMatch(studioShellLayout("/canvas/workspace-xyz").pageClass, /^studio-page studio-flush$/);
  assert.match(studioShellLayout("/canvas/workspace-xyz").rootClass, /\bis-canvas\b/);
  assert.equal(studioShellLayout("/canvas/workspace/demo").kind, "flush-scroll");
  assert.doesNotMatch(studioShellLayout("/canvas/workspace/demo").pageClass, /^studio-page studio-flush$/);
  // /canvas/workspace/ with a trailing slash normalizes to the exact route.
  assert.equal(studioShellLayout("/canvas/workspace/").kind, "workbench");
  assert.equal(studioShellLayout("/admin/").kind, "flush-scroll");
});
