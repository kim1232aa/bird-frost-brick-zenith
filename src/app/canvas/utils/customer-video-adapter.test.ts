import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerVideoWirePayload,
  buildSeedance2CustomerVideoPayload,
  dispatchCustomerVideoPayload,
  type Seedance2CustomerVideoReference,
} from "./customer-video-adapter.ts";

const FIRST = "https://example.test/first.png";
const LAST = "https://example.test/last.png";
const EXTRA = "https://example.test/extra.png";

function videoNode(metadata: Record<string, unknown> = {}) {
  return {
    id: "video-1",
    metadata: {
      prompt: "p",
      seedanceRatio: "16:9",
      seedanceDuration: 5,
      ...metadata,
    },
  } as unknown as Parameters<typeof buildSeedance2CustomerVideoPayload>[0];
}

function imageRef(
  value: string,
  useAs: Seedance2CustomerVideoReference["useAs"],
  nodeId = "img-1",
): Seedance2CustomerVideoReference {
  return { label: nodeId, value, nodeId, useAs };
}

test("text-to-video payload stays prompt-only when no references are present", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode());
  assert.equal(payload.mode, "text_to_video");
  assert.equal(payload.prompt, "p");
  assert.equal(payload.ratio, "16:9");
  assert.equal(payload.duration, 5);
  assert.equal("first_frame" in payload, false);
  assert.equal("last_frame" in payload, false);
  assert.equal("reference_images" in payload, false);
  assert.equal("references" in payload, false);
});

test("first_frame reference maps to image-to-video instead of blocking before the official builder", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [imageRef(FIRST, "first_frame")]);
  assert.equal(payload.mode, "image_to_video");
  assert.equal(payload.first_frame, FIRST);
  assert.equal("last_frame" in payload, false);
  assert.equal("reference_images" in payload, false);
  assert.equal("references" in payload, false);
});

test("first and last frame references map to first_last_frame for Agnes keyframes / OpenAI first-frame handoff", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [
    imageRef(FIRST, "first_frame", "img-1"),
    imageRef(LAST, "last_frame", "img-2"),
  ]);
  assert.equal(payload.mode, "first_last_frame");
  assert.equal(payload.first_frame, FIRST);
  assert.equal(payload.last_frame, LAST);
  assert.equal("reference_images" in payload, false);
});

test("two keyframe references map to first_frame and last_frame", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [
    imageRef(FIRST, "keyframe", "img-1"),
    imageRef(LAST, "keyframe", "img-2"),
  ]);
  assert.equal(payload.mode, "first_last_frame");
  assert.equal(payload.first_frame, FIRST);
  assert.equal(payload.last_frame, LAST);
});

test("a single keyframe reference maps to image-to-video first_frame", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [imageRef(FIRST, "keyframe")]);
  assert.equal(payload.mode, "image_to_video");
  assert.equal(payload.first_frame, FIRST);
  assert.equal("last_frame" in payload, false);
});

test("generic serializer does not intercept first_frame before buildCustomerVideoStudioRequest", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [imageRef(FIRST, "first_frame")]);
  const wire = buildCustomerVideoWirePayload(payload);
  assert.equal(wire.prompt, "p");
  assert.equal(wire.mode, "image_to_video");
  assert.equal("first_frame" in wire, false);
  assert.equal("last_frame" in wire, false);
  assert.equal("reference_images" in wire, false);
});

test("hand-built image_to_video first_frame payload is not intercepted by generic serializer", () => {
  const wire = buildCustomerVideoWirePayload({
    mode: "image_to_video",
    prompt: "p",
    ratio: "16:9",
    duration: 5,
    first_frame: FIRST,
  });
  assert.equal(wire.mode, "image_to_video");
  assert.equal("first_frame" in wire, false);
  assert.equal("last_frame" in wire, false);
});

test("hand-built first_last_frame payload is not intercepted by generic serializer", () => {
  const wire = buildCustomerVideoWirePayload({
    mode: "first_last_frame",
    prompt: "p",
    ratio: "16:9",
    duration: 5,
    first_frame: FIRST,
    last_frame: LAST,
  });
  assert.equal(wire.mode, "first_last_frame");
  assert.equal("first_frame" in wire, false);
  assert.equal("last_frame" in wire, false);
});

test("generic serializer does not intercept first_frame+last_frame before the official builder", () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [
    imageRef(FIRST, "first_frame", "img-1"),
    imageRef(LAST, "last_frame", "img-2"),
  ]);
  const wire = buildCustomerVideoWirePayload(payload);
  assert.equal("first_frame" in wire, false);
  assert.equal("last_frame" in wire, false);
  assert.equal(wire.mode, "first_last_frame");
});

