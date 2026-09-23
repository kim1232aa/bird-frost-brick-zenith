import { sha256Hex } from "@/lib/sha256";

export type Seedance2PromptRewriteShotInput = {
  shotId: string;
  shotIndex: number;
  title: string;
  sourceImageNodeId: string;
  sourceImage?: string;
  currentPrompt: string;
  storyContext?: {
    sceneId?: string;
    appearingCharacterIds: string[];
    excludedCharacterIds: string[];
    action: string;
    camera: string;
    emotion?: string;
    continuityNote?: string;
    characterState?: string;
    visualContent?: string;
    voiceover?: string;
    imagePrompt: string;
    finalPrompt?: string;
  };
};

export type Seedance2PromptRewriteInput = {
  story: string;
  template: string;
  rewriteModel?: string;
  shots: Seedance2PromptRewriteShotInput[];
};

export type Seedance2RewrittenShot = {
  shotId: string;
  shotIndex: number;
  prompt: string;
  /** True when upstream rewriting failed and the shot kept its original prompt. */
  rewriteFallback?: boolean;
  /** Safe, non-blocking reason for keeping the original prompt. */
  rewriteWarning?: string;
};

export type Seedance2BatchRewriteRequest = {
  model: string;
  contentText: string;
  shots: Seedance2PromptRewriteShotInput[];
};

export type Seedance2PromptRewriteCheckpoint = {
  schema: "seedance2-prompt-rewrite-checkpoint/v1";
  fingerprintDigest: string;
  completedShots: Seedance2RewrittenShot[];
};

export type Seedance2PromptRewriteRunOptions = {
  fingerprintDigest?: string;
  initialCheckpoint?: Seedance2PromptRewriteCheckpoint;
  onCheckpoint?: (checkpoint: Seedance2PromptRewriteCheckpoint) => void | Promise<void>;
};

export const SEEDANCE2_PROMPT_REWRITE_MAX_SHOTS_PER_REQUEST = 3;

export async function createSeedance2PromptRewriteFingerprint(
  value: unknown,
): Promise<string> {
  return sha256Hex(stableFingerprintValue(value));
}

export function safeSeedance2PromptRewriteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed) return "Seedance2 整批提示词改写失败";
  if (
    trimmed.length > 500 ||
    /https?:\/\/|[{}[\]]|\b(?:authorization|bearer|api[_ -]?key|access[_ -]?key|token|secret|password|credential)\b|\bsk-[a-z0-9_-]+|\b(?:request|response)\s*(?:body|payload)\b/i.test(trimmed)
  ) {
    return "Seedance2 提示词改写失败：上游拒绝或中断请求，请检查网络、账户或模型权限后重试";
  }
  if (/余额|balance/i.test(trimmed)) {
    return "Seedance2 提示词改写失败：上游拒绝请求，请检查账户或模型权限后重试";
  }
  return trimmed;
}

export function validSeedance2PromptRewriteCheckpoint(
  input: Seedance2PromptRewriteInput,
  fingerprintDigest: string | undefined,
  checkpoint: Seedance2PromptRewriteCheckpoint | undefined,
): Seedance2PromptRewriteCheckpoint | undefined {
  if (
    !checkpoint ||
    checkpoint.schema !== "seedance2-prompt-rewrite-checkpoint/v1" ||
    !fingerprintDigest ||
    checkpoint.fingerprintDigest !== fingerprintDigest ||
    !Array.isArray(checkpoint.completedShots)
  ) return undefined;
  const completed = checkpoint.completedShots;
  if (
    completed.length > input.shots.length ||
    (completed.length < input.shots.length && completed.length % SEEDANCE2_PROMPT_REWRITE_MAX_SHOTS_PER_REQUEST !== 0)
  ) return undefined;
  const validPrefix = completed.every((shot, index) => {
    const expected = input.shots[index];
    return Boolean(
      expected &&
      shot?.shotId === expected.shotId &&
      shot?.shotIndex === expected.shotIndex &&
      typeof shot?.prompt === "string" &&
      shot.prompt.trim(),
    );
  });
  if (!validPrefix) return undefined;
  return {
    schema: checkpoint.schema,
    fingerprintDigest: checkpoint.fingerprintDigest,
    completedShots: completed.map((shot) => ({ ...shot, prompt: shot.prompt.trim() })),
  };
}

