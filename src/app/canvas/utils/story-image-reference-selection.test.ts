import assert from "node:assert/strict";
import test from "node:test";
import { selectStoryImageReferences } from "./story-image-reference-selection.mjs";
import type { StoryImageReferenceWarning } from "./story-image-reference-selection.ts";

const capability = {
  referenceCount: { state: "supported", min: 1, max: 4, ordered: true },
  storyPromptConstraintStyle: "explicit-exclusions",
};

function turnaroundSheetWithoutDerivedViews() {
  return {
    shot: {
      id: "shot-1",
      index: 0,
      title: "正面",
      appearingCharacterIds: ["char-1"],
      excludedCharacterIds: [],
      action: "站立",
      camera: "正面",
      imagePrompt: "正面全景",
      resultNodeIds: [],
      status: "pending",
    },
    characters: [
      {
        id: "char-1",
        name: "主角",
        importance: "main",
        appearance: "",
        visualPrompt: "",
        status: "ready",
        referenceNodeId: "char-sheet",
      },
    ],
    nodes: [
      {
        id: "char-sheet",
        type: "image",
        title: "主角",
        position: { x: 0, y: 0 },
        width: 400,
        height: 200,
        metadata: {
          storyCharacterAssetKind: "turnaround_sheet",
          storyCharacterId: "char-1",
          storageKey: "works/sheet.png",
          mimeType: "image/png",
        },
      },
    ],
    capability,
  };
}

test("uncut turnaround sheet submits as one identity reference", () => {
  const selection = selectStoryImageReferences(turnaroundSheetWithoutDerivedViews());
  const warnings = selection.warnings as readonly StoryImageReferenceWarning[];
  assert.equal(selection.submissionPlan.state, "ready");
  assert.equal(selection.submitted.length, 1);
  assert.equal(selection.submitted[0].role, "identity");
  assert.equal(selection.submitted[0].id, "char-sheet");
  assert.equal(selection.submitted[0].storageKey, "works/sheet.png");
  assert.ok(warnings.some((warning) => warning.code === "character_derived_view_missing"));
  assert.equal(
    warnings.some((warning) => warning.message.includes("不会回退提交四视图设定表")),
    false,
  );
});
