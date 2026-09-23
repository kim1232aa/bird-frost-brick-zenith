import assert from "node:assert/strict";
import test from "node:test";
import { rewriteSeedance2BatchPrompts } from "./seedance2-prompt-rewrite.mjs";
import type { Seedance2PromptRewriteCheckpoint } from "./seedance2-prompt-rewrite";

function rewriteInput(shots: Array<{ shotIndex: number; currentPrompt: string }>) {
  return {
    story: "一个测试故事",
    template: "视频工作流模板",
    rewriteModel: "test-text-model",
    shots: shots.map((shot) => ({
      shotId: `shot-${shot.shotIndex}`,
      shotIndex: shot.shotIndex,
      title: `第${shot.shotIndex}镜`,
      sourceImageNodeId: `image-${shot.shotIndex}`,
      sourceImage: "data:image/png;base64,AAAA",
      currentPrompt: shot.currentPrompt,
    })),
  };
}

test("upstream HTTP 500 keeps every original prompt instead of failing the whole batch", async () => {
  const input = rewriteInput([
    { shotIndex: 1, currentPrompt: "第一镜原始提示词" },
    { shotIndex: 2, currentPrompt: "第二镜原始提示词" },
  ]);
  let calls = 0;

  const shots = await rewriteSeedance2BatchPrompts(input, async () => {
    calls += 1;
    throw new Error("Request failed with status code 500");
  });

  assert.equal(calls, 1);
  assert.equal(shots.length, 2);
  assert.deepEqual(
    shots.map((shot) => [shot.shotId, shot.shotIndex, shot.prompt]),
    [
      ["shot-1", 1, "第一镜原始提示词"],
      ["shot-2", 2, "第二镜原始提示词"],
    ],
  );
  assert.ok(shots.every((shot) => shot.rewriteFallback === true));
  assert.ok(shots.every((shot) => typeof shot.rewriteWarning === "string" && shot.rewriteWarning));
});

test("a shot without any original prompt still throws", async () => {
  const input = rewriteInput([{ shotIndex: 1, currentPrompt: "   " }]);

  await assert.rejects(
    rewriteSeedance2BatchPrompts(input, async () => {
      throw new Error("Request failed with status code 500");
    }),
    /没有可用的原提示词/,
  );
});

test("workspace switch cancellation is never degraded", async () => {
  const input = rewriteInput([{ shotIndex: 1, currentPrompt: "第一镜原始提示词" }]);

  await assert.rejects(
    rewriteSeedance2BatchPrompts(input, async () => {
      throw new Error("Seedance2 工作区已切换，已停止当前改写");
    }),
    /工作区已切换/,
  );
});

test("unparsable and empty upstream responses degrade to the original prompt", async () => {
  const input = rewriteInput([{ shotIndex: 1, currentPrompt: "第一镜原始提示词" }]);

  const unparsable = await rewriteSeedance2BatchPrompts(input, async () => "上游返回了一段解释文本");
  assert.equal(unparsable[0]?.prompt, "第一镜原始提示词");
  assert.equal(unparsable[0]?.rewriteFallback, true);

  const empty = await rewriteSeedance2BatchPrompts(input, async () => "");
  assert.equal(empty[0]?.prompt, "第一镜原始提示词");
  assert.equal(empty[0]?.rewriteFallback, true);
});

test("a missing shot in an otherwise valid response only degrades that shot", async () => {
  const input = rewriteInput([
    { shotIndex: 1, currentPrompt: "第一镜原始提示词" },
    { shotIndex: 2, currentPrompt: "第二镜原始提示词" },
  ]);

  const shots = await rewriteSeedance2BatchPrompts(input, async () =>
    JSON.stringify({ shots: [{ shotId: "shot-1", shotIndex: 1, prompt: "改写后的第一镜" }] }),
  );

  assert.equal(shots[0]?.prompt, "改写后的第一镜");
  assert.equal(shots[0]?.rewriteFallback, undefined);
  assert.equal(shots[1]?.prompt, "第二镜原始提示词");
  assert.equal(shots[1]?.rewriteFallback, true);
});

test("a successful rewrite still returns the rewritten prompts and checkpoints", async () => {
  const input = rewriteInput([{ shotIndex: 1, currentPrompt: "第一镜原始提示词" }]);
  const checkpoints: Seedance2PromptRewriteCheckpoint[] = [];

  const shots = await rewriteSeedance2BatchPrompts(
    input,
    async () => JSON.stringify({ shots: [{ shotId: "shot-1", shotIndex: 1, prompt: "改写后的第一镜" }] }),
    {
      fingerprintDigest: "digest-1",
      onCheckpoint: (checkpoint: Seedance2PromptRewriteCheckpoint) => {
        checkpoints.push(checkpoint);
      },
    },
  );

  assert.equal(shots[0]?.prompt, "改写后的第一镜");
  assert.equal(shots[0]?.rewriteFallback, undefined);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0]?.completedShots[0]?.prompt, "改写后的第一镜");
});

test("a degraded batch writes no checkpoint so a retry rewrites it again", async () => {
  const input = rewriteInput([{ shotIndex: 1, currentPrompt: "第一镜原始提示词" }]);
  const checkpoints: Seedance2PromptRewriteCheckpoint[] = [];

  const shots = await rewriteSeedance2BatchPrompts(
    input,
    async () => {
      throw new Error("Request failed with status code 500");
    },
    {
      fingerprintDigest: "digest-1",
      onCheckpoint: (checkpoint: Seedance2PromptRewriteCheckpoint) => {
        checkpoints.push(checkpoint);
      },
    },
  );

  assert.equal(shots[0]?.prompt, "第一镜原始提示词");
  assert.equal(checkpoints.length, 0);
});
