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

const { planStory, draftPlan } = await import("./plan.ts");

const relays: never[] = [];

test("短答案不缺分镜：AI 只回 1 镜时也按本地草稿补齐到 5 镜", async () => {
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
  const plan = await planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 });
  assert.equal(plan.degraded, undefined);
  assert.equal(plan.shots.length, 5, "分镜 2、3、4、5 不能被丢掉");
  assert.equal(plan.shots[0].title, "码头追踪");
  // Padded shots inherit the local draft so the board stays coherent.
  for (let index = 1; index < 5; index += 1) {
    assert.equal(plan.shots[index].index, index + 1);
    assert.ok(plan.shots[index].prompt, `分镜 ${index + 1} 必须有提示词`);
    assert.equal(plan.shots[index].status, "pending");
  }
  assert.equal(plan.cast.length, 1);
});

test("分析失败退回本地分镜并标记降级，绝不悄悄变错结果", async () => {
  behavior = async () => {
    throw new Error("上游 502: 模型不可用");
  };
  const plan = await planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 });
  assert.equal(plan.degraded, true);
  assert.match(plan.degradedReason || "", /502/);
  assert.equal(plan.shots.length, 5, "降级时本地草稿分镜一镜不能少");
  assert.ok(plan.cast.length > 0, "降级时角色不能丢");
  assert.ok(plan.logline.length > 0);
});

test("修复链路：第一次 JSON 截断，修复后能拿到完整分镜", async () => {
  let calls = 0;
  behavior = async () => {
    calls += 1;
    if (calls === 1) return { text: '{"logline":"截断了",' };
    return {
      text: JSON.stringify({
        logline: "修复后的完整分析",
        characters: [
          { id: "char_001", name: "林晚", look: "湿风衣" },
          { id: "char_002", name: "线人", look: "连帽衫" },
        ],
        scenes: [{ id: "scene_001", name: "雨夜码头" }],
        shots: [1, 2, 3, 4, 5].map((n) => ({
          id: `shot_00${n}`,
          index: n,
          title: `镜头 ${n}`,
          prompt: `镜头 ${n} 的画面`,
          camera: "50mm",
          scene: "雨夜码头",
        })),
      }),
    };
  };
  const plan = await planStory({ relays, idea: "雨夜码头，女警探林晚追踪一枚会发光的铜铃。", shotCount: 5 });
  assert.equal(calls, 2, "第一次失败后必须走一次修复询问");
  assert.equal(plan.degraded, undefined);
  assert.equal(plan.logline, "修复后的完整分析");
  assert.equal(plan.shots.length, 5);
  assert.equal(plan.cast.length, 2);
});

test("本地草稿 draftPlan 自身就按数量出满分镜", () => {
  const plan = draftPlan("雨夜码头，女警探林晚追踪一枚会发光的铜铃。", "电影感写实", 5);
  assert.equal(plan.shots.length, 5);
  assert.ok(plan.cast.length > 0);
  assert.equal(plan.degraded, undefined);
});
