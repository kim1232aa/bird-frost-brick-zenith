import type { StoryPromptConstraintStyle } from "@/services/api/image-model-capabilities";
import type { CanvasImageOperation } from "../types";

export type StoryImagePromptCharacter = {
  readonly id: string;
  readonly name: string;
  readonly referenceNodeId?: string;
};

export type StoryImagePromptScene = {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
};

export type StoryImagePromptShot = {
  readonly id: string;
  readonly index: number;
  readonly title?: string;
  readonly sceneId?: string;
  readonly appearingCharacterIds?: readonly string[];
  readonly excludedCharacterIds?: readonly string[];
  readonly action?: string;
  readonly camera?: string;
  readonly emotion?: string;
  readonly visualContent?: string;
  readonly imagePrompt?: string;
  readonly continuityNote?: string;
};

export type StoryPromptReference = {
  readonly role: "identity" | "scene" | "prop" | "story" | "style";
  readonly label: string;
  readonly angle?: string;
};

export type LegacyStoryPromptReference = {
  readonly id: string;
  readonly sourceNodeId?: string;
};

export type StoryImagePromptPlanInput<TReferences extends readonly unknown[], TRouting> = {
  readonly mode: "single" | "grid9";
  readonly shots: readonly StoryImagePromptShot[];
  readonly characters: readonly StoryImagePromptCharacter[];
  readonly scenes?: readonly StoryImagePromptScene[];
  readonly style: string;
  readonly aspectRatio: string;
  readonly constraintStyle?: StoryPromptConstraintStyle;
  readonly referenceAppendix?: string;
  readonly legacyReferenceLines?: string;
  readonly references: TReferences;
  readonly routing: TRouting;
  /** Explicit provider operation selected by capability/routing. It is never inferred away. */
  readonly requestedOperation?: CanvasImageOperation;
  /** True when the user supplied references even if capability/media planning retained all of them. */
  readonly referenceIntent?: boolean;
  /** Neutral reason code from reference planning; callers must stop before paid transport. */
  readonly submissionBlockReason?: string;
};

export type StoryImagePromptPlan<TReferences extends readonly unknown[], TRouting> = {
  readonly prompt: string;
  readonly operation: CanvasImageOperation;
  readonly references: TReferences;
  readonly routing: TRouting;
  readonly transportAllowed: boolean;
  readonly submissionBlockReason?: string;
};

/**
 * Adapts app-owned Story prompt framing to a resolved provider capability.
 * References and routing are deliberately returned by identity so this seam
 * cannot change transport behavior while adapting prompt text.
 */
export function buildStoryImagePromptPlan<TReferences extends readonly unknown[], TRouting>(
  input: StoryImagePromptPlanInput<TReferences, TRouting>,
): StoryImagePromptPlan<TReferences, TRouting> {
  if (input.mode === "single" && input.shots.length !== 1) {
    throw new Error("single Story prompt planning requires exactly one shot");
  }
  if (input.mode === "grid9" && input.shots.length !== 9) {
    throw new Error("grid9 Story prompt planning requires exactly nine shots");
  }

  const constraintStyle = input.constraintStyle || "explicit-exclusions";
  const prompt = input.mode === "single"
    ? buildSingleShotPrompt(input, constraintStyle)
    : buildGrid9Prompt(input, constraintStyle);
  return {
    prompt,
    operation: storyPromptOperation(input),
    references: input.references,
    routing: input.routing,
    transportAllowed: !input.submissionBlockReason,
    ...(input.submissionBlockReason ? { submissionBlockReason: input.submissionBlockReason } : {}),
  };
}

export async function buildStoryImagePromptPlanForResolvedOperation<
  TReferences extends readonly unknown[],
  TRouting,
>(
  input: Omit<StoryImagePromptPlanInput<TReferences, TRouting>, "constraintStyle">,
  resolveCapability: (
    operation: CanvasImageOperation,
  ) => Promise<{ readonly storyPromptConstraintStyle?: StoryPromptConstraintStyle }>,
) {
  const operation = storyPromptOperation(input);
  const capability = await resolveCapability(operation);
  return buildStoryImagePromptPlan({
    ...input,
    constraintStyle: capability.storyPromptConstraintStyle || "explicit-exclusions",
  });
}

function storyPromptOperation(input: Pick<
  StoryImagePromptPlanInput<readonly unknown[], unknown>,
  "references" | "referenceIntent" | "requestedOperation"
>): CanvasImageOperation {
  if (input.requestedOperation) return input.requestedOperation;
  return input.referenceIntent === true || input.references.length > 0 ? "edit" as const : "generate" as const;
}

