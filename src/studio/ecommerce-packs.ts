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

export const ECOMMERCE_SCENES = [
  { id: "solid", label: "纯色背景", prompt: "seamless solid studio backdrop, catalog lighting, no props" },
  { id: "indoor", label: "室内场景", prompt: "bright modern interior lifestyle, natural window light, conversion-oriented" },
  { id: "outdoor", label: "户外场景", prompt: "natural outdoor daylight lifestyle, shallow depth, product readable" },
] as const;

const PLATFORM_DIRECTION: Record<string, string> = {
  amazon:
    "Amazon direction: when the assigned shot is the front hero, the entire image from edge to edge must be pure white RGB(255,255,255), show only the product for sale, contain no props or added graphics, and place the complete product at about 85% of the frame. Secondary shots may use clean neutral studio or restrained lifestyle settings as assigned.",
  tmall:
    "Tmall direction: create a strong square mobile-first product visual with premium lighting and useful negative space, but do not render promotional copy, prices, claims, badges, or invented specifications.",
  temu:
    "Temu / Shopee direction: create a bold, compact, mobile-first square product composition that reads instantly at thumbnail size. Emphasize the real product, visible function, material detail, realistic scale, and included components without prices, discount graphics, badges, promotional copy, or invented claims.",
  tiktok:
    "TikTok Shop direction: the front hero must show the complete product objectively on a pure white background. Secondary images should feel authentic and social-native, showing believable use, handling, scale, texture, and benefits through the scene itself. Do not add creator likenesses, UI, captions, prices, badges, or unverifiable claims.",
  walmart:
    "Walmart direction: the front hero must be a centered square image on a seamless pure white RGB(255,255,255) background, professionally lit, tightly but safely cropped, and free of text, logos added by the generator, watermarks, borders, or unrelated props. Secondary shots may show alternate views, true details, scale, or an appropriate lifestyle setting.",
  ozon:
    "Ozon direction: create a clean square marketplace image that identifies the product immediately at thumbnail size. Keep the front hero complete, centered, and objectively presented on a simple light neutral background. Secondary shots should communicate real construction, visible function, detail, believable scale, and lifestyle context through the photography itself. Do not add marketplace copy, prices, discount graphics, badges, UI, specifications, or unverifiable claims.",
};

function identityLock(productBrief: string) {
  return [
    "The uploaded reference image(s) are the authoritative identity of ONE exact product/SKU. Extract the product itself from the references and ignore the source page layout, collage structure, dividers, backgrounds, props, neighboring products, captions, and graphic design.",
    "IDENTITY LOCK: Preserve the same exact silhouette, geometry, proportions, materials, finish, colors, transparency, seams, closures, buttons, ports, logo placement, label layout, typography, packaging, and every visible distinguishing feature. Never redesign, simplify, recolor, mirror, stretch, add, remove, or relocate product features.",
    "VISIBLE TEXT: Keep branding and legible product text faithful to the references. If small text cannot be reproduced reliably, preserve its placement and visual hierarchy without inventing new claims, measurements, certifications, or promotional copy.",
    "UNSEEN SURFACES: Extend only the known construction conservatively. Do not invent prominent features, and keep every inferred detail physically plausible.",
    productBrief.trim()
      ? `User product/category direction (apply only when it does not conflict with the reference identity): ${productBrief.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function composeEcommercePrompt(product: string, shot: EcommerceShot, sceneId = "solid", packId = "amazon") {
  const scene = ECOMMERCE_SCENES.find((item) => item.id === sceneId) || ECOMMERCE_SCENES[0];
  const platform =
    PLATFORM_DIRECTION[packId] ||
    "Catalog direction: prioritize faithful product documentation, clear camera geometry, and a premium commercial finish.";
  return [
    `Create ONE standalone, full-resolution e-commerce product image for the assigned shot "${shot.label}".`,
    identityLock(product),
    platform,
    "SINGLE-IMAGE COMPOSITION: Output exactly one continuous photograph filling the entire canvas. Never create a contact sheet, collage, split screen, comparison layout, inset, sidebar, border, gutter, frame, caption, label, number, watermark, or UI. Do not copy the composition or panel layout of the reference image; use only the product identity from it.",
    "SET CONSISTENCY: This image belongs to one coordinated product shoot. Use neutral commercial color science, realistic materials, consistent product scale, premium lens quality, soft controlled shadows, and clean retouching so it matches the other independently generated shots.",
    `Scene: ${scene.prompt}.`,
    `ASSIGNED SHOT: ${shot.prompt}`,
  ].join("\n");
}
