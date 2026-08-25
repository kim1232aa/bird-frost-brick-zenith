import type { ChatCompletionMessage } from "@/services/api/image";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo, VideoReferenceUseAs } from "@/types/media";
import { normalizeVideoReferenceUseAs } from "@/services/api/video-reference-purpose";
import { resolveVideoReferenceSlotContract } from "@/services/api/video-reference-slot-contract";
import type { ResolvedVideoModelCapability, VideoReferenceIntent } from "@/services/api/video-model-capabilities";
import type { VideoGenerationSettingsScope } from "@/stores/video-generation-settings";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Seedance2ReferenceSlotUseAs } from "../types";
import { getGenerationResourceNodes } from "../utils/canvas-resource-references";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
    inputErrors: string[];
};

export type NodeReferenceImage = ReferenceImage & {
    useAs?: Seedance2ReferenceSlotUseAs;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: NodeReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
    inputError?: string;
};

export function resolveConfigVideoReferencePreview<T extends { useAs?: string }>({
    capability,
    generationScope,
    references,
    videos = [],
    connectionErrors = [],
}: {
    capability: ResolvedVideoModelCapability;
    generationScope?: Pick<VideoGenerationSettingsScope, "operation">;
    references: readonly T[];
    videos?: readonly { useAs?: VideoReferenceUseAs }[];
    hasReferenceAudio?: boolean;
    connectionErrors?: readonly string[];
}) {
    const operation = generationScope?.operation;
    const contract = resolveVideoReferenceSlotContract({ capability, operation, references, videos });
    const kind = previewReferenceIntentKind(capability, references);
    let error = "";
    if (connectionErrors.length) error = connectionErrors[0];
    else if (contract.state === "blocked") error = contract.reason || "当前模型的参考素材合同未核验";
    else if (contract.notSubmitted.length) error = contract.notSubmitted[0].reason;
    else if (capability.requiresFirstLastFrame && kind !== "first_last_frame") {
        error = "当前模型要求同时连接并标记首帧和尾帧";
    } else if (capability.allowedReferenceIntentKinds && !capability.allowedReferenceIntentKinds.includes(kind)) {
        error = `当前精确 service 不接受 ${kind} 素材组合`;
    }
    return {
        contract,
        kind,
        error,
        operation,
    };
}

export function resolveConfigNodeVideoReferencePreview<T extends { useAs?: string }>({
    node,
    capability,
    references,
    videos = [],
    hasReferenceAudio = false,
    connectionErrors = [],
}: {
    node: Pick<CanvasNodeData, "metadata">;
    capability: ResolvedVideoModelCapability;
    references: readonly T[];
    videos?: readonly { useAs?: VideoReferenceUseAs }[];
    hasReferenceAudio?: boolean;
    connectionErrors?: readonly string[];
}) {
    return resolveConfigVideoReferencePreview({
        capability,
        generationScope: node.metadata?.videoGenerationScope,
        references,
        videos,
        hasReferenceAudio,
        connectionErrors,
    });
}

function previewReferenceIntentKind(
    capability: ResolvedVideoModelCapability,
    references: readonly { useAs?: string }[],
): VideoReferenceIntent["kind"] {
    if (!references.length) return "none";
    const first = references.some((reference) => reference.useAs === "first_frame");
    const last = references.some((reference) => reference.useAs === "last_frame");
    const keyframes = references.some((reference) => reference.useAs === "keyframe");
    const ordinary = references.some((reference) => !reference.useAs || reference.useAs === "reference_image");
    if (capability.intentPolicy === "keyframes") return references.length === 1 ? "first_frame" : "keyframes";
    if (first && last) return "first_last_frame";
    if (first && ordinary) {
        return capability.intentPolicy === "reference-set-with-frames" ? "reference_set_with_frames" : "reference_set_with_first";
    }
    if (first) return "first_frame";
    if (last || keyframes) return "none";
    return "reference_set";
}

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if (sourceNode?.type === CanvasNodeType.Config && Boolean(sourceNode.metadata?.composerContent?.trim())) {
        const context = buildComposerGenerationContext(inputs, prompt);
        return context || buildDefaultGenerationContext(inputs, prompt);
    }

    return buildDefaultGenerationContext(inputs, prompt);
}

function buildDefaultGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const promptText = prompt.trim();
    const upstreamText = inputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is NodeReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: promptText || upstreamText,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
        inputErrors: inputs.flatMap((input) => input.inputError ? [input.inputError] : []),
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext | null {
    const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        hasToken = true;
        nextPrompt += prompt.slice(lastIndex, match.index);
        const input = inputByNodeId.get(match[1]);
        if (input) {
            let label = labelByNodeId.get(input.nodeId);
            if (!label) {
                label = generationLabel(input.type, counts[input.type]++);
                labelByNodeId.set(input.nodeId, label);
                if (input.type === "text") textBlocks.push(`【${label}】\n${input.text || ""}`);
                else selectedInputs.push(input);
            }
            nextPrompt += input.type === "text" ? `【${label}】` : label;
        }
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += prompt.slice(lastIndex);
    if (textBlocks.length) nextPrompt = `${nextPrompt.trim()}\n\n${textBlocks.join("\n\n")}`;
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is NodeReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    if (!hasToken) {
        return null;
    }

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
        inputErrors: selectedInputs.flatMap((input) => input.inputError ? [input.inputError] : []),
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    const purposes = collectUpstreamMediaPurposes(nodeId, connections);
    const hydratedResources = getGenerationResourceNodes(nodeId, nodes, connections);
    const hydratedIds = new Set(hydratedResources.map((node) => node.id));
    const candidateResources = collectConnectedMediaCandidates(nodeId, nodes, connections)
        .filter((node) => !hydratedIds.has(node.id));
    return [...hydratedResources, ...candidateResources].flatMap((node): NodeGenerationInput[] => {
        const image = readReferenceImage(node, purposes.imageUseAsByNodeId.get(node.id));
        if (image) return [{ nodeId: node.id, type: "image" as const, title: node.title, image, inputError: purposes.errorsByNodeId.get(node.id) || missingMediaInputError(node, "图片") }];
        const video = readReferenceVideo(node, purposes.videoUseAsByNodeId.get(node.id));
        if (video) return [{ nodeId: node.id, type: "video" as const, title: node.title, video, inputError: purposes.errorsByNodeId.get(node.id) || missingMediaInputError(node, "视频") }];
        const audio = readReferenceAudio(node);
        if (audio) return [{ nodeId: node.id, type: "audio" as const, title: node.title, audio, inputError: missingMediaInputError(node, "音频") }];
        const text = readNodeTextInput(node);
        if (text) return [{ nodeId: node.id, type: "text" as const, title: node.title, text }];
        return [];
    });
}

function collectConnectedMediaCandidates(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, CanvasConnection[]>();
    connections.forEach((connection) => {
        const list = incoming.get(connection.toNodeId) || [];
        list.push(connection);
        incoming.set(connection.toNodeId, list);
    });
    const configConnection = connections.find((connection) => (
        connection.fromNodeId === nodeId &&
        nodeById.get(connection.toNodeId)?.type === CanvasNodeType.Config
    ));
    const queue = [configConnection?.toNodeId || nodeId];
    const visited = new Set<string>();
    const candidates: CanvasNodeData[] = [];
    const seenCandidates = new Set<string>();
    while (queue.length) {
        const currentId = queue.shift();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);
        for (const connection of incoming.get(currentId) || []) {
            const source = nodeById.get(connection.fromNodeId);
            if (!source) continue;
            if (
                (source.type === CanvasNodeType.Image || source.type === CanvasNodeType.Video || source.type === CanvasNodeType.Audio) &&
                !seenCandidates.has(source.id)
            ) {
                seenCandidates.add(source.id);
                candidates.push(source);
            }
            queue.push(source.id);
        }
    }
    return candidates;
}

