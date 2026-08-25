"use client";

import localforage from "localforage";

import type { ImageModel } from "@/lib/api";
import { hasUsableStoredImageSource } from "@/lib/image-utils";
import { createDesktopObjectStorage } from "@/services/desktop-storage";
import { getCachedAuthStorageScope, normalizeStorageScope, scopedStorageKey } from "@/lib/user-storage-scope";

export type ImageConversationMode = "generate" | "edit";
export type ImageQuality = "low" | "medium" | "high";

export type ReferenceImageUsage = "general" | "person" | "style" | "pose" | "composition" | "product";

export type ReferenceStrengths = {
  person: number;
  style: number;
  pose: number;
  composition: number;
  product: number;
};

export type StoredReferenceImage = {
  name: string;
  type: string;
  dataUrl: string;
  usage?: ReferenceImageUsage;
};

export type StoredImage = {
  id: string;
  taskId?: string;
  status?: "loading" | "success" | "error";
  b64_json?: string;
  url?: string;
  width?: number;
  height?: number;
  revised_prompt?: string;
  error?: string;
};

export type ImageTurnStatus = "queued" | "generating" | "success" | "error";

// 回复上一轮 AI 反问/拒绝时携带的上下文。
// 只用于在调用图片接口时拼接成模型可见的 prompt，不直接展示给用户。
// turn.prompt 永远只存用户本人输入的原文。
export type ImageReplyContext = {
  sourceTurnId: string;
  sourcePrompt: string;
  aiMessage: string;
};

export type ImageTurn = {
  id: string;
  prompt: string;
  model: ImageModel;
  mode: ImageConversationMode;
  referenceImages: StoredReferenceImage[];
  referenceStrengths?: ReferenceStrengths;
  count: number;
  size: string;
  outputSize?: string;
  quality?: ImageQuality;
  images: StoredImage[];
  createdAt: string;
  status: ImageTurnStatus;
  error?: string;
  promptDeleted?: boolean;
  resultsDeleted?: boolean;
  replyContext?: ImageReplyContext;
};

export type ImageConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ImageTurn[];
};

export type ImageConversationStats = {
  queued: number;
  running: number;
};

const legacyImageConversationStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "image_conversations",
});
const imageConversationStorage = createDesktopObjectStorage("chatgpt2api/image_conversations", legacyImageConversationStorage);

const IMAGE_CONVERSATIONS_KEY = "items";
const DRAFT_REFERENCE_IMAGES_KEY = "draft_reference_images";
let imageConversationWriteQueue: Promise<void> = Promise.resolve();
let imageConversationStorageScope = getCachedAuthStorageScope();

export const DEFAULT_REFERENCE_STRENGTHS: ReferenceStrengths = {
  person: 82,
  style: 62,
  pose: 62,
  composition: 58,
  product: 88,
};

export function setImageConversationStorageScope(scopeId?: string | null) {
  imageConversationStorageScope = normalizeStorageScope(scopeId);
}

function imageConversationScopedKey(key: string) {
  return scopedStorageKey(key, imageConversationStorageScope);
}

function normalizeStoredImage(image: StoredImage): StoredImage {
  const normalized = {
    ...image,
    taskId: typeof image.taskId === "string" && image.taskId ? image.taskId : undefined,
    b64_json: typeof image.b64_json === "string" && image.b64_json ? image.b64_json : undefined,
    url: typeof image.url === "string" && image.url ? image.url : undefined,
    width: Number.isFinite(Number(image.width)) && Number(image.width) > 0 ? Number(image.width) : undefined,
    height: Number.isFinite(Number(image.height)) && Number(image.height) > 0 ? Number(image.height) : undefined,
    revised_prompt: typeof image.revised_prompt === "string" ? image.revised_prompt : undefined,
  };
  if (image.status === "success" && !hasUsableStoredImageSource(normalized)) {
    return {
      ...normalized,
      status: "error",
      b64_json: undefined,
      url: undefined,
      error: image.error || "图片结果不可用",
    };
  }
  if (image.status === "loading" || image.status === "error" || image.status === "success") {
    return normalized;
  }
  return {
    ...normalized,
    status: hasUsableStoredImageSource(normalized) ? "success" : "loading",
  };
}

function normalizeReferenceImage(image: StoredReferenceImage): StoredReferenceImage {
  return {
    name: image.name || "reference.png",
    type: image.type || "image/png",
    dataUrl: image.dataUrl,
    usage: normalizeReferenceImageUsage(image.usage),
  };
}

function normalizeReferenceImageUsage(value: unknown): ReferenceImageUsage {
  return value === "person" ||
    value === "style" ||
    value === "pose" ||
    value === "composition" ||
    value === "product"
    ? value
    : "general";
}

function normalizeReferenceStrength(value: unknown, fallback: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, parsed));
}

