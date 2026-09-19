import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryDirectorEntryProject } from "./story-canvas-entry.ts";

test("story entry builds a blank canvas project with an actionable director node", () => {
  const project = buildStoryDirectorEntryProject();

  assert.equal(project.title, "故事导演");
  assert.equal(project.nodes.length, 1);
  assert.equal(project.connections.length, 0);
  assert.equal(project.nodes[0]?.type, "story_director");
  assert.equal(project.nodes[0]?.metadata?.storyText, "");
  assert.equal(project.nodes[0]?.metadata?.storyWorkflow, "idle");
  assert.equal(project.nodes[0]?.metadata?.storyShotCount, 5);
  assert.equal(project.nodes[0]?.metadata?.storyStoryboardMode, "single");
  assert.equal(project.nodes[0]?.metadata?.storyAnalysisStatus, "idle");
  assert.equal(project.nodes[0]?.metadata?.storyGenerationStatus, "idle");
});
