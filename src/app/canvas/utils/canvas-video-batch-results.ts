import type { UploadedFile } from "../../../services/file-storage";
import type { CanvasConnection, CanvasNodeData } from "../types";

export type ApplyCanvasVideoBatchResultsOptions = {
    readonly nodes: readonly CanvasNodeData[];
    readonly connections: readonly CanvasConnection[];
    readonly targetNodeId: string;
    readonly videos: readonly UploadedFile[];
    readonly createNodeId: (resultIndex: number) => string;
    readonly createConnectionId: (resultIndex: number, sourceConnectionIndex: number) => string;
    readonly gap?: number;
    readonly maxWidth?: number;
    readonly maxHeight?: number;
};

/**
 * Materialize one provider task's complete output batch atomically. The
 * existing target becomes result 1; additional results are sibling nodes with
 * the same incoming edges. Outgoing edges remain attached only to the original
 * node so downstream reference semantics are never broadened implicitly.
 */
export function applyCanvasVideoBatchResults(options: ApplyCanvasVideoBatchResultsOptions) {
    const target = options.nodes.find((node) => node.id === options.targetNodeId);
    if (!target) throw new Error(`视频批次目标节点 ${options.targetNodeId} 已不存在`);
    if (!options.videos.length) throw new Error("视频批次没有可落盘的结果");
    const gap = options.gap ?? 36;
    const maxWidth = options.maxWidth ?? 420;
    const maxHeight = options.maxHeight ?? 420;
    const centerY = target.position.y + target.height / 2;
    const incoming = options.connections.filter((connection) => connection.toNodeId === target.id);
    const resultNodes: CanvasNodeData[] = [];
    let nextX = target.position.x;

    options.videos.forEach((video, resultIndex) => {
        const size = fitVideoNodeSize(
            video.width || target.width,
            video.height || target.height,
            maxWidth,
            maxHeight,
        );
        const id = resultIndex === 0 ? target.id : options.createNodeId(resultIndex);
        const position = resultIndex === 0
            ? {
                  x: target.position.x + target.width / 2 - size.width / 2,
                  y: centerY - size.height / 2,
              }
            : { x: nextX, y: centerY - size.height / 2 };
        const node: CanvasNodeData = {
            ...target,
            id,
            ...(resultIndex > 0 ? { title: `${target.title} ${resultIndex + 1}` } : {}),
            position,
            width: size.width,
            height: size.height,
            metadata: {
                ...target.metadata,
                content: video.url,
                storageKey: video.storageKey,
                status: "success",
                errorDetails: undefined,
                naturalWidth: video.width,
                naturalHeight: video.height,
                bytes: video.bytes,
                mimeType: video.mimeType || "video/mp4",
                durationMs: video.durationMs,
                videoGenerationTask: undefined,
                videoResultIndex: resultIndex,
                videoResultCount: options.videos.length,
            },
        };
        resultNodes.push(node);
        nextX = position.x + size.width + gap;
    });

    const firstResult = resultNodes[0];
    const extraResults = resultNodes.slice(1);
    const nextNodes = [
        ...options.nodes.map((node) => node.id === target.id ? firstResult : node),
        ...extraResults,
    ];
    const extraConnections = extraResults.flatMap((node, extraIndex) => incoming.map((connection, connectionIndex) => ({
        ...connection,
        id: options.createConnectionId(extraIndex + 1, connectionIndex),
        toNodeId: node.id,
    })));
    return {
        nodes: nextNodes,
        connections: [...options.connections, ...extraConnections],
        resultNodeIds: resultNodes.map((node) => node.id),
    };
}

function fitVideoNodeSize(width: number, height: number, maxWidth: number, maxHeight: number) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
    return { width: safeWidth * scale, height: safeHeight * scale };
}