export function buildLegacyStoryReferenceLines(input: {
  readonly shots: readonly StoryImagePromptShot[];
  readonly characters: readonly StoryImagePromptCharacter[];
  readonly references: readonly LegacyStoryPromptReference[];
  readonly storyReferenceIds?: readonly string[];
  readonly sceneReferenceIds?: readonly string[];
  readonly propReferenceIds?: readonly string[];
}) {
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  const seen = new Set<string>();
  const characterLines = input.shots
    .flatMap((shot) => shot.appearingCharacterIds || [])
    .map((id) => characterById.get(id))
    .filter((character): character is StoryImagePromptCharacter => Boolean(character?.referenceNodeId))
    .map((character) => {
      if (seen.has(character.id)) return "";
      seen.add(character.id);
      const referenceIndex = input.references.findIndex((reference) =>
        reference.id === character.referenceNodeId || reference.sourceNodeId === character.referenceNodeId,
      );
      return referenceIndex >= 0
        ? `图片${referenceIndex + 1} = ${character.name}，只用于身份、脸型、发型和服装参考；如果参考图包含多视角或多姿态，只取一个身份特征，每个画格里${character.name}最多出现一次。`
        : "";
    })
    .filter(Boolean);
  const supportLines: string[] = [];
  const addSupportLines = (ids: readonly string[] | undefined, label: string, detail: string) => {
    ids?.forEach((id) => {
      const referenceIndex = input.references.findIndex((reference) => reference.id === id);
      if (referenceIndex >= 0) supportLines.push(`图片${referenceIndex + 1} = ${label}，${detail}`);
    });
  };
  addSupportLines(
    input.storyReferenceIds,
    "故事整体参考",
    "只用于整体世界观、画风、色彩和连续性，不要复制构图、人物数量或无关主体。",
  );
  addSupportLines(
    input.sceneReferenceIds,
    "场景参考",
    "只用于环境结构、空间关系、光线和氛围，不要把参考图中的人物或无关元素带入画面。",
  );
  addSupportLines(
    input.propReferenceIds,
    "道具/其它参考",
    "只用于道具外形、材质、纹理、颜色和关键识别点；只有镜头内容需要该道具时才出现，不要当成人物参考。",
  );
  return [...characterLines, ...supportLines].join("\n");
}

export function buildStoryReferencePromptDescription(
  imageNumber: number,
  reference: StoryPromptReference,
  constraintStyle: StoryPromptConstraintStyle = "explicit-exclusions",
  scope: "single" | "grid9" = "single",
) {
  const prefix = `Image ${imageNumber}`;
  const name = reference.role === "identity"
    ? reference.label.replace(/^角色「|」.*$/gu, "")
    : reference.label;

  if (constraintStyle === "positive-only") {
    if (reference.role === "identity") {
      if (scope === "grid9") {
        return `${prefix}：角色「${name}」身份与服装来源；继承脸型、发型、服装、配色和气质；各画格的角色名单与数量以对应画格的主体数量与身份为准。`;
      }
      return `${prefix}：角色「${name}」身份与服装来源；继承脸型、发型、服装、配色和气质；镜头角色数量映射为「${name}」×1。`;
    }
    if (reference.role === "scene") {
      return `${prefix}：场景「${name}」环境来源；继承空间结构、光线、色彩和氛围。`;
    }
    if (reference.role === "prop") {
      return `${prefix}：道具「${name}」造型来源；继承外形、材质、纹理、颜色和关键结构。`;
    }
    if (reference.role === "style") {
      return `${prefix}：风格「${name}」视觉来源；继承色彩、质感和视觉语言。`;
    }
    return `${prefix}：故事「${name}」世界设定来源；继承叙事氛围、色彩和整体连续性。`;
  }

  if (reference.role === "identity") {
    return `${prefix}：角色「${name}」的唯一身份参考（${legacyAngleLabel(reference.angle)}），只用于保持该单一角色的身份和外观（脸型、发型、服装、配色）；不继承输入图的姿态、景别、白底、留白或站位；该角色保持唯一一个实体，不得复制为多个实体。`;
  }
  if (reference.role === "scene") {
    return `${prefix}：场景「${name}」参考，仅用于环境、空间、光线与构图；不得带入人物。`;
  }
  if (reference.role === "prop") {
    return `${prefix}：道具「${name}」参考，仅用于保留该道具的外形、材质与关键结构；不得带入人物。`;
  }
  if (reference.role === "style") {
    return `${prefix}：风格「${name}」参考，仅用于色彩、质感与视觉风格；不得带入人物或额外实体。`;
  }
  return `${prefix}：故事「${name}」参考，仅用于叙事氛围与整体视觉方向；不得带入人物或额外实体。`;
}

