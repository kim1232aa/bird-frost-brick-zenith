import type { StoryCast, StoryScene, StoryShot } from "./plan";

export function analysisPrompt(shotCount: number, style: string, aspectRatio: string, storyText: string) {
  return `你是故事导演节点的剧本分析模型。请读取上游“故事导演”文本，输出严格 JSON，不要输出解释。

任务：
1. 提取主要角色、重要配角、场景、人物关系。
2. 将剧情拆成 ${shotCount} 个镜头。
3. 每个镜头必须明确 appearingCharacterIds 和 excludedCharacterIds，防止不该出现的人物乱入。
4. characters[].visualPrompt 只能写角色本体的外貌、发型、服装、年龄、体型、气质和关键识别点；不要写背景、城市、房间、桌面、灯光、镜头、构图、剧情动作、宠物或其它角色。宠物/动物只能在该角色本体就是动物时写入。
5. characters[].negativePrompt 要补充会破坏角色资产统一性的内容，例如背景、场景、道具、其它人物、宠物、文字、水印、不同画风。
6. shots[].camera 要写景别和镜头语言，例如远景/中景/近景/特写、静态/推拉/摇移/俯拍/仰拍。
7. shots[].visualContent 要单独写画面内容，包括画面里看得见的主体、环境、道具、人物姿态、表情、空间关系、光线和关键视觉事件。
8. 输入文本可能是小说、章节大纲、脱口秀脚本、PPT 条目、对白、弹幕或分镜清单；这些都只是剧情内容，不是 JSON 源码。
9. 所有字符串字段必须是合法 JSON 字符串。画风：${style}。画面比例：${aspectRatio}。

JSON 结构：
{
  "logline": "一句话故事",
  "characters": [
    {
      "id": "char_001",
      "name": "角色名",
      "aliases": ["别名"],
      "roleType": "male_lead/supporting/villain/other",
      "importance": "main/supporting/extra",
      "appearance": "外貌",
      "personality": "性格",
      "visualPrompt": "可直接用于角色设定图的视觉提示词",
      "negativePrompt": "不要出现的特征"
    }
  ],
  "scenes": [
    { "id": "scene_001", "name": "场景名", "description": "场景描述", "mood": "氛围" }
  ],
  "shots": [
    {
      "id": "shot_001",
      "index": 1,
      "title": "镜头标题",
      "sceneId": "scene_001",
      "appearingCharacterIds": ["char_001"],
      "excludedCharacterIds": ["char_002"],
      "action": "动作",
      "camera": "景别和镜头语言",
      "emotion": "情绪",
      "visualContent": "画面内容",
      "imagePrompt": "用于生成该镜头图片的提示词",
      "dialogue": "对白或空",
      "duration": 5
    }
  ]
}

故事文本：
${storyText}`;
}

export function analysisRepairPrompt(shotCount: number, style: string, aspectRatio: string, storyText: string, broken: string, reason: string) {
  return `你是故事导演节点的 JSON 修复模型。只输出 JSON 对象，不要 Markdown。
错误：${reason}
上一轮输出：
${broken.slice(0, 4000)}

原任务：
${analysisPrompt(shotCount, style, aspectRatio, storyText)}`;
}

export function characterSheetPrompt(character: StoryCast, style: string, hasReference = false) {
  const referenceLine = hasReference
    ? "参考图只用于统一整体画风、质感、世界观和色彩标准；不要复制参考图中的构图、背景、人物数量、道具或无关主体。"
    : "";
  return `生成角色设定图，${style}。

角色：${character.name}
身份：${character.roleType || character.importance}
外貌：${character.appearance || character.look}
性格：${character.personality || "按故事气质表现"}
视觉呈现：${character.visualPrompt || character.look}
${referenceLine}

要求：清晰展现角色的面容五官、体型轮廓、发型和标志性服装细节，保持画面主体明确、质感细腻。避免多余的水印、文字、logo。${character.negativePrompt ? `\n避免：${character.negativePrompt}` : ""}`;
}

