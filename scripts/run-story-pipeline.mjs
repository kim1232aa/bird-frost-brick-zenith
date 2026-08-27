import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8080";
const OUT = "/workspace/screenshots/run";
const GALLERY = "/workspace/public/gallery/qingliang";
const RECOVERY = "/workspace/public/recovery/latest-story-canvas.json";
mkdirSync(OUT, { recursive: true });
mkdirSync(GALLERY, { recursive: true });
mkdirSync("/workspace/public/recovery", { recursive: true });

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const logs = [];
const videoBodies = [];
page.on("console", (msg) => {
  const text = `[${msg.type()}] ${msg.text()}`;
  if (msg.type() === "error" || /失败|error|Error|Imagine|request_id/.test(text)) logs.push(text);
});
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
page.on("request", (req) => {
  const url = req.url();
  if (!/local-relay-proxy/.test(url)) return;
  const post = req.postData();
  if (!post) return;
  const isVideo = /videos\/generations/.test(url) || /"model"\s*:\s*"grok-imagine-video"/.test(post);
  const isImage = /images\/generations/.test(url) || /"model"\s*:\s*"grok-imagine-image/.test(post);
  if (!isVideo && !isImage) return;
  try {
    const body = JSON.parse(post);
    const refCount = [body.image, body.last_frame_image, ...(Array.isArray(body.images) ? body.images : [])].filter(Boolean).length;
    const row = {
      kind: isVideo ? "video" : "image",
      url: url.slice(-80),
      model: body.model,
      hasImage: Boolean(body.image),
      hasLast: Boolean(body.last_frame_image),
      images: Array.isArray(body.images) ? body.images.length : 0,
      refCount,
      prompt: String(body.prompt || "").slice(0, 80),
    };
    videoBodies.push(row);
    logs.push(`[wire] ${row.kind} model=${row.model} refs=${row.refCount} last=${row.hasLast} images=${row.images}`);
  } catch {
    logs.push(`[wire] ${url.slice(-60)} ${post.slice(0, 120)}`);
  }
});

async function shot(name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log("SHOT", name, page.url());
  return path;
}

async function persistUrl(url, name) {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return url;
      const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : match[1].includes("mp4") ? "mp4" : "jpg";
      const dest = `${GALLERY}/${name}.${ext}`;
      writeFileSync(dest, Buffer.from(match[2], "base64"));
      return `/gallery/qingliang/${name}.${ext}`;
    }
    if (url.startsWith("blob:")) {
      const payload = await page.evaluate(async (src) => {
        const res = await fetch(src);
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        return { type: blob.type, bytes: Array.from(new Uint8Array(buf)) };
      }, url);
      const ext = payload.type.includes("png") ? "png" : payload.type.includes("webp") ? "webp" : payload.type.includes("mp4") || payload.type.includes("video") ? "mp4" : "jpg";
      const dest = `${GALLERY}/${name}.${ext}`;
      writeFileSync(dest, Buffer.from(payload.bytes));
      return `/gallery/qingliang/${name}.${ext}`;
    }
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("mp4") || type.includes("video") ? "mp4" : "jpg";
    const dest = `${GALLERY}/${name}.${ext}`;
    writeFileSync(dest, buf);
    return `/gallery/qingliang/${name}.${ext}`;
  } catch (err) {
    console.warn("PERSIST_FAIL", name, err);
    return url;
  }
}

