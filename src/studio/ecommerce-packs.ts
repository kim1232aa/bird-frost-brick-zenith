export type EcommerceShot = {
  id: string;
  label: string;
  prompt: string;
};

export type EcommercePack = {
  id: string;
  label: string;
  shots: EcommerceShot[];
};

const SHOTS: Record<string, EcommerceShot> = {
  hero: { id: "hero", label: "正面主图", prompt: "clean white-background catalog photo, camera level, product centered occupying about 85% of frame, no props, no text" },
  threeQuarter: { id: "threeQuarter", label: "3/4 主图", prompt: "premium 3/4 view showing volume and depth, same product, studio lighting, seamless white or very light gray" },
  left: { id: "left", label: "左侧面", prompt: "accurate left profile, keep structure and proportions, studio catalog lighting" },
  back: { id: "back", label: "背面图", prompt: "level rear view of the same product, white background, commercial catalog" },
  detail: { id: "detail", label: "细节特写", prompt: "close-up of the most important material, craft or function detail, sharp, commercial" },
  lifestyle: { id: "lifestyle", label: "使用场景", prompt: "place the same product in a realistic, conversion-oriented usage scene, keep product identity" },
  feature: { id: "feature", label: "功能演示", prompt: "demonstrate the key function of the product clearly, still photoreal, ecommerce" },
  scale: { id: "scale", label: "尺寸感", prompt: "show scale of the product with a subtle real-world cue, keep catalog quality" },
  pack: { id: "pack", label: "包装组合", prompt: "product with packaging, gift-ready ecommerce still life, clean and premium" },
};

export const ECOMMERCE_PACKS: EcommercePack[] = [
  { id: "amazon", label: "Amazon 套图", shots: [SHOTS.hero, SHOTS.threeQuarter, SHOTS.left, SHOTS.back, SHOTS.detail, SHOTS.lifestyle] },
  { id: "tmall", label: "天猫套图", shots: [SHOTS.hero, SHOTS.feature, SHOTS.detail, SHOTS.scale, SHOTS.lifestyle, SHOTS.pack] },
  { id: "temu", label: "Temu / Shopee", shots: [SHOTS.hero, SHOTS.threeQuarter, SHOTS.detail, SHOTS.scale, SHOTS.lifestyle, SHOTS.pack] },
  { id: "tiktok", label: "TikTok Shop", shots: [SHOTS.hero, SHOTS.lifestyle, SHOTS.feature, SHOTS.scale, SHOTS.detail, SHOTS.pack] },
  { id: "walmart", label: "Walmart 套图", shots: [SHOTS.hero, SHOTS.threeQuarter, SHOTS.left, SHOTS.detail, SHOTS.scale, SHOTS.lifestyle] },
  { id: "ozon", label: "Ozon 套图", shots: [SHOTS.hero, SHOTS.threeQuarter, SHOTS.feature, SHOTS.detail, SHOTS.scale, SHOTS.lifestyle] },
  { id: "basic4", label: "基础 4 视图", shots: [SHOTS.hero, SHOTS.threeQuarter, SHOTS.left, SHOTS.back] },
  { id: "full9", label: "完整 9 图", shots: [SHOTS.hero, SHOTS.threeQuarter, SHOTS.left, SHOTS.back, SHOTS.detail, SHOTS.scale, SHOTS.lifestyle, SHOTS.feature, SHOTS.pack] },
];

export function composeEcommercePrompt(product: string, shot: EcommerceShot) {
  const subject = product.trim() || "the uploaded product";
  return `Ecommerce product photography of ${subject}. ${shot.prompt}. Photoreal, no watermark, no extra logos.`;
}
