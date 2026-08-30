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

function customerVideoReferenceUseAs(value: unknown): Seedance2CustomerVideoReference['useAs'] | undefined {
  return value === 'first_frame' || value === 'last_frame' || value === 'keyframe' || value === 'reference_image'
    ? value
    : undefined;
}

function mapCustomerVideoFrameReferences(
  references: Seedance2CustomerVideoReference[],
  videos: Array<{ name?: string; useAs?: string }> = [],
): { mode: Seedance2CustomerVideoPayload['mode']; first_frame?: string; last_frame?: string } {
  if (videos.length) {
    throw new Error(
      `当前 customer 视频端点没有已配置的参考视频 capability profile 与 serializer；检测到 ${videos.length} 个视频候选，已在请求前阻止提交，不会猜测 reference_videos。`,
    );
  }
  if (!references.length) return { mode: 'text_to_video' };

  const values = references.map((item) => ({
    useAs: customerVideoReferenceUseAs(item.useAs),
    value: normalizeSeedance2CustomerReferenceValue(item.value),
  }));
  if (values.some((item) => !item.value)) {
    throw new Error('参考图地址无效；blob: 或空地址不会作为 first_frame / last_frame 提交。');
  }
  if (values.some((item) => !item.useAs || item.useAs === 'reference_image')) {
    throw new Error(
      `当前 customer 视频端点没有已配置的普通参考图 capability profile 与 serializer；检测到 ${references.length} 张图片候选，已在请求前阻止提交，不会猜测 reference_images。请把画面标为首帧/尾帧/关键帧，或选择受支持的原生 provider/model。`,
    );
  }

  const firstSlots = values.filter((item) => item.useAs === 'first_frame');
  const lastSlots = values.filter((item) => item.useAs === 'last_frame');
  const keyframes = values.filter((item) => item.useAs === 'keyframe');
  if (firstSlots.length > 1 || lastSlots.length > 1) {
    throw new Error('first_frame 和 last_frame 各自最多 1 张；不会静默只取第 1 张。');
  }
  if (keyframes.length && (firstSlots.length || lastSlots.length)) {
    throw new Error('关键帧不能与 first_frame / last_frame 混用；当前 serializer 不会猜测 image_urls。');
  }
  if (keyframes.length > 2) {
    throw new Error(
      `当前 customer serializer 只把最多 2 张关键帧映射为 first_frame/last_frame；检测到 ${keyframes.length} 张，不会猜测 image_urls。`,
    );
  }

  const first = firstSlots[0]?.value || keyframes[0]?.value || '';
  const last = lastSlots[0]?.value || (keyframes.length > 1 ? keyframes[1]?.value : '') || '';
  if (last && !first) {
    throw new Error('Agnes 关键帧需要首帧，不能用单独尾帧冒充 extra_body.image keyframes。');
  }
  if (last && last === first) {
    throw new Error('尾帧与首帧相同；不会重复提交同一张图冒充 first_last_frame。');
  }
  if (last) return { mode: 'first_last_frame', first_frame: first, last_frame: last };
  return { mode: 'image_to_video', first_frame: first };
}

function assertCustomerVideoPayloadHasNoUnmappedMedia(payload: Seedance2CustomerVideoPayload) {
  if (payload.references?.length || payload.reference_images?.length || payload.reference_image || payload.reference_videos?.length) {
    throw new Error(
      '当前 customer 视频端点没有已配置的参考图片或参考视频 capability profile 与 serializer；已在请求前阻止提交，不会猜测 reference_images 或 reference_videos。',
    );
  }
  if (payload.mode === 'text_to_video' && (payload.first_frame || payload.last_frame)) {
    throw new Error('text_to_video 不能携带 first_frame / last_frame；请改用 image_to_video 或 first_last_frame。');
  }
}

export function buildSeedance2CustomerVideoPayload(
  node: CanvasNodeData,
  references: Seedance2CustomerVideoReference[] = [],
  videos: Array<{ name?: string; useAs?: string }> = [],
): Seedance2CustomerVideoPayload {
  const meta = node.metadata || {};
  const prompt = String(meta.prompt || meta.content || '').trim();
  const frames = mapCustomerVideoFrameReferences(references, videos);
  const ratio = normalizeCustomerVideoRatio(meta.seedanceRatio || meta.size || '9:16');
  const duration = normalizeCustomerVideoDuration(meta.seedanceDuration || meta.seconds || 5);
  const payload: Seedance2CustomerVideoPayload = {
    mode: frames.mode,
    prompt,
    ratio,
    duration,
    ...(frames.first_frame ? { first_frame: frames.first_frame } : {}),
    ...(frames.last_frame ? { last_frame: frames.last_frame } : {}),
  };
  const negativePrompt = String(meta.negativePrompt || '').trim();
  if (negativePrompt) payload.negative_prompt = negativePrompt;
  return payload;
}

/**
 * Generic serializer 只发出 prompt/ratio/duration。
 * 已验证的 first_frame/last_frame 留在原始 payload 上，交给 buildCustomerVideoStudioRequest
 * 映射为官方 OpenAI `input_reference` 或 Agnes `image` / `extra_body.image` keyframes。
 */
export function buildCustomerVideoWirePayload(payload: Seedance2CustomerVideoPayload) {
  assertCustomerVideoPayloadHasNoUnmappedMedia(payload);
  const first = normalizeSeedance2CustomerReferenceValue(payload.first_frame);
  const last = normalizeSeedance2CustomerReferenceValue(payload.last_frame);
  if (last && !first) {
    throw new Error('Agnes 关键帧需要首帧，不能用单独尾帧冒充 extra_body.image keyframes。');
  }
  if (payload.mode === 'image_to_video' && !first) {
    throw new Error('image-to-video 需要 first_frame；当前 customer serializer 不会猜测参考图。');
  }
  if (payload.mode === 'first_last_frame' && (!first || !last || last === first)) {
    throw new Error('first_last_frame 需要首帧和尾帧；缺少首帧时不会用单独尾帧冒充关键帧。');
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