function missingMediaInputError(node: CanvasNodeData, kind: "图片" | "视频" | "音频") {
    const source = node.metadata?.content || node.metadata?.backendUrl || node.metadata?.backendRel;
    return source ? undefined : `${kind}素材 ${node.id} 尚未完成媒体 hydration；已保留候选，提交前必须完成读取`;
}

function collectUpstreamMediaPurposes(nodeId: string, connections: CanvasConnection[]) {
    const incoming = new Map<string, CanvasConnection[]>();
    for (const connection of connections) {
        const list = incoming.get(connection.toNodeId) || [];
        list.push(connection);
        incoming.set(connection.toNodeId, list);
    }
    const imageUseAsByNodeId = new Map<string, Seedance2ReferenceSlotUseAs>();
    const videoUseAsByNodeId = new Map<string, VideoReferenceUseAs | undefined>();
    const errorsByNodeId = new Map<string, string>();
    const queue = [...(incoming.get(nodeId) || [])];
    const visitedConnections = new Set<string>();
    while (queue.length) {
        const connection = queue.shift()!;
        if (visitedConnections.has(connection.id)) continue;
        visitedConnections.add(connection.id);
        if (connection.useAs) {
            const current = imageUseAsByNodeId.get(connection.fromNodeId);
            if (current && current !== connection.useAs) {
                errorsByNodeId.set(connection.fromNodeId, `图片素材 ${connection.fromNodeId} 通过多条连线被同时标记为 ${current} 和 ${connection.useAs}；请统一用途后再生成`);
            } else {
                imageUseAsByNodeId.set(connection.fromNodeId, connection.useAs);
            }
        }
        const normalizedVideoUseAs = normalizeVideoReferenceUseAs(connection.videoUseAs);
        const currentVideoUseAs = videoUseAsByNodeId.get(connection.fromNodeId);
        if (currentVideoUseAs && currentVideoUseAs !== normalizedVideoUseAs) {
            errorsByNodeId.set(connection.fromNodeId, `视频素材 ${connection.fromNodeId} 通过多条连线被同时标记为 ${currentVideoUseAs} 和 ${normalizedVideoUseAs}；请统一用途后再生成`);
        } else if (connection.videoUseAs) {
            videoUseAsByNodeId.set(connection.fromNodeId, normalizedVideoUseAs);
        } else if (!videoUseAsByNodeId.has(connection.fromNodeId)) {
            videoUseAsByNodeId.set(connection.fromNodeId, undefined);
        }
        queue.push(...(incoming.get(connection.fromNodeId) || []));
    }
    return { imageUseAsByNodeId, videoUseAsByNodeId, errorsByNodeId };
}

export function buildNodeChatMessages(context: NodeGenerationContext): ChatCompletionMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    if (node.type === CanvasNodeType.StoryDirector) return node.metadata?.storyText || node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function generationLabel(type: NodeGenerationInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return seedanceReferenceLabel("video", index);
    if (type === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function readReferenceImage(node: CanvasNodeData, useAs?: Seedance2ReferenceSlotUseAs): NodeReferenceImage | null {
    if (node.type !== CanvasNodeType.Image) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata?.mimeType || "image/png",
        dataUrl: node.metadata?.content || "",
        storageKey: node.metadata?.storageKey,
        ...(useAs ? { useAs } : {}),
    };
}

function readReferenceVideo(node: CanvasNodeData, useAs?: VideoReferenceUseAs): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata?.mimeType || "video/mp4",
        url: node.metadata?.content || "",
        storageKey: node.metadata?.storageKey,
        bytes: node.metadata?.bytes,
        width: node.metadata?.naturalWidth,
        height: node.metadata?.naturalHeight,
        durationMs: node.metadata?.durationMs,
        ...(useAs ? { useAs } : {}),
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata?.mimeType || "audio/mpeg",
        url: node.metadata?.content || "",
        storageKey: node.metadata?.storageKey,
        durationMs: node.metadata?.durationMs,
    };
}