export function shotImagePrompt(input: {
  shot: StoryShot;
  cast: StoryCast[];
  scenes: StoryScene[];
  style: string;
  aspectRatio: string;
  hasCharacterRef?: boolean;
}) {
  const names = appearingNames(input.shot, input.cast);
  const excluded = excludedNames(input.shot, input.cast);
  const scene = sceneLine(input.shot, input.scenes);
  const refRule = input.hasCharacterRef
    ? "参考图只是身份卡和服装卡，只提取脸型、发型、服装、配色和气质；不要复制参考图里的构图、人数、多视角、多姿态或多个站位。"
    : "";
  return `画面比例 ${input.aspectRatio}，${input.style}。

最高优先级人物数量规则：
${singleInstanceRule(names)}
${refRule}

当前镜头：第 ${input.shot.index || 1} 镜，${input.shot.title || ""}
场景：${scene}
动作：${input.shot.action || input.shot.title || ""}
景别：${input.shot.camera || "电影感中景"}
情绪：${input.shot.emotion || "符合剧情"}
画面内容：${input.shot.visualContent || input.shot.prompt}
连续性：${input.shot.continuityNote || "保持故事、角色、服装与场景连贯"}

${input.shot.imagePrompt || input.shot.prompt}

本镜头只出现：${names.length ? names.join("、") : "镜头描述中指定的人物"}。
不要出现：${excluded.length ? excluded.join("、") : "未在本镜头出现的其他主要角色"}。
不要把同一角色画成多个分身、复制人、镜像人物、远近两个版本、背景人物、群众、画像、雕像、屏幕画面、投影或倒影。不要让角色串脸，不要加入无关人物，不要文字、水印、logo。`;
}

export function grid9Prompt(input: {
  shots: StoryShot[];
  cast: StoryCast[];
  scenes: StoryScene[];
  style: string;
  aspectRatio: string;
}) {
  const cells = input.shots.map((shot, index) => {
    const names = appearingNames(shot, input.cast);
    const excluded = excludedNames(shot, input.cast);
    return `格${index + 1} / 第${shot.index || index + 1}镜《${shot.title || ""}》
动作：${shot.action || ""}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
画面内容：${shot.visualContent || shot.prompt}
画面：${shot.imagePrompt || shot.prompt}
只出现：${names.join("、") || "镜头描述中指定的人物"}
${singleInstanceRule(names)}
不要出现：${excluded.join("、") || "未在本镜头出现的其他主要角色"}`;
  }).join("\n\n");
  return `生成一张 3x3 九宫格连续分镜图，画面比例 ${input.aspectRatio}，${input.style}。

规则：
- 一张图里必须有 9 个清晰独立画格，按从左到右、从上到下排列。
- 每个画格是一张完整分镜，构图干净，方便用户后续切图。
- 保持角色身份、服装、场景连续性；不要串脸，不要让未出现角色乱入。
- 每个画格必须严格遵守该格的人物数量规则；人数不能多也不能少。
- 每个画格内，同一个角色最多出现一次。
- 不要在画面中加入任何文字、数字、编号、镜头号、页码、字幕、水印、logo。

九宫格内容：
${cells}`;
}

function appearingNames(shot: StoryShot, cast: StoryCast[]) {
  if (shot.appearingCharacterIds?.length) {
    return shot.appearingCharacterIds.map((id) => cast.find((person) => person.id === id)?.name || id).filter(Boolean);
  }
  return (shot.characters || []).filter(Boolean);
}

function excludedNames(shot: StoryShot, cast: StoryCast[]) {
  if (shot.excludedCharacterIds?.length) {
    return shot.excludedCharacterIds.map((id) => cast.find((person) => person.id === id)?.name || id).filter(Boolean);
  }
  const appearing = new Set(appearingNames(shot, cast));
  return cast.filter((person) => person.importance !== "extra" && !appearing.has(person.name)).map((person) => person.name);
}

function sceneLine(shot: StoryShot, scenes: StoryScene[]) {
  const hit = scenes.find((item) => item.id === shot.sceneId || item.name === shot.scene);
  if (hit) return hit.description ? `${hit.name}：${hit.description}` : hit.name;
  return shot.scene || "遵循当前镜头的场景设定";
}

function singleInstanceRule(names: string[]) {
  if (!names.length) return "最终画面只画镜头描述明确要求的人物；每个主要角色最多出现一次，不要添加背景人物、群众、倒影或投影人物。";
  if (names.length === 1) {
    return `最终画面中人物/动物角色总数必须是 1，只允许出现：${names[0]} 1 个。${names[0]}只能有一个实体，不能同时出现正面、侧面、背影、远景小人或第二个相同角色。`;
  }
  return `最终画面中主要角色总数必须是 ${names.length}，名单为：${names.map((name) => `${name} 1 个`).join("、")}。每个角色只能有一个实体，不能重复出现同一张脸、同一套服装或同一身份。`;
}