export function normalizeReferenceStrengths(value: unknown): ReferenceStrengths {
  const source = value && typeof value === "object" ? value as Partial<ReferenceStrengths> : {};
  return {
    person: normalizeReferenceStrength(source.person, DEFAULT_REFERENCE_STRENGTHS.person),
    style: normalizeReferenceStrength(source.style, DEFAULT_REFERENCE_STRENGTHS.style),
    pose: normalizeReferenceStrength(source.pose, DEFAULT_REFERENCE_STRENGTHS.pose),
    composition: normalizeReferenceStrength(source.composition, DEFAULT_REFERENCE_STRENGTHS.composition),
    product: normalizeReferenceStrength(source.product, DEFAULT_REFERENCE_STRENGTHS.product),
  };
}

function dataUrlMimeType(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,/);
  return match?.[1] || "image/png";
}

function getLegacyReferenceImages(source: Record<string, unknown>): StoredReferenceImage[] {
  if (Array.isArray(source.referenceImages)) {
    return source.referenceImages
      .filter((image): image is StoredReferenceImage => {
        if (!image || typeof image !== "object") {
          return false;
        }
        const candidate = image as StoredReferenceImage;
        return typeof candidate.dataUrl === "string" && candidate.dataUrl.length > 0;
      })
      .map(normalizeReferenceImage);
  }

  if (source.sourceImage && typeof source.sourceImage === "object") {
    const image = source.sourceImage as { dataUrl?: unknown; fileName?: unknown };
    if (typeof image.dataUrl === "string" && image.dataUrl) {
      return [
        {
          name: typeof image.fileName === "string" && image.fileName ? image.fileName : "reference.png",
          type: dataUrlMimeType(image.dataUrl),
          dataUrl: image.dataUrl,
        },
      ];
    }
  }

  return [];
}

function normalizeReplyContext(value: unknown): ImageReplyContext | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const ctx = value as Partial<ImageReplyContext>;
  if (typeof ctx.sourceTurnId !== "string" || !ctx.sourceTurnId) {
    return undefined;
  }
  return {
    sourceTurnId: ctx.sourceTurnId,
    sourcePrompt: typeof ctx.sourcePrompt === "string" ? ctx.sourcePrompt : "",
    aiMessage: typeof ctx.aiMessage === "string" ? ctx.aiMessage : "",
  };
}

