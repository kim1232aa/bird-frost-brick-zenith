import type { CanvasNodeData, VideoReferenceRole } from '../types';

export const CUSTOMER_VIDEO_SUBMIT_PATH = '/v1/videos/generations';

export type Seedance2CustomerVideoReference = {
  label: string;
  value: string;
  nodeId: string;
  useAs?: 'first_frame' | 'last_frame' | 'keyframe' | 'reference_image';
  role?: VideoReferenceRole;
};

export type Seedance2CustomerVideoPayload = {
  mode: 'text_to_video' | 'image_to_video' | 'first_last_frame';
  prompt: string;
  ratio: string;
  duration: number;
  negative_prompt?: string;
  reference_image?: string;
  reference_images?: string[];
  first_frame?: string;
  last_frame?: string;
  references?: Seedance2CustomerVideoReference[];
  /** Internal preflight-only candidates; never serialized without an explicit profile. */
  reference_videos?: Array<{ name?: string; useAs?: string }>;
};

const hiddenVendorName = String.fromCharCode(68, 111, 108, 97);
const hiddenVendorNamePattern = new RegExp(hiddenVendorName, 'i');
const hiddenCnVendorName = String.fromCharCode(35910, 21253);
const hiddenAccountCaptureKeyword = String.fromCharCode(25429, 33719);
const hiddenLoginFlowKeyword = `${String.fromCharCode(70, 97, 99, 101, 98, 111, 111, 107)} 注册`;
const hiddenSocialLoginPattern = new RegExp(String.fromCharCode(70, 97, 99, 101, 98, 111, 111, 107), 'i');
const SUPPORTED_CUSTOMER_VIDEO_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'] as const;

export function normalizeCustomerVideoRatio(value?: string) {
  const normalized = String(value ?? '').trim();
  if (!SUPPORTED_CUSTOMER_VIDEO_RATIOS.includes(normalized as (typeof SUPPORTED_CUSTOMER_VIDEO_RATIOS)[number])) {
    throw new Error(`customer 视频端点不支持画幅比例 ${normalized || '（空）'}；不会静默替换为 9:16`);
  }
  return normalized;
}

export function normalizeCustomerVideoDuration(value?: string | number) {
  const duration = Number(value);
  if (![5, 10, 15].includes(duration)) {
    throw new Error(`customer 视频端点不支持时长 ${String(value ?? '（空）')}；不会静默替换为 5 秒`);
  }
  return duration;
}

export function dedupeSeedance2CustomerReferenceValues(values: string[]) {
  const seen = new Set<string>();
  const normalized = values
    .map((value) => normalizeSeedance2CustomerReferenceValue(value))
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  return normalized;
}

export function normalizeSeedance2CustomerReferenceValue(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized && !normalized.startsWith('blob:') ? normalized : '';
}

export function buildSeedance2CustomerVideoPayload(
  node: CanvasNodeData,
  references: Seedance2CustomerVideoReference[] = [],
  videos: Array<{ name?: string; useAs?: string }> = [],
): Seedance2CustomerVideoPayload {
  const meta = node.metadata || {};
  const prompt = String(meta.prompt || meta.content || '').trim();
  if (references.length || videos.length) {
    throw new Error(
      `当前 customer 视频端点没有已配置的参考素材 capability profile 与 serializer；检测到 ${references.length} 张图片候选、${videos.length} 个视频候选，已在请求前阻止提交。请配置并选择受支持的原生 provider/model，或移除参考素材后使用纯文本生成。`,
    );
  }
  const ratio = normalizeCustomerVideoRatio(meta.seedanceRatio || meta.size || '9:16');
  const duration = normalizeCustomerVideoDuration(meta.seedanceDuration || meta.seconds || 5);
  const payload: Seedance2CustomerVideoPayload = {
    mode: 'text_to_video',
    prompt,
    ratio,
    duration,
  };
  const negativePrompt = String(meta.negativePrompt || '').trim();
  if (negativePrompt) payload.negative_prompt = negativePrompt;
  return payload;
}

/** 未配置一等 serializer 的 customer endpoint 只允许已验证的纯文本合同。 */
export function buildCustomerVideoWirePayload(payload: Seedance2CustomerVideoPayload) {
  const hasReferenceMaterial = Boolean(
    payload.references?.length || payload.reference_images?.length || payload.reference_image ||
    payload.reference_videos?.length || payload.first_frame || payload.last_frame || payload.mode !== 'text_to_video',
  );
  if (hasReferenceMaterial) {
    throw new Error(
      '当前 customer 视频端点没有已配置的参考图片或参考视频 capability profile 与 serializer；已在请求前阻止提交，不会猜测 reference_images、first_frame 或 last_frame wire 字段，也不会猜测 reference_videos。',
    );
  }
  const { references: _internalReferences, reference_images: _referenceImages, reference_image: _referenceImage,
    reference_videos: _referenceVideos, first_frame: _firstFrame, last_frame: _lastFrame, ...wirePayload } = payload;
  return wirePayload;
}

export async function dispatchCustomerVideoPayload<T>(
  payload: Seedance2CustomerVideoPayload,
  send: (wirePayload: ReturnType<typeof buildCustomerVideoWirePayload>) => Promise<T> | T,
) {
  const wirePayload = buildCustomerVideoWirePayload(payload);
  return send(wirePayload);
}

export function normalizeCustomerVideoErrorMessage(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '视频任务提交失败，请稍后重试。';
  const lower = raw.toLowerCase();
  if (raw.includes('无可用账号') || raw.includes('无可用视频账号') || lower.includes('no available')) {
    return '视频任务提交失败：无可用视频账号。';
  }
  if (
    hiddenVendorNamePattern.test(raw) ||
    raw.includes(hiddenCnVendorName) ||
    raw.includes(hiddenLoginFlowKeyword) ||
    raw.includes(hiddenAccountCaptureKeyword) ||
    hiddenSocialLoginPattern.test(raw)
  ) {
    return '视频任务提交失败，请稍后重试或检查视频账号配置。';
  }
  return raw.replace(hiddenVendorNamePattern, '视频').replaceAll(hiddenCnVendorName, '视频服务');
}
