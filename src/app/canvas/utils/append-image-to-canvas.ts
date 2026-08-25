"use client";

import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/app/canvas/constants";
import { useCanvasStore, type CanvasProject } from "@/app/canvas/stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/app/canvas/types";
import { readImageMeta } from "@/lib/image-utils";
import { uploadImage, type UploadedImage } from "@/services/image-storage";

type AppendGeneratedImageInput = {
    sourceId: string;
    title?: string;
    prompt?: string;
    dataUrl?: string;
    url?: string;
    backendRel?: string;
    model?: string;
    size?: string;
};

type CanvasImageSource = Omit<UploadedImage, "storageKey"> & { storageKey?: string };

const AUTO_CANVAS_TITLE = "生图自动保存";
const COLUMN_COUNT = 4;
const GAP_X = 72;
const GAP_Y = 72;

export async function appendGeneratedImagesToCanvas(items: AppendGeneratedImageInput[]) {
    const validItems = items.filter((item) => item.sourceId && (item.dataUrl || item.url));
    if (!validItems.length) return 0;

    const store = useCanvasStore.getState();
    let project: CanvasProject | null = store.projects[0] || null;
    let projectId = project?.id || "";
    if (!projectId) {
        projectId = store.createProject(AUTO_CANVAS_TITLE);
        project = useCanvasStore.getState().projects.find((item) => item.id === projectId) || null;
    }
    if (!project) return 0;

    const existingSourceIds = new Set(project.nodes.map((node) => node.metadata?.sourceImageTaskId).filter((value): value is string => Boolean(value)));
    const nodesToAppend: CanvasNodeData[] = [];
    for (const item of validItems) {
        if (existingSourceIds.has(item.sourceId)) continue;
        const image = await resolveCanvasImageSource(item);
        nodesToAppend.push(createImageNode(item, image, project.nodes.length + nodesToAppend.length));
        existingSourceIds.add(item.sourceId);
    }
    if (!nodesToAppend.length) return 0;

    const latestProject = useCanvasStore.getState().projects.find((item) => item.id === projectId) || project;
    useCanvasStore.getState().updateProject(projectId, {
        nodes: [...latestProject.nodes, ...nodesToAppend],
        connections: latestProject.connections,
    });
    return nodesToAppend.length;
}

async function resolveCanvasImageSource(item: AppendGeneratedImageInput): Promise<CanvasImageSource> {
    try {
        return await uploadImage(item.dataUrl || item.url || "");
    } catch (error) {
        if (!item.url) throw error;
        console.warn("Canvas image local cache failed, using backend image url", error);
        const meta = await readImageMeta(item.url);
        return {
            url: item.url,
            width: meta.width,
            height: meta.height,
            bytes: 0,
            mimeType: meta.mimeType || "image/png",
        };
    }
}

function createImageNode(item: AppendGeneratedImageInput, uploaded: CanvasImageSource, index: number): CanvasNodeData {
    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = imageNodeSize(uploaded.width, uploaded.height, spec.width);
    const column = index % COLUMN_COUNT;
    const row = Math.floor(index / COLUMN_COUNT);
    const centerX = column * (spec.width + GAP_X) + spec.width / 2;
    const centerY = row * (spec.height + GAP_Y) + spec.height / 2;

    return {
        id: nanoid(),
        type: CanvasNodeType.Image,
        title: item.title || item.prompt?.slice(0, 32) || "Generated Image",
        position: { x: centerX - size.width / 2, y: centerY - size.height / 2 },
        width: size.width,
        height: size.height,
        metadata: {
            ...imageMetadata(uploaded),
            content: item.url || uploaded.url,
            backendUrl: item.url,
            backendRel: item.backendRel || extractBackendImageRel(item.url || ""),
            prompt: item.prompt,
            model: item.model,
            size: item.size,
            sourceImageTaskId: item.sourceId,
            source: "image-page",
        },
    };
}

function imageMetadata(image: CanvasImageSource): CanvasNodeMetadata {
    return {
        content: image.url,
        storageKey: image.storageKey,
        status: "success",
        naturalWidth: image.width,
        naturalHeight: image.height,
        bytes: image.bytes,
        mimeType: image.mimeType,
    };
}

function extractBackendImageRel(url: string) {
    const marker = "/images/";
    const index = url.indexOf(marker);
    if (index < 0) return undefined;
    return decodeURIComponent(url.slice(index + marker.length).split("?", 1)[0].split("#", 1)[0]).replace(/^\/+/, "") || undefined;
}

function imageNodeSize(width: number, height: number, targetWidth: number) {
    if (!width || !height) return { width: targetWidth, height: Math.round(targetWidth * (NODE_DEFAULT_SIZE[CanvasNodeType.Image].height / NODE_DEFAULT_SIZE[CanvasNodeType.Image].width)) };
    const nextWidth = Math.max(120, targetWidth);
    return { width: nextWidth, height: Math.max(90, Math.round(nextWidth * (height / width))) };
}