export function buildSeedance2BatchRewritePrompt(input: Seedance2PromptRewriteInput) {
  const textShots = input.shots.map(({ sourceImage, ...shot }) => ({
    ...shot,
    hasSourceImage: Boolean(sourceImage),
  }));
  return [
    "你是分镜视频提示词改写器。请根据故事导演的完整故事、本批每个分镜的结构化内容与上游图片、图片分镜当前提示词和视频工作流模板规则，为本批每个分镜一对一生成视频提示词。",
    "请先理解每张上游分镜图中的角色、数量、外观、位置、场景、光线和构图，再把静态画面改写为连续的视频动作。",
    "保持上游图片与故事导演的角色、场景、叙事和镜头关系，不得凭空新增角色、道具或剧情。",
    "用户在视频工作流中填写的模板是每条视频提示词的最高优先级生成规则；每条 prompt 都必须根据该模板生成并逐项满足，规则冲突时以模板为准。",
    "必须补充动作过程、镜头运动、节奏、情绪和环境动态。不得把模板原文机械复制到结果，也不得返回与模板无关的固定通用提示词。",
    "不得遗漏、合并、调换或新增镜头。",
    "只返回 JSON，不要解释。返回格式：{\"shots\":[{\"shotId\":\"shot-1\",\"shotIndex\":1,\"prompt\":\"改写后的视频提示词\"}]}。",
    "",
    "<完整故事>",
    input.story,
    "</完整故事>",
    "",
    "<本批图片分镜>",
    JSON.stringify(textShots, null, 2),
    "</本批图片分镜>",
    "",
    "<完整改写模板规则>",
    input.template,
    "</完整改写模板规则>",
  ].join("\n");
}

export function buildSeedance2BatchRewriteRequest(
  input: Seedance2PromptRewriteInput,
): Seedance2BatchRewriteRequest {
  const model = typeof input.rewriteModel === "string" ? input.rewriteModel.trim() : "";
  if (!model) throw new Error("Seedance2 整批改写缺少文本模型");
  return {
    model,
    contentText: buildSeedance2BatchRewritePrompt(input),
    shots: input.shots.map((shot) => ({ ...shot })),
  };
}

type Seedance2BatchRewriteMatch = { prompt: string; matched: boolean };

function collectSeedance2BatchRewriteMatches(
  raw: string,
  expectedShots: Seedance2PromptRewriteShotInput[],
): Seedance2BatchRewriteMatch[] {
  const text = String(raw || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] || text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Seedance2 整批提示词返回无法解析为 JSON");
  }

  const shots = Array.isArray((parsed as { shots?: unknown })?.shots)
    ? (parsed as { shots: unknown[] }).shots
    : null;
  if (!shots) throw new Error("Seedance2 整批提示词 JSON 缺少 shots 数组");

  const usedIndexes = new Set<number>();
  return expectedShots.map((expected) => {
    const responseIndex = shots.findIndex((candidate, index) => {
      if (usedIndexes.has(index) || !candidate || typeof candidate !== "object") return false;
      const shot = candidate as Record<string, unknown>;
      const shotId = typeof shot.shotId === "string" ? shot.shotId.trim() : "";
      const shotIndex = Number(shot.shotIndex);
      return (shotId && shotId === expected.shotId) || shotIndex === expected.shotIndex;
    });
    if (responseIndex < 0) return { prompt: "", matched: false };
    usedIndexes.add(responseIndex);
    const responseShot = shots[responseIndex] as Record<string, unknown>;
    const prompt = typeof responseShot.prompt === "string" ? responseShot.prompt.trim() : "";
    return { prompt, matched: true };
  });
}

export function parseSeedance2BatchRewriteResponse(
  raw: string,
  expectedShots: Seedance2PromptRewriteShotInput[],
): Seedance2RewrittenShot[] {
  const matches = collectSeedance2BatchRewriteMatches(raw, expectedShots);
  return expectedShots.map((expected, index) => {
    const match = matches[index];
    const label = expected.shotId || `第 ${expected.shotIndex} 镜`;
    if (!match?.matched) throw new Error(`Seedance2 整批提示词缺少 ${label}`);
    if (!match.prompt) throw new Error(`Seedance2 整批提示词中 ${label} 的 prompt 为空`);
    return {
      shotId: expected.shotId,
      shotIndex: expected.shotIndex,
      prompt: match.prompt,
    };
  });
}