export function normalizeImageQuality(value: unknown): ImageQuality {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeTurn(turn: ImageTurn & Record<string, unknown>): ImageTurn {
  const normalizedImages = Array.isArray(turn.images) ? turn.images.map(normalizeStoredImage) : [];
  const derivedStatus: ImageTurnStatus =
    normalizedImages.some((image) => image.status === "loading")
      ? "generating"
      : normalizedImages.some((image) => image.status === "error")
        ? "error"
        : "success";

  return {
    id: String(turn.id || `${Date.now()}`),
    prompt: String(turn.prompt || ""),
    model: (turn.model as ImageModel) || "gpt-image-2",
    mode: turn.mode === "edit" ? "edit" : "generate",
    referenceImages: getLegacyReferenceImages(turn),
    referenceStrengths: normalizeReferenceStrengths(turn.referenceStrengths),
    count: Math.max(1, Number(turn.count || normalizedImages.length || 1)),
    size: typeof turn.size === "string" ? turn.size : "",
    outputSize: typeof turn.outputSize === "string" ? turn.outputSize : "",
    quality: normalizeImageQuality(turn.quality),
    images: normalizedImages,
    createdAt: String(turn.createdAt || new Date().toISOString()),
    status:
      turn.status === "queued" ||
      turn.status === "generating" ||
      turn.status === "success" ||
      turn.status === "error"
        ? turn.status
        : derivedStatus,
    error: typeof turn.error === "string" ? turn.error : undefined,
    promptDeleted: turn.promptDeleted === true,
    resultsDeleted: turn.resultsDeleted === true,
    replyContext: normalizeReplyContext(turn.replyContext),
  };
}

function normalizeConversation(conversation: ImageConversation & Record<string, unknown>): ImageConversation {
  const turns = Array.isArray(conversation.turns)
    ? conversation.turns.map((turn) => normalizeTurn(turn as ImageTurn & Record<string, unknown>))
    : [
        normalizeTurn({
          id: String(conversation.id || `${Date.now()}`),
          prompt: String(conversation.prompt || ""),
          model: (conversation.model as ImageModel) || "gpt-image-2",
          mode: conversation.mode === "edit" ? "edit" : "generate",
          referenceImages: getLegacyReferenceImages(conversation),
          referenceStrengths: normalizeReferenceStrengths(conversation.referenceStrengths),
          count: Number(conversation.count || 1),
          size: typeof conversation.size === "string" ? conversation.size : "",
          outputSize: typeof conversation.outputSize === "string" ? conversation.outputSize : "",
          quality: normalizeImageQuality(conversation.quality),
          images: Array.isArray(conversation.images) ? (conversation.images as StoredImage[]) : [],
          createdAt: String(conversation.createdAt || new Date().toISOString()),
          status:
            conversation.status === "generating" || conversation.status === "success" || conversation.status === "error"
              ? conversation.status
              : "success",
          error: typeof conversation.error === "string" ? conversation.error : undefined,
        }),
      ];
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return {
    id: String(conversation.id || `${Date.now()}`),
    title: String(conversation.title || ""),
    createdAt: String(conversation.createdAt || lastTurn?.createdAt || new Date().toISOString()),
    updatedAt: String(conversation.updatedAt || lastTurn?.createdAt || new Date().toISOString()),
    turns,
  };
}

function sortImageConversations(conversations: ImageConversation[]): ImageConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function pickLatestConversation(current: ImageConversation, next: ImageConversation) {
  return getTimestamp(next.updatedAt) >= getTimestamp(current.updatedAt) ? next : current;
}

function queueImageConversationWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = imageConversationWriteQueue.then(operation);
  imageConversationWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readStoredImageConversations(): Promise<ImageConversation[]> {
  const items =
    (await imageConversationStorage.getItem<Array<ImageConversation & Record<string, unknown>>>(
      imageConversationScopedKey(IMAGE_CONVERSATIONS_KEY),
    )) || [];
  return items.map(normalizeConversation);
}

export async function listImageConversations(): Promise<ImageConversation[]> {
  return sortImageConversations(await readStoredImageConversations());
}

export async function saveImageConversations(conversations: ImageConversation[]): Promise<void> {
  await queueImageConversationWrite(async () => {
    const items = await readStoredImageConversations();
    const conversationMap = new Map(items.map((item) => [item.id, item]));
    for (const conversation of conversations.map(normalizeConversation)) {
      const current = conversationMap.get(conversation.id);
      conversationMap.set(conversation.id, current ? pickLatestConversation(current, conversation) : conversation);
    }
    await imageConversationStorage.setItem(
      imageConversationScopedKey(IMAGE_CONVERSATIONS_KEY),
      sortImageConversations([...conversationMap.values()]),
    );
  });
}

export async function saveImageConversation(conversation: ImageConversation): Promise<void> {
  await queueImageConversationWrite(async () => {
    const items = await readStoredImageConversations();
    const nextConversation = normalizeConversation(conversation);
    const current = items.find((item) => item.id === nextConversation.id);
    const persistedConversation = current ? pickLatestConversation(current, nextConversation) : nextConversation;
    const nextItems = sortImageConversations([
      persistedConversation,
      ...items.filter((item) => item.id !== persistedConversation.id),
    ]);
    await imageConversationStorage.setItem(imageConversationScopedKey(IMAGE_CONVERSATIONS_KEY), nextItems);
  });
}

export async function renameImageConversation(id: string, title: string): Promise<void> {
  await queueImageConversationWrite(async () => {
    const items = await readStoredImageConversations();
    const target = items.find((item) => item.id === id);
    if (!target) return;
    const updated = { ...target, title, updatedAt: new Date().toISOString() };
    const nextItems = sortImageConversations([
      updated,
      ...items.filter((item) => item.id !== id),
    ]);
    await imageConversationStorage.setItem(imageConversationScopedKey(IMAGE_CONVERSATIONS_KEY), nextItems);
  });
}

export async function deleteImageConversation(id: string): Promise<void> {
  await queueImageConversationWrite(async () => {
    const items = await readStoredImageConversations();
    await imageConversationStorage.setItem(
      imageConversationScopedKey(IMAGE_CONVERSATIONS_KEY),
      items.filter((item) => item.id !== id),
    );
  });
}

export async function clearImageConversations(): Promise<void> {
  await queueImageConversationWrite(async () => {
    await imageConversationStorage.removeItem(imageConversationScopedKey(IMAGE_CONVERSATIONS_KEY));
  });
}

export async function getDraftReferenceImages(): Promise<StoredReferenceImage[]> {
  const items = await imageConversationStorage.getItem<StoredReferenceImage[]>(
    imageConversationScopedKey(DRAFT_REFERENCE_IMAGES_KEY),
  );
  return Array.isArray(items)
    ? items
        .filter((image) => image && typeof image.dataUrl === "string" && image.dataUrl.length > 0)
        .map(normalizeReferenceImage)
    : [];
}

export async function saveDraftReferenceImages(images: StoredReferenceImage[]): Promise<void> {
  const normalized = images
    .filter((image) => image && typeof image.dataUrl === "string" && image.dataUrl.length > 0)
    .map(normalizeReferenceImage);

  if (normalized.length === 0) {
    await imageConversationStorage.removeItem(imageConversationScopedKey(DRAFT_REFERENCE_IMAGES_KEY));
    return;
  }

  await imageConversationStorage.setItem(imageConversationScopedKey(DRAFT_REFERENCE_IMAGES_KEY), normalized);
}

export async function clearDraftReferenceImages(): Promise<void> {
  await imageConversationStorage.removeItem(imageConversationScopedKey(DRAFT_REFERENCE_IMAGES_KEY));
}

export function getImageConversationStats(conversation: ImageConversation | null): ImageConversationStats {
  if (!conversation) {
    return { queued: 0, running: 0 };
  }

  return conversation.turns.reduce(
    (acc, turn) => {
      if (turn.resultsDeleted) {
        return acc;
      }
      if (turn.status === "queued") {
        acc.queued += 1;
      } else if (turn.status === "generating") {
        acc.running += 1;
      }
      return acc;
    },
    { queued: 0, running: 0 },
  );
}