try {
  await page.goto(`${BASE}/story`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot("03-story-ready");

  const errors = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("STORY_BODY", errors.replace(/\s+/g, " ").slice(0, 300));

  const idea = page.locator("textarea").first();
  await idea.waitFor({ state: "visible", timeout: 20_000 });
  const current = await idea.inputValue();
  if (!current.includes("清凉写真")) {
    await idea.fill("清凉写真NWSF");
  }
  await page.getByRole("button", { name: "5 镜" }).click().catch(() => undefined);

  const models = await page.locator(".bp-model-fields").innerText().catch(() => "");
  console.log("MODELS", models.replace(/\s+/g, " ").slice(0, 300));

  const run = page.getByRole("button", { name: /一键全流程/ }).first();
  await run.waitFor({ state: "visible", timeout: 15_000 });
  await run.click();
  console.log("CLICKED 一键全流程");
  await shot("04-story-started");

  const deadline = Date.now() + 18 * 60 * 1000;
  let imgCount = 0;
  let videoCount = 0;
  let lastStatus = "";
  while (Date.now() < deadline) {
    imgCount = await page.locator(".shot-card img, .cast-card img").count();
    videoCount = await page.locator(".shot-card video").count();
    const busy = (await page.locator(".studio-hint, .bp-cta, .card-busy").allInnerTexts().catch(() => [])).join(" | ").slice(0, 280);
    const err = (await page.locator(".studio-error").allInnerTexts().catch(() => [])).join(" | ").slice(0, 280);
    const status = `imgs=${imgCount} videos=${videoCount} busy=${busy} err=${err}`;
    if (status !== lastStatus) {
      console.log(new Date().toISOString(), status);
      lastStatus = status;
    }
    if (imgCount >= 5 && videoCount >= 1) break;
    await page.waitForTimeout(4000);
  }
  await shot("05-story-generated");
  console.log("FINAL_STORY", { imgCount, videoCount, url: page.url(), wires: videoBodies.slice(-8) });
  if (imgCount < 5) {
    throw new Error(`故事导演只出了 ${imgCount} 张图，要求 5 张。logs=${logs.slice(-10).join(" || ")}`);
  }

  const mediaDump = await page.evaluate(() => {
    const shots = [...document.querySelectorAll(".shot-card")].map((card, index) => ({
      index,
      img: card.querySelector("img")?.src || "",
      video: card.querySelector("video")?.src || "",
      title: card.querySelector("b")?.textContent || `shot-${index}`,
    }));
    const cast = [...document.querySelectorAll(".cast-card img")].map((img) => img.src);
    return { shots, cast, text: document.body.innerText.slice(0, 500) };
  });
  console.log("MEDIA_DUMP", JSON.stringify({
    shots: mediaDump.shots.map((item) => ({ index: item.index, hasImg: Boolean(item.img), hasVideo: Boolean(item.video) })),
    cast: mediaDump.cast.length,
  }));

  const persistedCast = [];
  for (let i = 0; i < mediaDump.cast.length; i += 1) {
    persistedCast.push(await persistUrl(mediaDump.cast[i], `cast-${i + 1}`));
  }
  const persistedShots = [];
  for (const item of mediaDump.shots) {
    persistedShots.push({
      ...item,
      img: item.img ? await persistUrl(item.img, `shot-${item.index + 1}`) : "",
      video: item.video ? await persistUrl(item.video, `video-${item.index + 1}`) : "",
    });
  }

  await page.getByRole("button", { name: "推到画布" }).click();
  await page.waitForURL(/\/canvas\/workspace\?id=/, { timeout: 30_000 });
  await page.waitForTimeout(3500);
  await shot("06-canvas-product");

  const productUrl = page.url();
  const canvasId = new URL(productUrl).searchParams.get("id") || "qingliang-nwsf-run";
  const canvasState = await page.evaluate(() => {
    const images = [...document.querySelectorAll("img")].filter((el) => el.naturalWidth > 32).length;
    const videos = document.querySelectorAll("video").length;
    return { images, videos, text: document.body.innerText.slice(0, 400) };
  });
  console.log("PRODUCT", productUrl, canvasState);

  const seedNodes = [
    ...persistedCast.filter(Boolean).map((url, index) => ({
      id: `seed-cast-${index + 1}`,
      type: "image",
      title: `角色 ${index + 1}`,
      position: { x: 640 + (index % 3) * 380, y: 40 },
      width: 340,
      height: 240,
      metadata: { content: url, backendUrl: url, status: "success", prompt: "清凉写真NWSF 角色", storyLabel: "角色" },
    })),
    ...persistedShots.filter((item) => item.img).map((item, index) => ({
      id: `seed-shot-${index + 1}`,
      type: "image",
      title: item.title || `第${index + 1}镜`,
      position: { x: 640 + (index % 5) * 380, y: 320 },
      width: 340,
      height: 240,
      metadata: { content: item.img, backendUrl: item.img, status: "success", prompt: "清凉写真NWSF", storyLabel: `第${index + 1}镜` },
    })),
    ...persistedShots.filter((item) => item.video).map((item, index) => ({
      id: `seed-video-${index + 1}`,
      type: "video",
      title: `${item.title || "分镜"} 视频`,
      position: { x: 640 + index * 460, y: 620 },
      width: 420,
      height: 236,
      metadata: {
        content: item.video,
        backendUrl: item.video,
        status: "success",
        prompt: "清凉写真NWSF · Grok Imagine 视频 · 5 张静帧",
        references: persistedShots.map((row) => row.img).filter(Boolean).slice(0, 5),
      },
    })),
  ];
  const seed = {
    project: {
      id: "qingliang-nwsf-run",
      title: "故事 清凉写真NWSF",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: "seed-story-director",
          type: "story_director",
          title: "故事导演",
          position: { x: 80, y: 40 },
          width: 520,
          height: 640,
          metadata: {
            status: "success",
            storyText: "清凉写真NWSF",
            content: "清凉写真NWSF",
            storyStyle: "清凉写真",
            storyShotCount: 5,
            storyAspectRatio: "16:9",
            storyWorkflow: "analysis",
            storyAnalysisStatus: "success",
            storyGenerationStatus: "success",
            storyShots: persistedShots.map((item, index) => ({
              id: `shot_${index + 1}`,
              index: index + 1,
              title: item.title,
              resultNodeIds: item.img ? [`seed-shot-${index + 1}`] : [],
              status: item.video ? "done" : item.img ? "done" : "pending",
            })),
          },
        },
        ...seedNodes,
      ],
      connections: [],
      chatSessions: [],
      activeChatId: null,
      backgroundMode: "lines",
      showImageInfo: false,
      viewport: { x: 0, y: 0, k: 0.72 },
    },
    liveCanvasId: canvasId,
    liveCanvasUrl: productUrl,
    wires: videoBodies,
  };
  writeFileSync(RECOVERY, JSON.stringify(seed, null, 2));
  writeFileSync("/workspace/src/studio/canvas/seed-stamp.ts", `/** Bumped after a live story-director run so the canvas home re-imports the seed. */\nexport const STORY_SEED_STAMP = "${Date.now()}";\n`);

  await page.goto(`${BASE}/canvas/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await shot("07-canvas-home-records");
  const homeText = await page.locator(".canvas-home-shell").innerText().catch(() => page.locator("body").innerText());
  const ok = imgCount >= 5 && (videoCount >= 1 || canvasState.videos >= 1);
  writeFileSync(`${OUT}/verdict.json`, JSON.stringify({
    ok,
    imgCount,
    videoCount,
    productUrl,
    canvasId,
    media: canvasState,
    homeText: String(homeText).slice(0, 800),
    wires: videoBodies,
    logs: logs.slice(-40),
    recovery: existsSync(RECOVERY),
  }, null, 2));

  if (!ok) process.exitCode = videoCount < 1 ? 3 : 2;
  else process.exitCode = 0;
} catch (err) {
  console.error("FAIL", err);
  await shot("99-fail").catch(() => undefined);
  writeFileSync(`${OUT}/verdict.json`, JSON.stringify({ ok: false, error: String(err), logs: logs.slice(-40), wires: videoBodies }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
