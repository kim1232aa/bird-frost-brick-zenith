import assert from "node:assert/strict";
import test from "node:test";
import { storyShotHasReferenceIntent } from "./story-shot-reference-intent.ts";

const directorWithCharacterInput = {
  metadata: {
    storyCharacterSourceImageNodeIds: ["char-sheet"],
  },
};

test("establishing shot without appearing characters is not edit just because a character sheet is connected", () => {
  assert.equal(
    storyShotHasReferenceIntent(directorWithCharacterInput, [
      { appearingCharacterIds: [] },
    ]),
    false,
  );
});

test("shot with appearing characters still has reference intent", () => {
  assert.equal(
    storyShotHasReferenceIntent(directorWithCharacterInput, [
      { appearingCharacterIds: ["char-1"] },
    ]),
    true,
  );
});

test("establishing shot still has reference intent when a scene or story still is connected", () => {
  assert.equal(
    storyShotHasReferenceIntent(
      { metadata: { storySceneSourceImageNodeIds: ["dock"] } },
      [{ appearingCharacterIds: [] }],
    ),
    true,
  );
});
