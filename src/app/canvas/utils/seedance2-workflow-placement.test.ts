import assert from "node:assert/strict";
import test from "node:test";

import {
  placeSeedance2WorkflowBesideStoryDirector,
  SEEDANCE2_STORY_DIRECTOR_TYPE,
  SEEDANCE2_WORKFLOW_UPSTREAM_GAP,
} from "./seedance2-workflow-placement.ts";

const workflowSize = { width: 520, height: 640 };

function node(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return { id, type, position: { x, y }, width, height };
}

test("new workflow sits to the right of the story director and its storyboard column", () => {
  const storyDirector = node("director", SEEDANCE2_STORY_DIRECTOR_TYPE, 0, 40, 400, 940);
  const storyboard = node("shot-1", "image", 480, 40, 300, 169);
  const placed = placeSeedance2WorkflowBesideStoryDirector({
    storyDirector,
    nodes: [storyDirector, storyboard],
    workflowSize,
  });

  assert.ok(placed);
  assert.ok(placed.x >= 480 + 300 + SEEDANCE2_WORKFLOW_UPSTREAM_GAP);
  assert.equal(placed.x, 480 + 300 + SEEDANCE2_WORKFLOW_UPSTREAM_GAP);
  assert.equal(placed.y, storyDirector.position.y);
});

test("an existing workflow that already clears the upstream cluster is left where the user put it", () => {
  const storyDirector = node("director", SEEDANCE2_STORY_DIRECTOR_TYPE, 0, 0, 400, 940);
  const storyboard = node("shot-1", "image", 480, 0, 300, 169);
  const existing = { x: 1200, y: 320 };
  const placed = placeSeedance2WorkflowBesideStoryDirector({
    storyDirector,
    nodes: [storyDirector, storyboard],
    workflowSize,
    existingPosition: existing,
  });

  assert.equal(placed, null);
});

test("an existing workflow overlapping the storyboard column is moved once, to the right of that column", () => {
  const storyDirector = node("director", SEEDANCE2_STORY_DIRECTOR_TYPE, 0, 0, 580, 940);
  const storyboard = node("shot-1", "image", 676, 0, 340, 191);
  const placed = placeSeedance2WorkflowBesideStoryDirector({
    storyDirector,
    nodes: [storyDirector, storyboard],
    workflowSize,
    existingPosition: { x: 700, y: 0 },
  });

  assert.deepEqual(placed, {
    x: 676 + 340 + SEEDANCE2_WORKFLOW_UPSTREAM_GAP,
    y: 0,
  });
});

test("without one bound director, the workflow clears every director and the storyboards beside them", () => {
  const first = node("director-a", SEEDANCE2_STORY_DIRECTOR_TYPE, 0, 0, 400, 940);
  const second = node("director-b", SEEDANCE2_STORY_DIRECTOR_TYPE, 0, 1100, 400, 940);
  const storyboard = node("shot-b", "image", 500, 1100, 300, 169);
  const placed = placeSeedance2WorkflowBesideStoryDirector({
    nodes: [first, second, storyboard],
    workflowSize,
  });

  assert.deepEqual(placed, {
    x: 500 + 300 + SEEDANCE2_WORKFLOW_UPSTREAM_GAP,
    y: 0,
  });
});

test("a canvas with no story director keeps the caller-supplied viewport origin", () => {
  assert.equal(
    placeSeedance2WorkflowBesideStoryDirector({
      nodes: [node("note", "text", 0, 0, 340, 240)],
      workflowSize,
    }),
    null,
  );
});
