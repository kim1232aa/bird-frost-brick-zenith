export function classifyStorySceneReferenceCandidates(director, nodes) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const storyScenes = director.metadata?.storyScenes || [];
  const sceneInputIds = director.metadata?.storySceneSourceImageNodeIds || [];
  const sceneIdByNodeId = new Map(
    storyScenes.flatMap((scene) =>
      scene.referenceNodeId ? [[scene.referenceNodeId, scene.id]] : [],
    ),
  );
  const resolved = [];
  const unresolved = [];

  sceneInputIds.forEach((nodeId) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    let entityId = sceneIdByNodeId.get(node.id);
    if (!entityId) {
      const haystack = `${node.title || ""}\n${node.metadata?.storyLabel || ""}\n${node.metadata?.prompt || ""}`.toLocaleLowerCase();
      const matches = storyScenes.filter((scene) => {
        const name = String(scene.name || "").trim().toLocaleLowerCase();
        return Boolean(name && haystack.includes(name));
      });
      if (matches.length === 1) entityId = matches[0].id;
      else if (sceneInputIds.length === 1 && storyScenes.length === 1)
        entityId = storyScenes[0].id;
    }
    const candidate = {
      node,
      role: entityId ? "scene" : "other",
      ...(entityId ? { entityId } : {}),
      label: node.title,
    };
    (entityId ? resolved : unresolved).push(candidate);
  });
  return { resolved, unresolved };
}
