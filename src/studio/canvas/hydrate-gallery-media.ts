"use client";

import { setImageBlob } from "@/services/image-storage";
import { setMediaBlob } from "@/services/file-storage";
import type { CanvasNodeData } from "@/app/canvas/types";

const GALLERY_KEY_PREFIX = {
  image: "image:qingliang",
  video: "video:qingliang",
} as const;

function galleryStorageKey(url: string, kind: "image" | "video") {
  const name = url.split("/").pop()?.replace(/\.[^.]+$/, "") || "asset";
  return `${GALLERY_KEY_PREFIX[kind]}-${name}`;
}

function isGalleryPath(value?: string): value is string {
  return Boolean(value && value.startsWith("/gallery/"));
}

async function fetchBlob(url: string) {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`gallery ${url} ${response.status}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`gallery ${url} empty`);
  return blob;
}

export async function hydrateGalleryMedia(nodes: CanvasNodeData[]): Promise<CanvasNodeData[]> {
  if (typeof window === "undefined") return nodes;
  const next = await Promise.all(
    nodes.map(async (node) => {
      const url = node.metadata?.backendUrl || node.metadata?.content;
      if (!isGalleryPath(url)) return node;
      try {
        if (node.type === "image") {
          const storageKey = node.metadata?.storageKey || galleryStorageKey(url, "image");
          const blob = await fetchBlob(url);
          await setImageBlob(storageKey, blob, { retained: true });
          return {
            ...node,
            metadata: {
              ...node.metadata,
              storageKey,
              backendUrl: url,
              backendRel: url.slice(1),
              content: url,
              retained: true,
              status: "success" as const,
            },
          };
        }
        if (node.type === "video") {
          const storageKey = node.metadata?.storageKey || galleryStorageKey(url, "video");
          const blob = await fetchBlob(url);
          await setMediaBlob(storageKey, blob);
          return {
            ...node,
            metadata: {
              ...node.metadata,
              storageKey,
              backendUrl: url,
              backendRel: url.slice(1),
              content: url,
              retained: true,
              status: "success" as const,
            },
          };
        }
      } catch {
        return node;
      }
      return node;
    }),
  );
  return next;
}
