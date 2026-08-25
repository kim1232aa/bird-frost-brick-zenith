export async function dispatchCanvasImageBatch({
  targets,
  transport,
  resultPolicy = "exact-count",
  runLocalBatch,
  runRemoteSingle,
}) {
  if (!targets.length) return [];

  if (transport === "local-batch") {
    try {
      const values = await runLocalBatch(targets.length);
      return materializeCanvasImageBatchResults(targets, values, resultPolicy);
    } catch (error) {
      const reason = canvasImageBatchError(error);
      return targets.map((targetId) => ({
        targetId,
        status: "rejected",
        reason,
      }));
    }
  }

  const settled = await Promise.allSettled(
    targets.map((targetId) => runRemoteSingle(targetId, 1)),
  );
  return settled.map((result, index) =>
    result.status === "fulfilled"
      ? {
          targetId: targets[index],
          status: "fulfilled",
          value: result.value,
        }
      : {
          targetId: targets[index],
          status: "rejected",
          reason: canvasImageBatchError(result.reason),
        },
  );
}

function materializeCanvasImageBatchResults(targets, values, resultPolicy) {
  if (resultPolicy === "exact-count") {
    assertExactCanvasImageBatchCardinality(targets.length, values.length);
    return targets.map((targetId, index) => ({
      targetId,
      status: "fulfilled",
      value: values[index],
    }));
  }

  if (values.length > targets.length) {
    throw new Error(
      `图片接口返回数量超出请求：请求最多 ${targets.length} 张，实际返回 ${values.length} 张；已停止分配，不会静默丢弃图片。`,
    );
  }

  const returnedCount = values.length;
  const missingReason = new Error(
    `图片接口部分返回：请求最多 ${targets.length} 张，实际返回 ${returnedCount} 张；已按接口顺序分配 ${returnedCount} 张，剩余 ${targets.length - returnedCount} 个目标未返回。`,
  );
  return targets.map((targetId, index) =>
    index < returnedCount
      ? {
          targetId,
          status: "fulfilled",
          value: values[index],
        }
      : {
          targetId,
          status: "rejected",
          reason: missingReason,
        },
  );
}

export function assertExactCanvasImageBatchCardinality(expected, actual) {
  if (actual === expected) return;
  throw new Error(
    `图片接口返回数量不匹配：请求 ${expected} 张，实际返回 ${actual} 张；已停止分配，不会静默丢弃或重复图片。`,
  );
}

export function parseCanvasGenerationCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.floor(Math.abs(numeric)) || 1);
}

function canvasImageBatchError(error) {
  return error instanceof Error
    ? error
    : new Error(String(error || "图片生成失败"));
}
