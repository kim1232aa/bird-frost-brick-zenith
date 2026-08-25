const CanvasNodeType = {
  Image: "image",
  StoryDirector: "story_director",
};

const LEGACY_CHARACTER_TURNAROUND_LAYOUT_MARKER =
  "四区布局，从左到右依次为：正面全身站姿、侧面全身站姿、背面全身站姿、右侧上半身面部特写";

export function migrateLegacyStoryCharacterAssets(nodes, connections) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const characterIdByReferenceNodeId = new Map();
  const storyCharacterConnectionNodeIds = new Set();
  nodes.forEach((director) => {
    if (director.type !== CanvasNodeType.StoryDirector) return;
    (director.metadata?.storyCharacters || []).forEach((character) => {
      if (character.referenceNodeId)
        characterIdByReferenceNodeId.set(character.referenceNodeId, character.id);
    });
    connections
      .filter(
        (connection) =>
          connection.toNodeId === director.id &&
          connection.toHandleId === "story:character" &&
          nodeById.get(connection.fromNodeId)?.type === CanvasNodeType.Image,
      )
      .forEach((connection) =>
        storyCharacterConnectionNodeIds.add(connection.fromNodeId),
      );
  });

  let changed = false;
  const migrated = nodes.map((node) => {
    if (
      node.type !== CanvasNodeType.Image ||
      node.metadata?.storyCharacterAssetKind
    )
      return node;
    const explicitCharacterId = characterIdByReferenceNodeId.get(node.id);
    const isStoryCharacterAsset =
      Boolean(explicitCharacterId) || storyCharacterConnectionNodeIds.has(node.id);
    if (!isStoryCharacterAsset) return node;
    const prompt = String(node.metadata?.prompt || "");
    const isApplicationTurnaround =
      (prompt.includes("最高优先级统一模板") ||
        prompt.includes("生成角色设定图")) &&
      prompt.includes(LEGACY_CHARACTER_TURNAROUND_LAYOUT_MARKER);
    if (!isApplicationTurnaround && !explicitCharacterId) return node;
    changed = true;
    return {
      ...node,
      metadata: {
        ...node.metadata,
        storyCharacterAssetKind: isApplicationTurnaround
          ? "turnaround_sheet"
          : "identity_reference",
        storyCharacterId: node.metadata?.storyCharacterId || explicitCharacterId,
        ...(isApplicationTurnaround
          ? { characterDerivedViewsStatus: "pending" }
          : {}),
      },
    };
  });
  return changed ? migrated : nodes;
}
