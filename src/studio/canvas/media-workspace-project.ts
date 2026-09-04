/** Pure canvas-project builder for studio → workspace drops. No store, no aliases. */

export type MediaCanvasKind = "image" | "video" | "upload" | "prompt";

export type MediaCanvasPayload = {
  id?: string;
  kind: MediaCanvasKind;
  url?: string;
  urls?: string[];
  prompt?: string;
  model?: string;
  text?: string;
  title?: string;
};

export type CanvasWorkspaceMediaSearch = {
  id: string;
  kind?: MediaCanvasKind;
  src?: string;
  prompt?: string;
  title?: string;
  model?: string;
};

const DURABLE_CANVAS_MEDIA = /^\/(?:works|gallery)\//;

export function isDurableCanvasMediaUrl(value?: string) {
  const url = String(value || "").trim();
  return DURABLE_CANVAS_MEDIA.test(url);
}

export function canvasWorkspaceSearchFromMedia(id: string, payload: MediaCanvasPayload): CanvasWorkspaceMediaSearch {
  const search: CanvasWorkspaceMediaSearch = { id };
  const src = uniqueUrls(payload).find(isDurableCanvasMediaUrl);
  if (!src) return search;
  search.kind = payload.kind;
  search.src = src;
  const prompt = (payload.prompt || payload.text || "").trim();
  if (prompt) search.prompt = prompt.slice(0, 200);
  const title = (payload.title || "").trim();
  if (title) search.title = title.slice(0, 80);
  const model = (payload.model || "").trim();
  if (model) search.model = model;
  return search;
}

export function mediaPayloadFromWorkspaceSearch(search: CanvasWorkspaceMediaSearch | undefined | null): MediaCanvasPayload | null {
  const src = String(search?.src || "").trim();
  if (!search?.id || !isDurableCanvasMediaUrl(src)) return null;
  const kind: MediaCanvasKind =
    search.kind === "video" || search.kind === "image" || search.kind === "upload" || search.kind === "prompt"
      ? search.kind
      : src.endsWith(".mp4")
        ? "video"
        : "image";
  return {
    kind,
    url: src,
    prompt: search.prompt,
    title: search.title,
    model: search.model,
    text: search.prompt,
  };
}

const IMAGE_SIZE = { width: 340, height: 240 };
const VIDEO_SIZE = { width: 420, height: 236 };
const TEXT_SIZE = { width: 340, height: 240 };

function mediaId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export type MediaCanvasNode = {
  id: string;
  type: "image" | "video" | "text";
  title: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  metadata: {
    content?: string;
    backendUrl?: string;
    prompt?: string;
    model?: string;
    modelProviderId?: string;
    status: "success";
    fontSize?: number;
  };
};

/** Studio catalog keys are `providerId::model`; canvas nodes store those fields separately. */
export function canvasModelFromSelection(selection?: string) {
  const value = (selection || "").trim();
  if (!value) return {};
  const separator = value.indexOf("::");
  if (separator <= 0) return { model: value };
  const modelProviderId = value.slice(0, separator).trim();
  const model = value.slice(separator + 2).trim();
  if (!modelProviderId || !model) return { model: value };
  return { model, modelProviderId };
}

function uniqueUrls(payload: MediaCanvasPayload) {
  const collected: string[] = [];
  const seen = new Set<string>();
  for (const value of [payload.url || "", ...(payload.urls || [])]) {
    const url = value.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    collected.push(url);
  }
  return collected;
}

function caption(payload: MediaCanvasPayload) {
  return (payload.title || payload.prompt || payload.text || "").trim();
}

function compactCanvasTitle(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const boundarySafe = normalized.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
  return `${boundarySafe || normalized.slice(0, maxLength)}…`;
}

function imageNode(input: { title: string; url: string; prompt?: string; model?: string; x: number; y: number }): MediaCanvasNode {
  const modelFields = canvasModelFromSelection(input.model);
  return {
    id: mediaId("image"),
    type: "image" as const,
    title: input.title,
    position: { x: input.x, y: input.y },
    width: IMAGE_SIZE.width,
    height: IMAGE_SIZE.height,
    metadata: {
      content: input.url,
      backendUrl: input.url,
      prompt: input.prompt,
      ...modelFields,
      status: "success" as const,
    },
  };
}

function videoNode(input: { title: string; url: string; prompt?: string; model?: string; x: number; y: number }): MediaCanvasNode {
  const modelFields = canvasModelFromSelection(input.model);
  return {
    id: mediaId("video"),
    type: "video" as const,
    title: input.title,
    position: { x: input.x, y: input.y },
    width: VIDEO_SIZE.width,
    height: VIDEO_SIZE.height,
    metadata: {
      content: input.url,
      backendUrl: input.url,
      prompt: input.prompt,
      ...modelFields,
      status: "success" as const,
    },
  };
}

function textNode(input: { title: string; text: string; prompt?: string; model?: string; x: number; y: number }): MediaCanvasNode {
  const modelFields = canvasModelFromSelection(input.model);
  return {
    id: mediaId("text"),
    type: "text" as const,
    title: input.title,
    position: { x: input.x, y: input.y },
    width: TEXT_SIZE.width,
    height: TEXT_SIZE.height,
    metadata: {
      content: input.text,
      prompt: input.prompt || input.text,
      ...modelFields,
      status: "success" as const,
      fontSize: 14,
    },
  };
}

export function mediaCanvasProjectTitle(payload: MediaCanvasPayload) {
  const hint = compactCanvasTitle(caption(payload), 24);
  if (payload.kind === "video") return `视频 ${hint || "导入"}`;
  if (payload.kind === "prompt") return `提示 ${hint || "导入"}`;
  if (payload.kind === "upload") return `上传 ${hint || "导入"}`;
  return `图片 ${hint || "导入"}`;
}

export function buildMediaCanvasProject(payload: MediaCanvasPayload) {
  const urls = uniqueUrls(payload);
  const prompt = (payload.prompt || payload.text || "").trim();
  const titleHint = caption(payload);
  const nodes: MediaCanvasNode[] = [];

  if (payload.kind === "video") {
    const url = urls[0];
    if (url) {
      nodes.push(
        videoNode({
          title: titleHint.slice(0, 32) || "视频",
          url,
          prompt: prompt || undefined,
          model: payload.model,
          x: 80,
          y: 40,
        }),
      );
    }
  } else if (payload.kind === "prompt") {
    nodes.push(
      textNode({
        title: titleHint.slice(0, 32) || "提示词",
        text: prompt || titleHint,
        prompt: prompt || undefined,
        model: payload.model,
        x: 80,
        y: 40,
      }),
    );
  } else {
    const fallbackTitle = payload.kind === "upload" ? "上传" : "图片";
    urls.forEach((url, index) => {
      nodes.push(
        imageNode({
          title: titleHint.slice(0, 32) || fallbackTitle,
          url,
          prompt: prompt || undefined,
          model: payload.model,
          x: 80 + (index % 4) * (IMAGE_SIZE.width + 48),
          y: 40 + Math.floor(index / 4) * (IMAGE_SIZE.height + 48),
        }),
      );
    });
  }

  if (!nodes.length) {
    nodes.push(
      textNode({
        title: titleHint.slice(0, 32) || "提示词",
        text: prompt || titleHint,
        prompt: prompt || undefined,
        model: payload.model,
        x: 80,
        y: 40,
      }),
    );
  }

  return {
    title: mediaCanvasProjectTitle(payload),
    nodes,
    viewport: { x: 0, y: 0, k: 0.85 },
  };
}
