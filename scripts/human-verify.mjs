import { chromium } from "playwright";
import fs from "node:fs";

async function main() {
  console.log(">>> [human-verify] Launching host Chromium...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
  });
  const page = await context.newPage();

  const targetUrl = "http://127.0.0.1:18081/canvas/workspace?id=Woc78aJBcLE94HvRuMLTw";
  console.log(`>>> [human-verify] Navigating to: ${targetUrl}`);
  page.on("console", (msg) => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
  page.on("requestfailed", (req) => console.log(`[Browser Request Failed]:`, req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.url().includes("/api/")) {
      console.log(`[Browser API Response]:`, res.status(), res.url());
    }
  });
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });

  console.log(">>> [human-verify] Waiting for '故事导演' node...");
  await page.waitForSelector("text=故事导演", { timeout: 30000 });

  fs.mkdirSync("/root/temp/screenshots", { recursive: true });
  await page.screenshot({ path: "/root/temp/screenshots/human_01_loaded.png" });
  console.log(">>> [human-verify] Step 1 saved: human_01_loaded.png");

  console.log(">>> [human-verify] Waiting for '一键全流程' button to be ready...");
  const btn = page.locator("button:has-text('一键全流程')").first();
  await btn.waitFor({ state: "visible", timeout: 20000 });

  for (let i = 0; i < 15; i++) {
    const disabled = await btn.getAttribute("disabled");
    if (disabled === null) break;
    console.log(">>> Button is disabled (previous task pending), waiting 2s...");
    await page.waitForTimeout(2000);
  }

  console.log(">>> [human-verify] Clicking '一键全流程' button...");
  await btn.click();

  console.log(">>> [human-verify] Waiting 15s for analysis and shots generation...");
  await page.waitForTimeout(15000);

  // 适应画布
  try {
    await page.keyboard.press("Control+1");
  } catch (e) {}

  await page.screenshot({ path: "/root/temp/screenshots/human_02_generated.png" });
  console.log(">>> [human-verify] Step 2 saved: human_02_generated.png");

  console.log(">>> [human-verify] Actively waiting for all shot images to finish rendering...");
  const maxWaitMs = 150000;
  const startWait = Date.now();
  while (Date.now() - startWait < maxWaitMs) {
    const info = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll(".react-flow__node img"));
      const loadedImgs = images.filter(img => img.complete && img.naturalWidth > 50);
      const loadingCount = document.querySelectorAll(".animate-spin").length;
      return { totalImgs: images.length, loadedImgs: loadedImgs.length, loadingCount };
    });
    console.log(`>>> [human-verify progress]: Images loaded: ${info.loadedImgs}, Loading spinners: ${info.loadingCount}`);
    if (info.loadedImgs >= 5 && info.loadingCount === 0) {
      console.log(">>> [human-verify] ALL SHOT IMAGES LOADED SUCCESSFULLY!");
      break;
    }
    await page.waitForTimeout(5000);
  }
  await page.waitForTimeout(3000);

  // 再次全屏适应画布
  try {
    await page.keyboard.press("Control+1");
    await page.waitForTimeout(1000);
  } catch (e) {}

  await page.screenshot({ path: "/root/temp/screenshots/human_03_final_images.png" });
  console.log(">>> [human-verify] Step 3 saved: human_03_final_images.png");

  await browser.close();
  console.log(">>> [human-verify] Verification completed!");
}

main().catch((err) => {
  console.error(">>> [human-verify] Fatal error:", err);
  process.exit(1);
});
