import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { normalizeVideoReferenceUseAs } from "@/services/api/video-reference-purpose";
import type { VideoReferenceUseAs } from "@/types/media";

export type CanvasResourceKind = "image" | "video" | "audio" | "text";

export type CanvasResourceReference = {
    id: string;
    nodeId: string;
    kind: CanvasResourceKind;
    label: string;
    title: string;
    previewUrl?: string;
    text?: string;
    active: boolean;
    videoUseAs?: VideoReferenceUseAs;
};

export function buildCanvasResourceReferences(nodes: CanvasNodeData[], connections: CanvasConnection[], contextNodeId?: string | null) {
    const contextNodes = contextNodeId ? getMentionResourceNodes(contextNodeId, nodes, connections) : [];
    const globalReferences = labelResourceNodes(nodes.filter(isResourceNode), false);
    const activeByNodeId = new Map(labelResourceNodes(contextNodes, true).map((reference) => [reference.nodeId, reference]));
    const activeReferences = contextNodes.flatMap((node) => activeByNodeId.get(node.id) || []);
    const activeNodeIds = new Set(activeReferences.map((reference) => reference.nodeId));
    const inactiveReferences = globalReferences.filter((reference) => !activeNodeIds.has(reference.nodeId));
    return [...activeReferences, ...inactiveReferences];
}

export function buildNodeMentionReferences(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const purposes = upstreamVideoPurposes(node.id, connections);
    return labelResourceNodes(getMentionResourceNodes(node.id, nodes, connections), true).map((reference) =>
        reference.kind === "video" ? { ...reference, videoUseAs: purposes.get(reference.nodeId) || "reference_video" } : reference,
    );
}

function upstreamVideoPurposes(nodeId: string, connections: CanvasConnection[]) {
    const incoming = new Map<string, CanvasConnection[]>();
    connections.forEach((connection) => incoming.set(connection.toNodeId, [...(incoming.get(connection.toNodeId) || []), connection]));
    const purposes = new Map<string, VideoReferenceUseAs>();
    const queue = [...(incoming.get(nodeId) || [])];
    const visited = new Set<string>();
    while (queue.length) {
        const connection = queue.shift()!;
        if (visited.has(connection.id)) continue;
        visited.add(connection.id);
        if (!purposes.has(connection.fromNodeId)) purposes.set(connection.fromNodeId, normalizeVideoReferenceUseAs(connection.videoUseAs));
        queue.push(...(incoming.get(connection.fromNodeId) || []));
    }
    return purposes;
}

export function getMentionResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections);
    if (ownInputs.length) return ownInputs;
    const node = nodes.find((item) => item.id === nodeId);
    return node && isResourceNode(node) ? [node] : [];
}

export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections, true);
    if (configInputs.length) return configInputs;
    const ownInputs = getUpstreamResourceNodes(nodeId, nodes, connections);
    if (ownInputs.length) return ownInputs;
    return [];
}

function getContextResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node && isResourceNode(node)));
}

function getConnectedConfigResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], recursive = false) {
    const configConnection = connections.find((connection) => connection.fromNodeId === nodeId && nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config);
    if (!configConnection) return [];
    const getResourceNodes = recursive ? getUpstreamResourceNodes : getContextResourceNodes;
    return getResourceNodes(configConnection.toNodeId, nodes, connections).filter((node) => node.id !== nodeId);
}

function getUpstreamResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const visited = new Set<string>([nodeId]);
    const collected = new Set<string>();
    const resources: CanvasNodeData[] = [];
    const queue = getIncomingConnections(nodeId, connections).map((connection) => connection.fromNodeId);

    while (queue.length) {
        const currentId = queue.shift();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);

        const currentNode = nodeById.get(currentId);
        if (currentNode && isResourceNode(currentNode) && !collected.has(currentId)) {
            resources.push(currentNode);
            collected.add(currentId);
        }

        getIncomingConnections(currentId, connections).forEach((connection) => {
            if (!visited.has(connection.fromNodeId)) queue.push(connection.fromNodeId);
        });
    }

    return resources;
}

function getIncomingConnections(nodeId: string, connections: CanvasConnection[]) {
    return connections.filter((connection) => connection.toNodeId === nodeId);
}

function labelResourceNodes(nodes: CanvasNodeData[], active: boolean) {
    const counts: Record<CanvasResourceKind, number> = { image: 0, video: 0, audio: 0, text: 0 };
    return nodes.flatMap((node): CanvasResourceReference[] => {
        const kind = resourceKind(node);
        if (!kind) return [];
        const index = counts[kind]++;
        const label = labelForKind(kind, index);
        return [
            {
                id: node.id,
                nodeId: node.id,
                kind,
                label,
                title: node.title || label,
                previewUrl: node.metadata?.content,
                text: node.type === CanvasNodeType.Text || node.type === CanvasNodeType.StoryDirector ? node.metadata?.storyText || node.metadata?.content || node.metadata?.prompt : undefined,
                active,
            },
        ];
    });
}

function labelForKind(kind: CanvasResourceKind, index: number) {
    if (kind === "image") return imageReferenceLabel(index);
    if (kind === "video") return seedanceReferenceLabel("video", index);
    if (kind === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function isResourceNode(node: CanvasNodeData) {
    return Boolean(resourceKind(node));
}

function resourceKind(node: CanvasNodeData): CanvasResourceKind | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return "image";
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return "video";
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return "audio";
    if (node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)) return "text";
    if (node.type === CanvasNodeType.StoryDirector && (node.metadata?.storyText || node.metadata?.content || node.metadata?.prompt)) return "text";
    return null;
}
