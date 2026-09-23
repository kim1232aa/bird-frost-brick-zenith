import { chromium } from "playwright";
import fs from "node:fs";

async function main() {
  console.log(">>> [clean-verify] Launching host Chromium...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 2560, height: 1440 },
  });
  const page = await context.newPage();

  // 1. 打开画板工程
  const targetUrl = "http://127.0.0.1:18081/canvas/workspace?id=Woc78aJBcLE94HvRuMLTw";
  console.log(`>>> [clean-verify] Navigating to workspace: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });

  console.log(">>> [clean-verify] Waiting for '故事导演' node...");
  await page.waitForSelector("text=故事导演", { timeout: 30000 });

  console.log(">>> [clean-verify] 故事导演 is ready.");
  fs.mkdirSync("/root/temp/screenshots", { recursive: true });
  await page.screenshot({ path: "/root/temp/screenshots/clean_01_ready.png" });

  // 3. 点击“一键全流程”
  console.log(">>> [clean-verify] Clicking '一键全流程' button...");
  const btn = page.locator("button:has-text('一键全流程')").first();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  
  // 等待非 disabled
  for (let i = 0; i < 10; i++) {
    const disabled = await btn.getAttribute("disabled");
    if (disabled === null) break;
    await page.waitForTimeout(1000);
  }
  await btn.click({ force: true });

  console.log(">>> [clean-verify] Actively waiting for all shot images to finish rendering...");
  const maxWaitMs = 90000;
  const startWait = Date.now();
  while (Date.now() - startWait < maxWaitMs) {
    const info = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll(".react-flow__node img"));
      const loadedImgs = images.filter(img => img.complete && img.naturalWidth > 50);
      const loadingCount = document.querySelectorAll(".animate-spin").length;
      return { totalImgs: images.length, loadedImgs: loadedImgs.length, loadingCount };
    });
    console.log(`>>> [clean-verify progress]: Images loaded: ${info.loadedImgs}/${info.totalImgs}, Spinners: ${info.loadingCount}`);
    if (info.loadedImgs >= 5 && info.loadingCount === 0) {
      console.log(">>> [clean-verify] ALL SHOT IMAGES LOADED SUCCESSFULLY!");
      break;
    }
    await page.waitForTimeout(4000);
  }

  await page.waitForTimeout(2000);
  try {
    await page.keyboard.press("Control+1");
    await page.waitForTimeout(1000);
  } catch (e) {}

  await page.screenshot({ path: "/root/temp/screenshots/clean_02_all_images.png" });
  console.log(">>> [clean-verify] Step 2 saved: clean_02_all_images.png");

  await browser.close();
  console.log(">>> [clean-verify] Completed!");
}

main().catch((err) => {
  console.error(">>> [clean-verify] Fatal error:", err);
  process.exit(1);
});
