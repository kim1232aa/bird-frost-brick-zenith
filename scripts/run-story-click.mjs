import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
const OUT = "/workspace/screenshots/run";
const GALLERY = "/workspace/public/gallery/qingliang";
const RECOVERY = "/workspace/public/recovery/latest-story-canvas.json";
mkdirSync(OUT, { recursive: true });
mkdirSync(GALLERY, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(20_000);
const logs = [];
const wires = [];
page.on("console", (msg) => {
  const text = `[${msg.type()}] ${msg.text()}`;
  if (msg.type() === "error" || /失败|error|Error|Imagine|request_id|refs=/.test(text)) logs.push(text);
});
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
page.on("request", (req) => {
  const url = req.url();
  if (!/local-relay-proxy/.test(url)) return;
  const post = req.postData() || "";
  const isVideo = /videos\/generations/.test(url) || /grok-imagine-video/.test(post);
  const isImage = /images\/generations/.test(url) || /grok-imagine-image/.test(post);
  if (!isVideo && !isImage) return;
  try {
    const body = JSON.parse(post);
    const stills = [
      body.image,
      body.last_frame_image,
      ...(Array.isArray(body.image_urls) ? body.image_urls : []),
      ...(Array.isArray(body.images) ? body.images : []),
    ].filter(Boolean);
    wires.push({
      kind: isVideo ? "video" : "image",
      model: body.model,
      stills: stills.length,
      hasImage: Boolean(body.image),
      hasLast: Boolean(body.last_frame_image),
      imageUrls: Array.isArray(body.image_urls) ? body.image_urls.length : 0,
    });
    logs.push(`[wire] ${isVideo ? "video" : "image"} model=${body.model} stills=${stills.length} last=${Boolean(body.last_frame_image)} image_urls=${Array.isArray(body.image_urls) ? body.image_urls.length : 0}`);
    writeFileSync(`${OUT}/wires.json`, JSON.stringify({ wires, logs }, null, 2));
  } catch {
    logs.push(`[wire] parse-fail ${url.slice(-60)}`);
  }
});

async function shot(name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("SHOT", name, page.url());
}

async function saveMedia(url, name) {
  if (!url) return "";
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return url;
      const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : match[1].includes("mp4") ? "mp4" : "jpg";
      writeFileSync(`${GALLERY}/${name}.${ext}`, Buffer.from(match[2], "base64"));
      return `/gallery/qingliang/${name}.${ext}`;
    }
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "";
    const ext = type.includes("mp4") || type.includes("video") ? "mp4" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    writeFileSync(`${GALLERY}/${name}.${ext}`, buf);
    return `/gallery/qingliang/${name}.${ext}`;
  } catch (error) {
    console.log("saveMedia fail", name, error.message);
    return url;
  }
}

async function dumpStore() {
  return page.evaluate(async () => {
    const mod = await import("/src/app/canvas/stores/use-canvas-store.ts");
    const state = mod.useCanvasStore.getState();
    return state.projects.map((project) => ({
      id: project.id,
      title: project.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      nodes: project.nodes,
      connections: project.connections,
      viewport: project.viewport,
    }));
  });
}

