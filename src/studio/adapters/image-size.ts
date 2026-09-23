/**
 * HF Inference Router 只接受 "宽x高" 像素尺寸（例如 1344x768），
 * 直接透传 "2K"/"16:9" 会被上游 400 拒绝。把档位/比例换算成像素。
 *
 * 该模块刻意不依赖 stores / 网络层，供 adapters 与契约层共用，
 * 避免契约模块因复用尺寸换算而拉入整套 relay 配置依赖。
 */
const HF_ASPECT_BASE: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 864],
  "3:4": [864, 1152],
  "3:2": [1216, 832],
  "2:3": [832, 1216],
  "21:9": [1536, 640],
};
const HF_TIER_LONG_SIDE: Record<string, number> = { "1k": 1024, "2k": 2048, "3k": 2560, "4k": 4096 };

function roundTo8(value: number) {
  return Math.max(8, Math.round(value / 8) * 8);
}

export function huggingfaceImageSize(size?: string, aspectRatio?: string): string | undefined {
  const raw = String(size || "").trim();
  if (/^\d{2,5}x\d{2,5}$/i.test(raw)) return raw;
  const tier = HF_TIER_LONG_SIDE[raw.toLowerCase()];
  const ratioText = String(aspectRatio || "").trim();
  const ratioMatch = /^(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)$/.exec(ratioText);
  const base = HF_ASPECT_BASE[ratioText];
  if (tier) {
    if (base) {
      const longSide = Math.max(base[0], base[1]);
      const scale = tier / longSide;
      return `${roundTo8(base[0] * scale)}x${roundTo8(base[1] * scale)}`;
    }
    if (ratioMatch) {
      const w = Number(ratioMatch[1]);
      const h = Number(ratioMatch[2]);
      if (w > 0 && h > 0) {
        const scale = tier / Math.max(w, h);
        return `${roundTo8(w * scale)}x${roundTo8(h * scale)}`;
      }
    }
    if (ratioText) {
      throw new Error(`Hugging Face 不支持未知的宽高比 "${ratioText}"，禁止静默回退为正方形。`);
    }
    return `${tier}x${tier}`;
  }
  if (base) return `${base[0]}x${base[1]}`;
  if (ratioMatch) {
    const w = Number(ratioMatch[1]);
    const h = Number(ratioMatch[2]);
    if (w > 0 && h > 0) {
      const scale = 1024 / Math.max(w, h);
      return `${roundTo8(w * scale)}x${roundTo8(h * scale)}`;
    }
  }
  if (ratioText) {
    throw new Error(`Hugging Face 不支持未知的宽高比 "${ratioText}"，禁止静默处理。`);
  }
  return undefined;
}