function buildSingleShotPrompt<TReferences extends readonly unknown[], TRouting>(
  input: StoryImagePromptPlanInput<TReferences, TRouting>,
  constraintStyle: StoryPromptConstraintStyle,
) {
  const shot = input.shots[0]!;
  const names = appearingNames(shot, input.characters);
  const referenceAppendix = positiveReferenceAppendix(input.referenceAppendix, input.references);
  if (constraintStyle === "positive-only") {
    return `故事分镜图片。画面比例：${input.aspectRatio}。画面风格：${input.style}。

主体数量与身份：
${positiveCastContract(names)}
${positiveIdentityWardrobeContract(names)}

当前镜头：第 ${shot.index} 镜，${shot.title || "故事镜头"}
场景：${sceneDescription(shot, input.scenes)}
动作：${shot.action || "符合剧情的明确动作"}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
${positiveShotVisualLines(shot)}
连续性：${shot.continuityNote || "保持故事、角色、服装与场景连贯"}${referenceAppendix}`;
  }

  const excluded = excludedNames(shot, input.characters);
  const legacyReferenceLines = nonBlank(input.legacyReferenceLines)
    ? `参考图片编号：\n${input.legacyReferenceLines}\n`
    : "";
  return `画面比例 ${input.aspectRatio}，${input.style}。

最高优先级人物数量规则：
${legacySingleInstanceRule(names)}
参考图只是身份卡和服装卡，只提取脸型、发型、服装、配色和气质；不要复制参考图里的构图、人数、多视角、多姿态或多个站位。

当前镜头：第 ${shot.index} 镜，${shot.title || ""}
动作：${shot.action || ""}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
画面内容：${shot.visualContent || shot.imagePrompt}
连续性：${shot.continuityNote || "保持故事连贯"}

${shot.imagePrompt}

${legacyReferenceLines}
本镜头只出现：${names.length ? names.join("、") : "镜头描述中指定的人物"}。
不要出现：${excluded.length ? excluded.join("、") : "未在本镜头出现的其他主要角色"}。
不要把同一角色画成多个分身、复制人、镜像人物、远近两个版本、背景人物、群众、画像、雕像、屏幕画面、投影或倒影。不要让角色串脸，不要加入无关人物，不要文字、水印、logo。`;
}

function buildGrid9Prompt<TReferences extends readonly unknown[], TRouting>(
  input: StoryImagePromptPlanInput<TReferences, TRouting>,
  constraintStyle: StoryPromptConstraintStyle,
) {
  const referenceAppendix = positiveReferenceAppendix(input.referenceAppendix, input.references);
  if (constraintStyle === "positive-only") {
    const cells = input.shots.map((shot, index) => {
      const names = appearingNames(shot, input.characters);
      return `格${index + 1} / 第${shot.index}镜《${shot.title || "故事镜头"}》
${positiveCastContract(names)}
${positiveIdentityWardrobeContract(names)}
场景：${sceneDescription(shot, input.scenes)}
动作：${shot.action || "符合剧情的明确动作"}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
${positiveShotVisualLines(shot)}
连续性：${shot.continuityNote || "承接相邻镜头的角色、服装与场景状态"}`;
    }).join("\n\n");
    return `生成一张 3x3 九宫格连续分镜图。整体画面比例：${input.aspectRatio}。画面风格：${input.style}。

版式与连续性：一张图包含 9 个清晰独立画格，阅读顺序为从左到右、从上到下；每格采用完整电影构图；所有格保持身份、服装、场景、道具和光线连续。${referenceAppendix}
九宫格内容：
${cells}`;
  }

  const cells = input.shots.map((shot, index) => {
    const names = appearingNames(shot, input.characters);
    const excluded = excludedNames(shot, input.characters);
    return `格${index + 1} / 第${shot.index}镜《${shot.title || ""}》
动作：${shot.action || ""}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
画面内容：${shot.visualContent || shot.imagePrompt}
画面：${shot.imagePrompt}
只出现：${names.join("、") || "镜头描述中指定的人物"}
${legacySingleInstanceRule(names)}
不要出现：${excluded.join("、") || "未在本镜头出现的其他主要角色"}`;
  }).join("\n\n");
  const legacyReferenceLines = nonBlank(input.legacyReferenceLines)
    ? `参考图片编号：\n${input.legacyReferenceLines}\n`
    : "";
  return `生成一张 3x3 九宫格连续分镜图，画面比例 ${input.aspectRatio}，${input.style}。

规则：
- 一张图里必须有 9 个清晰独立画格，按从左到右、从上到下排列。
- 每个画格是一张完整分镜，构图干净，方便用户后续切图。
- 保持角色身份、服装、场景连续性；不要串脸，不要让未出现角色乱入。
- 每个画格必须严格遵守该格的人物数量规则；人数不能多也不能少。
- 每个画格内，同一个角色最多出现一次；不要把角色参考图复制成多个相同人物、多个姿态、多个站位或背景人物。
- 不要在画面中加入任何文字、数字、编号、镜头号、页码、字幕、水印、logo。
${input.references.length ? "- 参考图用于人物身份、场景、道具和整体连续性；参考图不是画面构图，不要机械复制参考图中的多视角、多姿态或多个主体。\n" : ""}${legacyReferenceLines}
九宫格内容：
${cells}`;
}

