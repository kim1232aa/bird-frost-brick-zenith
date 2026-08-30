import assert from "node:assert/strict";
import test from "node:test";
import {
  ecommerceDisabledReason,
  ecommerceDownloadName,
  ecommerceMediaExt,
  ecommerceNeedsProxy,
  ecommercePackErrorSummary,
  ecommercePackFinishMessage,
  ecommercePrimaryLabel,
  ecommerceShouldAbortPack,
  ecommerceSuiteHd,
  ecommerceSuiteImageParams,
  ecommerceSuiteSize,
  ecommerceZipEntryName,
} from "./ecommerce-suite-page.logic.ts";

test("连续套图 vs 独立高清 changes the size actually sent", () => {
  assert.equal(ecommerceSuiteHd(true), false);
  assert.equal(ecommerceSuiteHd(false), true);

  assert.deepEqual(ecommerceSuiteImageParams("preset-volcengine-plan::doubao-seedream-5.0-lite", false), { size: "2K" });
  assert.deepEqual(ecommerceSuiteImageParams("preset-volcengine-plan::doubao-seedream-5.0-lite", true), { size: "3K" });
  assert.notEqual(
    ecommerceSuiteSize("preset-volcengine-plan::doubao-seedream-5.0-lite", false),
    ecommerceSuiteSize("preset-volcengine-plan::doubao-seedream-5.0-lite", true),
  );

  assert.equal(ecommerceSuiteSize("preset-openai::gpt-image-2", false), "1024x1024");
  assert.equal(ecommerceSuiteSize("preset-openai::gpt-image-2", true), "1536x1536");

  assert.equal(ecommerceSuiteSize("preset-grok-relay::grok-imagine-image-2.0", false), "1k");
  assert.equal(ecommerceSuiteSize("preset-grok-relay::grok-imagine-image-2.0", true), "2k");

  assert.deepEqual(ecommerceSuiteImageParams("preset-civitai::flux1", false), {
    size: "1024x1024",
    width: 1024,
    height: 1024,
  });
  assert.deepEqual(ecommerceSuiteImageParams("preset-civitai::flux1", true), {
    size: "1536x1536",
    width: 1536,
    height: 1536,
  });

  assert.deepEqual(ecommerceSuiteImageParams("preset-civitai::seedream-4.5", false), {
    size: "1024x1024",
    width: 1024,
    height: 1024,
  });
  assert.deepEqual(ecommerceSuiteImageParams("preset-civitai::seedream-4.5", true), {
    size: "1536x1536",
    width: 1536,
    height: 1536,
  });

  assert.equal(ecommerceSuiteSize("preset-agnes::agnes-image", false), "1K");
  assert.equal(ecommerceSuiteSize("preset-agnes::agnes-image", true), "2K");

  assert.equal(ecommerceSuiteSize("preset-fal::flux-dev", false), "模型默认");
  assert.equal(ecommerceSuiteSize("preset-fal::flux-dev", true), "模型默认");
});

test("ecommerce dimensions are limited to adapters with a verified width/height wire", () => {
  assert.deepEqual(ecommerceSuiteImageParams("preset-fal::flux-dev", false, "fal"), {});
  assert.deepEqual(ecommerceSuiteImageParams("preset-fal::flux-dev", true, "fal"), {});

  assert.deepEqual(ecommerceSuiteImageParams("preset-civitai::civitai-grok", false, "civitai"), {
    aspectRatio: "1:1",
  });
  assert.equal(ecommerceSuiteImageParams("preset-civitai::civitai-grok", false, "civitai").width, undefined);
  assert.equal(ecommerceSuiteImageParams("preset-civitai::civitai-grok", false, "civitai").height, undefined);

  assert.deepEqual(ecommerceSuiteImageParams("preset-aliyun-dashscope::qwen-image-plus", false, "dashscope"), {
    size: "1K",
    aspectRatio: "1:1",
  });
  assert.equal(ecommerceSuiteImageParams("preset-aliyun-dashscope::qwen-image-plus", false, "dashscope").width, undefined);
  assert.equal(ecommerceSuiteImageParams("preset-aliyun-dashscope::qwen-image-plus", false, "dashscope").height, undefined);

  assert.deepEqual(ecommerceSuiteImageParams("preset-superxihe-image::gpt-image-2", false), {
    size: "1024x1024",
  });
  assert.deepEqual(ecommerceSuiteImageParams("custom::gpt-image-2", false, "openai-official"), {
    size: "1024x1024",
  });
});

