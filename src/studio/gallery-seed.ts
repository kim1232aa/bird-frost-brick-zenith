import type { StudioHistoryItem } from "./history";

export const GALLERY_SEED: StudioHistoryItem[] = [
  {
    id: "seed-seedream",
    kind: "image",
    title: "火山 Seedream · 陶瓷杯",
    prompt: "studio product photo of a matte ceramic mug",
    model: "doubao-seedream-5.0-lite",
    urls: ["/gallery/seedream-mug.jpg"],
    createdAt: 0,
  },
  {
    id: "seed-civitai",
    kind: "image",
    title: "Civitai Krea 2 Turbo · 人像",
    prompt: "cinematic portrait, rain, neon rim light",
    model: "krea2-turbo",
    urls: ["/gallery/civitai-krea.jpg"],
    createdAt: 0,
  },
  {
    id: "seed-video",
    kind: "video",
    title: "Grok Imagine · 转盘",
    prompt: "a ceramic mug rotating slowly on a white studio turntable",
    model: "grok-imagine-video",
    urls: ["/gallery/grok-video.mp4"],
    createdAt: 0,
  },
];
