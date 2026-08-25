export type PavoTestWorkspaceSnapshot = {
  projectId?: string;
  title?: string;
  nodes: Array<Record<string, any>>;
  connections: Array<Record<string, any>>;
  chatSessions?: unknown[];
  [key: string]: unknown;
};

export function clonePavoTestWorkspace(
  snapshot: PavoTestWorkspaceSnapshot,
  runId: string,
): PavoTestWorkspaceSnapshot {
  const source = cloneJson(snapshot);
  const safeRunId = String(runId || "run").replace(/[^\w\u4e00-\u9fff-]+/g, "-");
  const projectId = `pavo-test-${safeRunId}`;
  const nodeIdMap = new Map<string, string>();

  const nodes = source.nodes.map((node, index) => {
    const sourceId = String(node.id || `node-${index + 1}`);
    const id = `${projectId}-node-${index + 1}`;
    nodeIdMap.set(sourceId, id);
    const metadata = {
      ...(node.metadata || {}),
      status: "idle",
      errorDetails: undefined,
      imageTaskId: undefined,
      sourceImageTaskId: undefined,
      seedanceTaskId: undefined,
      seedanceFileUrls: undefined,
      seedanceFiles: undefined,
      pavoTestWorkspace: true,
      pavoTestRunId: runId,
      pavoTestSourceNodeId: sourceId,
    };
    return { ...node, id, metadata };
  });

  const connections = source.connections.map((connection, index) => ({
    ...connection,
    id: `${projectId}-connection-${index + 1}`,
    fromNodeId: nodeIdMap.get(String(connection.fromNodeId)) || String(connection.fromNodeId),
    toNodeId: nodeIdMap.get(String(connection.toNodeId)) || String(connection.toNodeId),
  }));

  return {
    ...source,
    projectId,
    title: `Pavo 流程测试副本 · ${runId}`,
    nodes,
    connections,
    chatSessions: [],
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
