export const SEEDANCE2_STORY_DIRECTOR_TYPE = "story_director";
export const SEEDANCE2_WORKFLOW_NODE_TYPE = "seedance2_workflow";
export const SEEDANCE2_WORKFLOW_UPSTREAM_GAP = 64;

export type Seedance2WorkflowPlacementNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};

function boxesOverlap(
  left: Pick<Seedance2WorkflowPlacementNode, "position" | "width" | "height">,
  right: Pick<Seedance2WorkflowPlacementNode, "position" | "width" | "height">,
) {
  return (
    left.position.x < right.position.x + right.width &&
    left.position.x + left.width > right.position.x &&
    left.position.y < right.position.y + right.height &&
    left.position.y + left.height > right.position.y
  );
}

function upstreamRightOfDirectors(
  directors: readonly Seedance2WorkflowPlacementNode[],
  nodes: readonly Seedance2WorkflowPlacementNode[],
) {
  const directorIds = new Set(directors.map((director) => director.id));
  return nodes.reduce((right, node) => {
    if (directorIds.has(node.id) || node.type === SEEDANCE2_WORKFLOW_NODE_TYPE) return right;
    const besideDirector = directors.some((director) => {
      const startsRightOfDirector = node.position.x + node.width > director.position.x + director.width;
      const sharesDirectorRow =
        node.position.y < director.position.y + director.height &&
        node.position.y + node.height > director.position.y;
      return startsRightOfDirector && sharesDirectorRow;
    });
    if (!besideDirector) return right;
    return Math.max(right, node.position.x + node.width);
  }, directors.reduce(
    (right, director) => Math.max(right, director.position.x + director.width),
    Number.NEGATIVE_INFINITY,
  ));
}

/**
 * Place a new 分镜视频工作流 to the right of the story directors and the
 * storyboard images already sitting on their right. `storyDirector` wins when
 * the workflow is bound to exactly one of them. An existing workflow is moved
 * only when its box already intersects that upstream cluster; otherwise the
 * caller keeps the position the user already has.
 */
export function placeSeedance2WorkflowBesideStoryDirector(options: {
  storyDirector?: Seedance2WorkflowPlacementNode;
  nodes: readonly Seedance2WorkflowPlacementNode[];
  workflowSize: { width: number; height: number };
  existingPosition?: { x: number; y: number };
  gap?: number;
}): { x: number; y: number } | null {
  const directors = options.storyDirector
    ? [options.storyDirector]
    : options.nodes.filter((node) => node.type === SEEDANCE2_STORY_DIRECTOR_TYPE);
  if (!directors.length) return null;
  const gap = options.gap ?? SEEDANCE2_WORKFLOW_UPSTREAM_GAP;
  const anchor = options.storyDirector
    || directors.reduce((top, director) => director.position.y < top.position.y ? director : top);
  const clearPosition = {
    x: upstreamRightOfDirectors(directors, options.nodes) + gap,
    y: anchor.position.y,
  };
  if (!options.existingPosition) return clearPosition;
  const existingBox = {
    position: options.existingPosition,
    width: options.workflowSize.width,
    height: options.workflowSize.height,
  };
  const overlapsUpstream = [...directors, ...options.nodes].some((node) => {
    if (node.type === SEEDANCE2_WORKFLOW_NODE_TYPE) return false;
    return boxesOverlap(existingBox, node);
  });
  return overlapsUpstream ? clearPosition : null;
}
