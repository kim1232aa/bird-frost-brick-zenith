import assert from "node:assert/strict";
import test from "node:test";

import {
  standaloneSeedance2VideoModelPatch,
  standaloneVideoSettingsAccess,
} from "./canvas-standalone-video-model.ts";

test("standalone video settings use the same provider/model selection shown by the picker", () => {
  const selection = {
    providerId: "preset-grok-relay",
    model: "grok-imagine-video",
  };

  assert.equal(standaloneVideoSettingsAccess(selection, true), "ready");
  assert.equal(standaloneVideoSettingsAccess(selection, false), "route-unavailable");
});

test("standalone video model selection pins both model fields and provider identity", () => {
  assert.deepEqual(
    standaloneSeedance2VideoModelPatch({
      providerId: "preset-grok-relay",
      model: "grok-imagine-video",
    }),
    {
      model: "grok-imagine-video",
      modelProviderId: "preset-grok-relay",
      seedanceModel: "grok-imagine-video",
      videoGenerationSettings: undefined,
      videoGenerationScope: undefined,
      videoGenerationCapabilityId: undefined,
      videoWireFormat: undefined,
    },
  );
});
