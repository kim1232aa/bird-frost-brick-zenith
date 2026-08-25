export type StoryDirectorRetryShot = {
  id: string;
  index: number;
};

export type StoryDirectorRetryGraphNode = {
  id: string;
  type?: unknown;
  title?: unknown;
  metadata?: {
    content?: unknown;
    status?: unknown;
    storyLabel?: unknown;
    storyGrid9ShotStart?: unknown;
    storyGrid9ShotEnd?: unknown;
  };
};

export type StoryDirectorRetryGraphConnection = {
  fromNodeId: string;
  toNodeId: string;
};

export type StoryDirectorShotRetryWorkItem<TShot extends StoryDirectorRetryShot> =
  | { mode: "single"; shot: TShot }
  | { mode: "grid9"; groupIndex: number; shots: TShot[] };

export type StoryDirectorShotRetrySelection<TShot extends StoryDirectorRetryShot> = {
  workItems: StoryDirectorShotRetryWorkItem<TShot>[];
  completedShotIndexes: number[];
  missingShotIndexes: number[];
  noWork: boolean;
};

export function selectStoryDirectorShotRetryWork<
  TShot extends StoryDirectorRetryShot,
>(input: {
  storyDirectorId: string;
  storyboardMode: "single" | "grid9";
  shots: readonly TShot[];
  nodes: readonly StoryDirectorRetryGraphNode[];
  connections: readonly StoryDirectorRetryGraphConnection[];
}): StoryDirectorShotRetrySelection<TShot> {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const coveredIndexes = new Set<number>();

  for (const connection of input.connections) {
    if (connection.fromNodeId !== input.storyDirectorId) continue;
    const outputNode = nodeById.get(connection.toNodeId);
    if (!isSuccessfulStoryOutput(outputNode)) continue;
    for (const index of storyShotIndexesFromOutput(outputNode)) {
      coveredIndexes.add(index);
    }
  }

  const completedShotIndexes = input.shots
    .map((shot) => shot.index)
    .filter((index) => coveredIndexes.has(index));
  const missingShotIndexes = input.shots
    .map((shot) => shot.index)
    .filter((index) => !coveredIndexes.has(index));
  const workItems =
    input.storyboardMode === "grid9"
      ? selectGrid9RetryWork(input.shots, coveredIndexes)
      : input.shots
          .filter((shot) => !coveredIndexes.has(shot.index))
          .map((shot) => ({ mode: "single" as const, shot }));

  return {
    workItems,
    completedShotIndexes,
    missingShotIndexes,
    noWork: workItems.length === 0,
  };
}

function selectGrid9RetryWork<TShot extends StoryDirectorRetryShot>(
  shots: readonly TShot[],
  coveredIndexes: ReadonlySet<number>,
): StoryDirectorShotRetryWorkItem<TShot>[] {
  const workItems: StoryDirectorShotRetryWorkItem<TShot>[] = [];
  for (let start = 0; start < shots.length; start += 9) {
    const group = shots.slice(start, start + 9);
    if (group.every((shot) => coveredIndexes.has(shot.index))) continue;
    workItems.push({
      mode: "grid9",
      groupIndex: Math.floor(start / 9),
      shots: group,
    });
  }
  return workItems;
}

function isSuccessfulStoryOutput(
  node: StoryDirectorRetryGraphNode | undefined,
): node is StoryDirectorRetryGraphNode {
  if (!node || node.type !== "image") return false;
  const metadata = node.metadata;
  return (
    typeof metadata?.content === "string" &&
    metadata.content.trim().length > 0 &&
    metadata.status !== "loading" &&
    metadata.status !== "error"
  );
}

function storyShotIndexesFromOutput(
  node: StoryDirectorRetryGraphNode,
): number[] {
  const rangeStart = positiveInteger(node.metadata?.storyGrid9ShotStart);
  const rangeEnd = positiveInteger(node.metadata?.storyGrid9ShotEnd);
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    return Array.from(
      { length: rangeEnd - rangeStart + 1 },
      (_, offset) => rangeStart + offset,
    );
  }

  const match = String(node.metadata?.storyLabel || node.title || "").match(
    /第\s*(\d+)\s*镜|镜头\s*(\d+)/,
  );
  const index = positiveInteger(match?.[1] || match?.[2]);
  return index ? [index] : [];
}

function positiveInteger(value: unknown): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
