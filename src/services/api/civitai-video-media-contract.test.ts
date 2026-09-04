import assert from "node:assert/strict";
import test from "node:test";
import { resolveCivitaiVideoMediaContractForIntent } from "./civitai-video-media-contract.mjs";

test("short LTX engine resolves the official service matching the reference intent", () => {
  assert.equal(
    resolveCivitaiVideoMediaContractForIntent("ltx2.3", "none")?.serviceId,
    "video/ltx2.3/createVideo",
  );
  assert.equal(
    resolveCivitaiVideoMediaContractForIntent("ltx2.3", "first_frame")?.serviceId,
    "video/ltx2.3/createVideo",
  );
  assert.equal(
    resolveCivitaiVideoMediaContractForIntent("ltx2.3", "first_last_frame")?.serviceId,
    "video/ltx2.3/firstLastFrameToVideo",
  );
});

test("short Hunyuan engine resolves its text-only official service", () => {
  assert.equal(
    resolveCivitaiVideoMediaContractForIntent("hunyuan", "none")?.serviceId,
    "video/hunyuan",
  );
});

test("intent resolver shares the complete TypeScript service table", () => {
  assert.equal(
    resolveCivitaiVideoMediaContractForIntent("video/wan/v2.2/comfy", "none")?.profileId,
    "civitai-text-video",
  );
});

test("unknown short engines still fail closed", () => {
  assert.equal(resolveCivitaiVideoMediaContractForIntent("made-up-video", "none"), undefined);
});