test("download names follow the real media type instead of always jpg/png", () => {
  assert.equal(ecommerceMediaExt("https://cdn.example/hero.png"), "png");
  assert.equal(ecommerceMediaExt("https://cdn.example/hero.jpg?token=1"), "jpg");
  assert.equal(ecommerceMediaExt("https://cdn.example/hero.jpeg"), "jpg");
  assert.equal(ecommerceMediaExt("https://cdn.example/hero.webp"), "webp");
  assert.equal(ecommerceMediaExt("data:image/jpeg;base64,abc"), "jpg");
  assert.equal(ecommerceMediaExt("data:image/png;base64,abc"), "png");
  assert.equal(ecommerceDownloadName("正面主图", "https://cdn.example/a.jpg"), "正面主图.jpg");
  assert.equal(ecommerceZipEntryName({ id: "hero", label: "正面主图" }, "https://cdn.example/a.jpg"), "hero-正面主图.jpg");
  assert.equal(ecommerceZipEntryName({ id: "hero", label: "正面主图" }, "https://cdn.example/a.png"), "hero-正面主图.png");
  assert.equal(ecommerceNeedsProxy("https://cdn.example/a.png"), true);
  assert.equal(ecommerceNeedsProxy("data:image/png;base64,abc"), false);
  assert.equal(ecommerceNeedsProxy("blob:https://app/1"), false);
});

test("pack finish copy does not claim 已完成 when shots failed", () => {
  assert.equal(ecommercePackFinishMessage(6, 0, 6), "6/6 已完成");
  assert.equal(ecommercePackFinishMessage(0, 6, 6), "6/6 全部失败");
  assert.equal(ecommercePackFinishMessage(4, 2, 6), "4/6 完成 · 2 张失败");
  assert.equal(ecommercePackErrorSummary(6, 0), "");
  assert.equal(ecommercePackErrorSummary(0, 6), "6 张全部失败");
  assert.equal(ecommercePackErrorSummary(4, 2), "2 张未出，已完成 4 张");
  assert.equal(ecommerceShouldAbortPack("积分不足，需要 1 点"), true);
  assert.equal(ecommerceShouldAbortPack("请先登录或选择访客继续"), true);
  assert.equal(ecommerceShouldAbortPack("生图超时，请换模型或稍后重试"), false);
});

test("guest block and empty product disable generate; HD changes the primary label", () => {
  assert.equal(
    ecommerceDisabledReason({ generating: false, progress: "", blockedReason: "请先登录或选择访客继续", product: "杯" }),
    "请先登录或选择访客继续",
  );
  assert.equal(
    ecommerceDisabledReason({ generating: false, progress: "", blockedReason: "", product: "" }),
    "请先填写产品描述",
  );
  assert.equal(
    ecommerceDisabledReason({ generating: true, progress: "1/6 生成中 · 正面主图", blockedReason: "", product: "杯" }),
    "1/6 生成中 · 正面主图",
  );
  assert.equal(
    ecommercePrimaryLabel({ generating: false, progress: "", batch: true, shotCount: 6 }),
    "生成整套 6",
  );
  assert.equal(
    ecommercePrimaryLabel({ generating: false, progress: "", batch: false, shotCount: 6 }),
    "高清生成整套 6",
  );
});
