import assert from "node:assert/strict";
import test from "node:test";
import { buildMediaCanvasProject, canvasModelFromSelection, mediaCanvasProjectTitle } from "./media-workspace-project.ts";

test("image drop becomes an image node with media url", () => {
  const project = buildMediaCanvasProject({
    kind: "image",
    url: "https://example.test/a.png",
    prompt: "红裙夜景",
    model: "preset::flux",
  });
  assert.equal(project.title, "图片 红裙夜景");
  assert.equal(project.nodes.length, 1);
  assert.equal(project.nodes[0].type, "image");
  assert.equal(project.nodes[0].metadata.content, "https://example.test/a.png");
  assert.equal(project.nodes[0].metadata.backendUrl, "https://example.test/a.png");
  assert.equal(project.nodes[0].metadata.prompt, "红裙夜景");
  assert.equal(project.nodes[0].metadata.model, "flux");
  assert.equal(project.nodes[0].metadata.modelProviderId, "preset");
  assert.equal(project.nodes[0].metadata.status, "success");
});

test("upload drop is an image node, video drop is a video node", () => {
  const upload = buildMediaCanvasProject({
    kind: "upload",
    url: "/gallery/seed.png",
    prompt: "样张",
    title: "参考样张",
  });
  assert.equal(upload.nodes[0].type, "image");
  assert.equal(mediaCanvasProjectTitle({ kind: "upload", title: "参考样张" }), "上传 参考样张");

  const video = buildMediaCanvasProject({
    kind: "video",
    url: "https://example.test/clip.mp4",
    prompt: "镜头推进",
  });
  assert.equal(video.nodes[0].type, "video");
  assert.equal(video.nodes[0].metadata.content, "https://example.test/clip.mp4");
  assert.equal(video.title, "视频 镜头推进");
});

test("prompt drop is a text node even without url", () => {
  const project = buildMediaCanvasProject({
    kind: "prompt",
    prompt: "一座雨夜码头",
    text: "一座雨夜码头",
  });
  assert.equal(project.nodes.length, 1);
  assert.equal(project.nodes[0].type, "text");
  assert.equal(project.nodes[0].metadata.content, "一座雨夜码头");
  assert.equal(project.title, "提示 一座雨夜码头");
});

test("image drop with several urls lays out one node per unique url", () => {
  const project = buildMediaCanvasProject({
    kind: "image",
    url: "https://example.test/a.png",
    urls: ["https://example.test/a.png", "https://example.test/b.png", ""],
    prompt: "一组静帧",
  });
  assert.equal(project.nodes.length, 2);
  assert.deepEqual(
    project.nodes.map((node) => node.metadata.content),
    ["https://example.test/a.png", "https://example.test/b.png"],
  );
  const videoPrefersUrl = buildMediaCanvasProject({
    kind: "video",
    url: "https://example.test/primary.mp4",
    urls: ["https://example.test/other.mp4", "https://example.test/primary.mp4"],
  });
  assert.equal(videoPrefersUrl.nodes[0].metadata.content, "https://example.test/primary.mp4");
  assert.equal(project.nodes[1].position.x > project.nodes[0].position.x, true);
});

test("video without url falls back to a text node", () => {
  const project = buildMediaCanvasProject({ kind: "video", prompt: "还没有成片" });
  assert.equal(project.nodes.length, 1);
  assert.equal(project.nodes[0].type, "text");
  assert.equal(project.nodes[0].metadata.content, "还没有成片");
});

test("catalog selection splits into model and modelProviderId for image, video, and prompt nodes", () => {
  const image = buildMediaCanvasProject({
    kind: "image",
    url: "https://example.test/a.png",
    model: "preset-civitai::flux1",
  });
  assert.equal(image.nodes[0].metadata.model, "flux1");
  assert.equal(image.nodes[0].metadata.modelProviderId, "preset-civitai");

  const video = buildMediaCanvasProject({
    kind: "video",
    url: "https://example.test/clip.mp4",
    model: "preset-grok-relay::grok-imagine-video",
  });
  assert.equal(video.nodes[0].type, "video");
  assert.equal(video.nodes[0].metadata.model, "grok-imagine-video");
  assert.equal(video.nodes[0].metadata.modelProviderId, "preset-grok-relay");

  const prompt = buildMediaCanvasProject({
    kind: "prompt",
    prompt: "雨夜码头",
    model: "preset-openai::gpt-5.6",
  });
  assert.equal(prompt.nodes[0].type, "text");
  assert.equal(prompt.nodes[0].metadata.model, "gpt-5.6");
  assert.equal(prompt.nodes[0].metadata.modelProviderId, "preset-openai");
});

test("bare model id stays on model and does not invent a provider", () => {
  const project = buildMediaCanvasProject({
    kind: "image",
    url: "https://example.test/a.png",
    model: "grok-imagine-image",
  });
  assert.equal(project.nodes[0].metadata.model, "grok-imagine-image");
  assert.equal(project.nodes[0].metadata.modelProviderId, undefined);
});

test("model id that itself contains :: keeps the remainder after the provider", () => {
  const project = buildMediaCanvasProject({
    kind: "image",
    url: "https://example.test/a.png",
    model: "preset-hf::org/flux::dev",
  });
  assert.equal(project.nodes[0].metadata.model, "org/flux::dev");
  assert.equal(project.nodes[0].metadata.modelProviderId, "preset-hf");
});

test("canvasModelFromSelection ignores empty or malformed catalog keys", () => {
  assert.deepEqual(canvasModelFromSelection(undefined), {});
  assert.deepEqual(canvasModelFromSelection("  "), {});
  assert.deepEqual(canvasModelFromSelection("::flux1"), { model: "::flux1" });
  assert.deepEqual(canvasModelFromSelection("preset-civitai::"), { model: "preset-civitai::" });
});