/** Session cancellation must abort the whole run; upstream failures must not. */
export function seedance2RewriteCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("工作区已切换");
}

/** The shot's own prompt, used when upstream rewriting fails. */
export function seedance2ShotFallbackPrompt(shot: Seedance2PromptRewriteShotInput): string {
  const candidates = [
    shot.currentPrompt,
    shot.storyContext?.finalPrompt,
    shot.storyContext?.imagePrompt,
    shot.storyContext?.visualContent,
    shot.storyContext?.action,
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === "string" ? candidate.trim() : "";
    if (text) return text;
  }
  return "";
}

export async function rewriteSeedance2BatchPrompts(
  input: Seedance2PromptRewriteInput,
  request: (payload: Seedance2BatchRewriteRequest) => Promise<string>,
  options: Seedance2PromptRewriteRunOptions = {},
) {
  if (!input.shots.length) throw new Error("Seedance2 整批改写没有可用分镜");
  const checkpointShots = validCheckpointShots(input, options);
  const rewritten: Seedance2RewrittenShot[] = [...checkpointShots];
  let degraded = false;
  for (
    let offset = checkpointShots.length;
    offset < input.shots.length;
    offset += SEEDANCE2_PROMPT_REWRITE_MAX_SHOTS_PER_REQUEST
  ) {
    const shots = input.shots.slice(
      offset,
      offset + SEEDANCE2_PROMPT_REWRITE_MAX_SHOTS_PER_REQUEST,
    );
    const batchInput = { ...input, shots };
    const first = shots[0]?.shotIndex || offset + 1;
    const last = shots.at(-1)?.shotIndex || offset + shots.length;
    const range = first === last ? `第 ${first} 镜` : `第 ${first}–${last} 镜`;
    let matches: Seedance2BatchRewriteMatch[] = [];
    let batchFailure = "";
    try {
      const raw = await request(buildSeedance2BatchRewriteRequest(batchInput));
      matches = collectSeedance2BatchRewriteMatches(raw, shots);
    } catch (error) {
      if (seedance2RewriteCancelled(error)) throw error;
      batchFailure = error instanceof Error ? error.message : String(error || "未知错误");
    }

    for (const [index, shot] of shots.entries()) {
      const prompt = matches[index]?.prompt || "";
      if (prompt) {
        rewritten.push({ shotId: shot.shotId, shotIndex: shot.shotIndex, prompt });
        continue;
      }
      const shotLabel = shot.shotId || `第 ${shot.shotIndex} 镜`;
      const details = batchFailure || `返回结果缺少 ${shotLabel} 的有效 prompt`;
      const fallbackPrompt = seedance2ShotFallbackPrompt(shot);
      if (!fallbackPrompt) {
        throw new Error(`Seedance2 ${range}提示词改写失败：${details}，且 ${shotLabel} 没有可用的原提示词`);
      }
      degraded = true;
      rewritten.push({
        shotId: shot.shotId,
        shotIndex: shot.shotIndex,
        prompt: fallbackPrompt,
        rewriteFallback: true,
        rewriteWarning: safeSeedance2PromptRewriteError(
          new Error(`Seedance2 ${range}提示词改写失败：${details}；已保留原提示词`),
        ),
      });
    }

    // 一旦出现降级就停止记录检查点，让重试仍能从第一个失败批次重新改写。
    if (!degraded && options.fingerprintDigest && options.onCheckpoint) {
      await options.onCheckpoint({
        schema: "seedance2-prompt-rewrite-checkpoint/v1",
        fingerprintDigest: options.fingerprintDigest,
        completedShots: rewritten.map((shot) => ({ ...shot })),
      });
    }
  }
  return rewritten;
}

function validCheckpointShots(
  input: Seedance2PromptRewriteInput,
  options: Seedance2PromptRewriteRunOptions,
): Seedance2RewrittenShot[] {
  return validSeedance2PromptRewriteCheckpoint(
    input,
    options.fingerprintDigest,
    options.initialCheckpoint,
  )?.completedShots || [];
}

function stableFingerprintValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableFingerprintValue).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableFingerprintValue(record[key])}`)
    .join(",")}}`;
}