function appearingNames(
  shot: StoryImagePromptShot,
  characters: readonly StoryImagePromptCharacter[],
) {
  const characterById = new Map(characters.map((character) => [character.id, character.name]));
  return (shot.appearingCharacterIds || []).map((id) => characterById.get(id) || id).filter(Boolean);
}

function excludedNames(
  shot: StoryImagePromptShot,
  characters: readonly StoryImagePromptCharacter[],
) {
  const characterById = new Map(characters.map((character) => [character.id, character.name]));
  return (shot.excludedCharacterIds || []).map((id) => characterById.get(id) || id).filter(Boolean);
}

function positiveCastContract(names: readonly string[]) {
  return `人物与动物角色总数：${names.length}。身份名单与数量：${names.length ? names.map((name) => `${name} ×1`).join("、") : "0 名角色"}。`;
}

function positiveIdentityWardrobeContract(names: readonly string[]) {
  if (!names.length) return "画面主体：场景、动作所需道具与环境视觉事件。";
  return `身份与服装映射：${names.map((name) => `${name} 沿用对应身份特征与当前服装`).join("；")}。`;
}

function sceneDescription(
  shot: StoryImagePromptShot,
  scenes: readonly StoryImagePromptScene[] | undefined,
) {
  const scene = scenes?.find((candidate) => candidate.id === shot.sceneId);
  if (!scene) return shot.sceneId || "遵循当前镜头的场景设定";
  return nonBlank(scene.description) ? `${scene.name}：${scene.description}` : scene.name;
}

function legacySingleInstanceRule(names: readonly string[]) {
  if (!names.length) {
    return "最终画面只画镜头描述明确要求的人物；每个主要角色最多出现一次，不要添加背景人物、群众、倒影或投影人物。";
  }
  if (names.length === 1) {
    return `最终画面中人物/动物角色总数必须是 1，只允许出现：${names[0]} 1 个。${names[0]}只能有一个实体，不能同时出现正面、侧面、背影、远景小人或第二个相同角色。`;
  }
  return `最终画面中主要角色总数必须是 ${names.length}，名单为：${names.map((name) => `${name} 1 个`).join("、")}。每个角色只能有一个实体，不能重复出现同一张脸、同一套服装、同一动物花色或同一身份。`;
}

function positiveShotVisualLines(shot: StoryImagePromptShot) {
  const visualContent = nonBlank(shot.visualContent) ? shot.visualContent! : "";
  const imagePrompt = nonBlank(shot.imagePrompt) ? shot.imagePrompt! : "";
  if (visualContent && imagePrompt) {
    if (visualContent.includes(imagePrompt)) return `画面内容：${visualContent}`;
    if (imagePrompt.includes(visualContent)) return `生成描述：${imagePrompt}`;
    return `画面内容：${visualContent}\n生成描述：${imagePrompt}`;
  }
  const content = visualContent || imagePrompt || "符合镜头剧情的视觉内容";
  return `画面内容：${content}`;
}

function positiveReferenceAppendix(value: string | undefined, references: readonly unknown[]) {
  const onlyReference = references.length === 1 ? references[0] : undefined;
  if (
    typeof onlyReference === "object" &&
    onlyReference !== null &&
    "role" in onlyReference &&
    onlyReference.role === "identity"
  ) {
    return "";
  }
  return nonBlank(value) ? `\n\n参考图片映射：\n${value}` : "";
}

function nonBlank(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function legacyAngleLabel(angle: string | undefined) {
  if (angle === "back") return "背面";
  if (angle === "side") return "侧面";
  if (angle === "portrait") return "特写";
  if (angle === "identity") return "单图";
  return "正面";
}
