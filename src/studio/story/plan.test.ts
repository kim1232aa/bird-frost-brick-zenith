import { register } from "node:module";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const textModuleUrl = new URL("../generate/text.ts", import.meta.url).href;

// State mutated per-test; the mock reads it at call time.
let behavior: (input: { prompt: string }) => Promise<{ text: string }>;

mock.module(textModuleUrl, {
  namedExports: {
    generateStudioText: (input: { prompt: string }) => behavior(input),
  },
});

const { planStory } = await import("./plan.ts");

const relays: never[] = [];
const ANALYSIS_FAILURE = "故事分析失败，上游未返回有效分镜";

function fullBoard(logline: string) {
  return {
    logline,
    characters: [
      { id: "char_001", name: "林晚", look: "湿风衣" },
      { id: "char_002", name: "线人", look: "连帽衫" },
    ],
    scenes: [{ id: "scene_001", name: "雨夜码头" }],
    shots: [1, 2, 3, 4, 5].map((n) => ({
      id: `shot_00${n}`,
      index: n,
      title: n === 1 ? "码头追踪" : `镜头 ${n}`,
      prompt: `镜头 ${n} 的画面`,
      camera: "50mm",
      scene: "雨夜码头",
    })),
  };
}

test("镜头数不符直接失败：AI 只回 1 镜时不补本地草稿", async () => {
  behavior = async () => ({
    text: JSON.stringify({
      logline: "只有一镜的短答案",
      characters: [{ id: "char_001", name: "林晚", look: "湿风衣" }],
      scenes: [{ id: "scene_001", name: "雨夜码头" }],
      shots: [
        {
          id: "shot_001",
          index: 1,
          title: "码头追踪",
          prompt: "林晚在雨夜码头",
          camera: "35mm",
          scene: "雨夜码头",
        },
      ],
    }),
  });
  await assert.rejects(
    () => planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, ANALYSIS_FAILURE);
      return true;
    },
  );
});

test("分析失败抛出明确错误，绝不返回降级假计划", async () => {
  behavior = async () => {
    throw new Error("上游 502: 模型不可用");
  };
  await assert.rejects(
    () => planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, ANALYSIS_FAILURE);
      return true;
    },
  );
});

test("修复链路：第一次 JSON 截断，修复后能拿到完整分镜", async () => {
  let calls = 0;
  behavior = async () => {
    calls += 1;
    if (calls === 1) return { text: '{"logline":"截断了",' };
    return { text: JSON.stringify(fullBoard("修复后的完整分析")) };
  };
  const plan = await planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 });
  assert.equal(calls, 2, "第一次失败后必须走一次修复询问");
  assert.equal(plan.logline, "修复后的完整分析");
  assert.equal(plan.shots.length, 5);
  assert.equal(plan.cast.length, 2);
  assert.equal("degraded" in plan, false);
});

test("镜头数刚好时原样返回上游分镜", async () => {
  behavior = async () => ({ text: JSON.stringify(fullBoard("完整分析")) });
  const plan = await planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 });
  assert.equal(plan.shots.length, 5);
  assert.equal(plan.shots[0].title, "码头追踪");
  assert.equal(plan.cast.length, 2);
  assert.equal("degraded" in plan, false);
});