async function writeSeed(projects) {
  const target = (projects || []).find((p) => String(p.title || "").includes("清凉写真")) || (projects || [])[0];
  if (!target) return null;
  let castI = 0;
  let shotI = 0;
  const nodes = [];
  for (const node of target.nodes) {
    const meta = { ...(node.metadata || {}) };
    const url = String(meta.content || meta.backendUrl || "");
    if (node.type === "image" && url) {
      const name = (node.title || "").includes("角色") ? `cast-${++castI}` : `shot-${++shotI}`;
      const local = await saveMedia(url, name);
      meta.content = local;
      meta.backendUrl = local;
    } else if (node.type === "video" && url) {
      const local = await saveMedia(url, "video-1");
      meta.content = local;
      meta.backendUrl = local;
    }
    nodes.push({ ...node, metadata: meta });
  }
  const seed = {
    project: {
      id: "qingliang-nwsf-run",
      title: target.title || "故事 清凉写真NWSF",
      createdAt: target.createdAt,
      updatedAt: new Date().toISOString(),
      nodes,
      connections: target.connections || [],
      chatSessions: [],
      activeChatId: null,
      backgroundMode: "lines",
      showImageInfo: false,
      viewport: target.viewport || { x: 80, y: 40, k: 0.62 },
    },
  };
  writeFileSync(RECOVERY, JSON.stringify(seed, null, 2));
  writeFileSync("/workspace/src/studio/canvas/seed-stamp.ts", `/** Bumped after a live story-director run so the canvas home re-imports the seed. */\nexport const STORY_SEED_STAMP = "${Date.now()}";\n`);
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ logs, wires, title: seed.project.title, nodes: nodes.map((n) => [n.type, n.title, n.metadata?.content]) }, null, 2));
  console.log("WROTE seed", seed.project.nodes.map((n) => `${n.type}:${n.title}`).join(" | "));
  return seed;
}

await page.goto(`${BASE}/story`, { waitUntil: "networkidle", timeout: 45_000 });
await page.waitForTimeout(800);
await page.locator("textarea").first().fill("清凉写真NWSF");
await page.getByRole("button", { name: "5 镜" }).click();
await shot("01-story-ready");
await page.getByRole("button", { name: "一键全流程" }).click();
console.log("clicked 一键全流程");

const deadline = Date.now() + 8 * 60 * 1000;
let last = "";
let pushed = false;
while (Date.now() < deadline) {
  const header = (await page.locator("body").innerText()).match(/(\d+)\/(\d+) 已出图/)?.[0] || "";
  const videos = await page.locator("video").count();
  const imgs = await page.locator(".story-board img, .bp-right img").count();
  const line = `${header} imgs=${imgs} videos=${videos}`;
  if (line !== last) {
    console.log("progress", line);
    last = line;
    writeFileSync(`${OUT}/progress.json`, JSON.stringify({ line, wires, logs: logs.slice(-20) }, null, 2));
  }
  if (header.includes("5/5") && !pushed) {
    const media = await page.evaluate(() => ({
      images: [...document.querySelectorAll(".bp-right img, .story-board img")].map((img) => img.currentSrc || img.src).filter(Boolean),
      videos: [...document.querySelectorAll(".bp-right video, .story-board video")].map((video) => video.currentSrc || video.src).filter(Boolean),
    }));
    writeFileSync(`${OUT}/media.json`, JSON.stringify(media, null, 2));
    console.log("scraped", media.images.length, "images", media.videos.length, "videos");
    await shot("02-stills-ready");
    await page.getByRole("button", { name: "推到画布" }).click();
    await page.waitForTimeout(2000);
    if (/canvas\/workspace/.test(page.url())) {
      await shot("03-workspace-from-stills");
      const projects = await dumpStore();
      await writeSeed(projects);
      await page.goto(`${BASE}/story`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(800);
    } else {
      const projects = await dumpStore().catch(() => []);
      if (projects?.length) await writeSeed(projects);
    }
    pushed = true;
    console.log("pushed stills canvas");
    if (videos > 0) break;
  }
  if (header.includes("5/5") && videos > 0) break;
  await page.waitForTimeout(3000);
}

await shot("04-final-story");
if (!pushed) {
  await page.getByRole("button", { name: "推到画布" }).click();
  await page.waitForTimeout(2500);
}
if (!/canvas\/workspace/.test(page.url())) {
  await page.goto(`${BASE}/canvas/home`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1200);
  const card = page.locator("text=故事 清凉写真NWSF").first();
  if (await card.count()) await card.click();
  await page.waitForTimeout(3000);
}
await shot("05-workspace");
console.log("workspace", page.url());
console.log((await page.locator("body").innerText()).slice(0, 900).replace(/\n/g, " | "));
const projects = await dumpStore();
await writeSeed(projects);
await browser.close();
