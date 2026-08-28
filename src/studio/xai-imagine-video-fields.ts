/**
 * Grok Imagine 视频官方字段。
 * https://docs.x.ai/developers/model-capabilities/video/generation
 * 中转（SuperXihe）走同一组 wire 名：duration / aspect_ratio / resolution / generate_audio。
 */

export const XAI_IMAGINE_VIDEO_DURATION = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const XAI_IMAGINE_VIDEO_RESOLUTION = ["480p", "720p", "1080p"] as const;
export const XAI_IMAGINE_VIDEO_ASPECT = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

export function isGrokImagineVideoModel(model: string | undefined | null) {
  return /grok-imagine-video/i.test(String(model || "").trim());
}

export function isGrokImagineVideo15(model: string | undefined | null) {
  return /grok-imagine-video-1\.5/i.test(String(model || "").trim());
}

export function grokImagineResolutions(model: string | undefined | null) {
  // Official: 1080p only on grok-imagine-video-1.5 for T2V / I2V. R2V caps at 720p.
  return isGrokImagineVideo15(model) ? XAI_IMAGINE_VIDEO_RESOLUTION : (["480p", "720p"] as const);
}