test("dispatchCustomerVideoPayload still invokes send when first_frame is present", async () => {
  const payload = buildSeedance2CustomerVideoPayload(videoNode(), [imageRef(FIRST, "first_frame")]);
  let sent = false;
  await dispatchCustomerVideoPayload(payload, (wire) => {
    sent = true;
    assert.equal(wire.prompt, "p");
    assert.equal("first_frame" in wire, false);
    return { ok: true };
  });
  assert.equal(sent, true);
  assert.equal(payload.first_frame, FIRST);
});

test("semantic reference_image candidates stay fail-closed", () => {
  assert.throws(
    () => buildSeedance2CustomerVideoPayload(videoNode(), [imageRef(FIRST, "reference_image")]),
    /reference_image|普通参考|capability profile|serializer/,
  );
});

test("unlabeled image candidates stay fail-closed instead of being guessed as first_frame", () => {
  assert.throws(
    () =>
      buildSeedance2CustomerVideoPayload(videoNode(), [
        { label: "img-1", value: FIRST, nodeId: "img-1" },
      ]),
    /reference_image|普通参考|capability profile|serializer/,
  );
});

test("three keyframe candidates stay fail-closed because this serializer cannot emit image_urls", () => {
  assert.throws(
    () =>
      buildSeedance2CustomerVideoPayload(videoNode(), [
        imageRef(FIRST, "keyframe", "img-1"),
        imageRef(LAST, "keyframe", "img-2"),
        imageRef(EXTRA, "keyframe", "img-3"),
      ]),
    /关键帧|image_urls|serializer/,
  );
});

test("last_frame without first_frame stays fail-closed", () => {
  assert.throws(
    () => buildSeedance2CustomerVideoPayload(videoNode(), [imageRef(LAST, "last_frame")]),
    /首帧|单独尾帧/,
  );
  assert.throws(
    () =>
      buildCustomerVideoWirePayload({
        mode: "first_last_frame",
        prompt: "p",
        ratio: "16:9",
        duration: 5,
        last_frame: LAST,
      }),
    /首帧|单独尾帧/,
  );
});

test("reference_videos stay fail-closed", () => {
  assert.throws(
    () => buildSeedance2CustomerVideoPayload(videoNode(), [], [{ name: "clip.mp4", useAs: "reference_video" }]),
    /参考视频|serializer/,
  );
  assert.throws(
    () =>
      buildCustomerVideoWirePayload({
        mode: "text_to_video",
        prompt: "p",
        ratio: "16:9",
        duration: 5,
        reference_videos: [{ name: "clip.mp4" }],
      }),
    /reference_videos|参考视频|serializer/,
  );
});

test("unmapped reference_images on the generic wire stay fail-closed", () => {
  assert.throws(
    () =>
      buildCustomerVideoWirePayload({
        mode: "text_to_video",
        prompt: "p",
        ratio: "16:9",
        duration: 5,
        reference_images: [FIRST],
      }),
    /reference_images|serializer/,
  );
});

test("mixing first_frame with semantic reference_image stays fail-closed", () => {
  assert.throws(
    () =>
      buildSeedance2CustomerVideoPayload(videoNode(), [
        imageRef(FIRST, "first_frame", "img-1"),
        imageRef(EXTRA, "reference_image", "img-2"),
      ]),
    /reference_image|普通参考|互斥|serializer/,
  );
});

test("duplicate first_frame stays fail-closed instead of silently taking the first", () => {
  assert.throws(
    () =>
      buildSeedance2CustomerVideoPayload(videoNode(), [
        imageRef(FIRST, "first_frame", "img-1"),
        imageRef(EXTRA, "first_frame", "img-2"),
      ]),
    /最多 1 张|静默/,
  );
});

test("keyframe mixed with first_frame stays fail-closed", () => {
  assert.throws(
    () =>
      buildSeedance2CustomerVideoPayload(videoNode(), [
        imageRef(FIRST, "first_frame", "img-1"),
        imageRef(LAST, "keyframe", "img-2"),
      ]),
    /关键帧|混用|image_urls/,
  );
});

test("identical first and last frames stay fail-closed", () => {
  assert.throws(
    () =>
      buildSeedance2CustomerVideoPayload(videoNode(), [
        imageRef(FIRST, "first_frame", "img-1"),
        imageRef(FIRST, "last_frame", "img-2"),
      ]),
    /相同|冒充/,
  );
});

test("text_to_video payload carrying first_frame stays fail-closed", () => {
  assert.throws(
    () =>
      buildCustomerVideoWirePayload({
        mode: "text_to_video",
        prompt: "p",
        ratio: "16:9",
        duration: 5,
        first_frame: FIRST,
      }),
    /text_to_video|first_frame/,
  );
});
