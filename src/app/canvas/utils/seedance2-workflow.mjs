import { SEEDANCE2_PORTRAIT_MIN_SIZE, seedance2RatioFromNaturalSize, seedance2SourceRatioFromNaturalSize } from './seedance2-responsive-layout.mjs';

export const LOCAL_SEEDANCE2_MODEL = 'seedance-2.0';
export const LOCAL_SEEDANCE2_API_ENDPOINT = 'http://127.0.0.1:8006/v1/videos/generations';
export const SEEDANCE2_DURATION_OPTIONS = [
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
  { value: '15', label: '15s' },
];

export const SEEDANCE2_RESULT_RATIO_VALUES = ['9:16', '16:9', '1:1'];

export const SEEDANCE2_REFERENCE_SLOT_LABELS = {
  upstream_hd_frame: '上游高清参考帧',
  current_shot: '当前分镜图',
  character: '角色图',
  scene: '场景图',
};

export const SEEDANCE2_PLACEHOLDER_FRAME_SIZE = { width: 1114, height: 668 };

export function buildSeedance2WorkflowNodes(options = {}) {
  const now = Date.now();
  const shotCount = clampInt(options.shotCount ?? 4, 1, 60);
  const mode = 'slice';
  const origin = options.origin || { x: 0, y: 0 };
  const model = options.model || "";
  const ratio = normalizeSeedance2CreationAspectRatio(options.ratio || '9:16');
  const duration = normalizeSeedance2Duration(options.duration);
  const resolution = normalizeSeedance2Resolution(options.resolution);
  const generateCount = 1;
  const apiProvider = options.apiProvider || 'local';
  const apiEndpoint = options.apiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const customReferenceOrder = Array.isArray(options.referenceOrder) && options.referenceOrder.length
    ? options.referenceOrder
    : undefined;
  const controllerReferenceOrder = customReferenceOrder || ['上游高清参考帧', '当前分镜图', '角色图', '场景图'];
  const workflowId = `seedance2_workflow-${now}-${Math.random().toString(36).slice(2, 7)}`;
  const controller = {
    id: workflowId,
    type: 'seedance2_workflow',
    title: 'Seedance2 视频工作流',
    position: { x: origin.x, y: origin.y },
    width: 640,
    height: 760,
    metadata: {
      status: 'idle',
      seedanceWorkflowRole: 'controller',
      seedanceWorkflowMode: mode,
      seedanceShotCount: shotCount,
      seedanceGenerateCount: generateCount,
      seedanceContinuous: false,
      seedanceApiProvider: apiProvider,
      seedanceApiEndpoint: apiEndpoint,
      seedanceModel: model,
      ...(resolution ? { seedanceResolution: resolution } : {}),
      seedanceRatio: ratio,
      seedanceRatioSelection: 'upstream',
      ...(duration ? { seedanceDuration: duration } : {}),
      seedanceReferenceOrder: controllerReferenceOrder,
      seedancePromptTemplate: defaultSeedancePromptTemplate(),
    },
  };
  const nodes = [controller];
  const connections = [];
  for (let index = 1; index <= shotCount; index += 1) {
    const videoSpec = seedance2PlaceholderSize(ratio);
    const placeholder = {
      id: `video-seedance2-shot-${index}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'video',
      title: `第${index}镜 Seedance2 视频`,
      position: {
        x: origin.x + 780 + ((index - 1) % 3) * (videoSpec.width + 40),
        y: origin.y + Math.floor((index - 1) / 3) * (videoSpec.height + 60),
      },
      width: videoSpec.width,
      height: videoSpec.height,
      metadata: {
        ...createSeedance2VideoPlaceholderMetadata({
        mode,
        model,
        ratio,
        duration,
        resolution,
        generateCount,
        apiProvider,
        apiEndpoint,
        workflowNodeId: workflowId,
        shotIndex: index,
        shotTitle: `第${index}镜`,
        referenceOrder: customReferenceOrder,
        promptPanelMode: shotCount > 1 ? 'compact' : 'inline',
        prompt: `第${index}镜视频提示词：基于同一故事剧情发展，保持角色、场景与动作连续性。`,
        }),
        seedanceManualMinHeight: videoSpec.height,
      },
    };
    nodes.push(placeholder);
    connections.push({ id: `conn-seedance2-${index}-${now}`, fromNodeId: workflowId, toNodeId: placeholder.id });
  }
  return { nodes, connections };
}

export function createSeedance2VideoPlaceholderMetadata(options = {}) {
  const mode = options.mode === 'slice' ? 'slice' : 'continuous';
  const model = options.model || "";
  const sourceAspectRatio = seedance2SourceRatioFromImageNode(options.sourceImageNode);
  const sourceLayoutRatio = seedance2LayoutRatioFromImageNode(options.sourceImageNode);
  const ratio = normalizeSeedance2CreationAspectRatio(options.ratio || sourceLayoutRatio || '9:16');
  const duration = normalizeSeedance2Duration(options.duration);
  const resolution = normalizeSeedance2Resolution(options.resolution);
  const generateCount = clampInt(options.generateCount ?? (mode === 'slice' ? 3 : 1), 1, 10);
  const shotIndex = options.shotIndex || 1;
  const referenceOrder = Array.isArray(options.referenceOrder) && options.referenceOrder.length
    ? options.referenceOrder
    : ["\u4e0a\u6e38\u9ad8\u6e05\u53c2\u8003\u5e27", "\u5f53\u524d\u5206\u955c\u56fe", "\u89d2\u8272\u56fe", "\u573a\u666f\u56fe"];
  return {
    content: '',
    status: 'idle',
    generationMode: 'video',
    model,
    size: ratio,
    ...(duration ? { seconds: duration } : {}),
    ...(resolution ? { vquality: resolution } : {}),
    count: generateCount,
    generateAudio: 'true',
    watermark: 'false',
    seedanceWorkflowRole: 'placeholder',
    seedanceWorkflowNodeId: options.workflowNodeId,
    seedanceWorkflowMode: mode,
    seedanceShotIndex: shotIndex,
    seedanceShotTitle: options.shotTitle || `第${shotIndex}镜`,
    seedanceGenerateCount: generateCount,
    seedanceApiProvider: options.apiProvider || 'local',
    seedanceApiEndpoint: options.apiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT,
    seedanceModel: model,
    ...(resolution ? { seedanceResolution: resolution } : {}),
    seedanceRatio: ratio,
    ...(duration ? { seedanceDuration: duration } : {}),
    ...(sourceAspectRatio ? { seedanceSourceAspectRatio: sourceAspectRatio } : {}),
    seedanceInheritSourceRatio: options.inheritSourceRatio ?? true,
    seedanceRatioTouched: options.ratioTouched ?? false,
    seedancePromptPanelMode: options.promptPanelMode || 'inline',
    seedanceReferenceOrder: referenceOrder,
    seedanceReferenceSlotBindings: options.sourceImageNode ? buildSeedance2ReferenceSlotBindings(options.sourceImageNode) : {},
    prompt: options.prompt || `第${shotIndex}镜视频提示词：基于同一故事剧情发展，保持角色、场景与动作连续性。`,
    videoGenerationSettings: {},
  };
}

export function createSeedance2ResultMetadata(options = {}) {
  const sourceMeta = options.sourcePlaceholder?.metadata || {};
  const ratio = normalizeSeedance2ResultRatio(
    String(options.paramsSnapshot?.ratio || sourceMeta.seedanceRatio || sourceMeta.size || '16:9'),
  );
  const duration = String(options.paramsSnapshot?.duration || sourceMeta.seedanceDuration || sourceMeta.seconds || '');
  const model = String(options.paramsSnapshot?.model || sourceMeta.seedanceModel || sourceMeta.model || "");
  const content = options.url || options.fileUrls?.[0] || '';
  const fileUrls = options.fileUrls?.length ? options.fileUrls : content ? [content] : [];
  return {
    content,
    status: 'success',
    generationMode: 'video',
    model,
    size: ratio,
    ...(duration ? { seconds: duration } : {}),
    // 本地媒体存储键；有它画布重载时能从 SQLite 媒体库重新解析出可播放地址。
    ...(options.storageKey ? { storageKey: options.storageKey } : {}),
    ...((sourceMeta.seedanceResolution || sourceMeta.vquality) ? { vquality: sourceMeta.seedanceResolution || sourceMeta.vquality } : {}),
    seedanceWorkflowRole: 'result',
    seedanceSourcePlaceholderId: options.sourcePlaceholder?.id,
    seedanceWorkflowNodeId: sourceMeta.seedanceWorkflowNodeId,
    seedanceShotIndex: sourceMeta.seedanceShotIndex,
    seedanceShotTitle: sourceMeta.seedanceShotTitle,
    seedanceVersion: options.version,
    seedanceTaskId: options.taskId,
    seedanceRatio: ratio,
    ...(duration ? { seedanceDuration: duration } : {}),
    seedanceModel: model,
    ...((sourceMeta.seedanceResolution || sourceMeta.vquality) ? { seedanceResolution: sourceMeta.seedanceResolution || sourceMeta.vquality } : {}),
    seedanceFiles: options.files || [],
    seedanceFileUrls: fileUrls,
    seedanceParamsSnapshot: options.paramsSnapshot || {},
    seedancePromptSnapshot: sourceMeta.prompt || '',
    seedanceCreatedAt: new Date().toISOString(),
  };
}

function seedance2ResultVersion(node) {
  const version = Number(node?.metadata?.seedanceVersion || 0);
  return Number.isFinite(version) && version > 0 ? version : 0;
}

export function seedance2ResultVersionsForNode(nodes, nodeId) {
  const sourceNode = nodes.find((node) => node.id === nodeId);
  const placeholderId = sourceNode?.metadata?.seedanceSourcePlaceholderId;
  if (sourceNode?.metadata?.seedanceWorkflowRole !== 'result' || !placeholderId) return [];
  return nodes
    .filter(
      (node) =>
        node?.metadata?.seedanceWorkflowRole === 'result' &&
        node?.metadata?.seedanceSourcePlaceholderId === placeholderId,
    )
    .slice()
    .sort(
      (left, right) =>
        seedance2ResultVersion(left) - seedance2ResultVersion(right) ||
        String(left?.metadata?.seedanceCreatedAt || '').localeCompare(
          String(right?.metadata?.seedanceCreatedAt || ''),
        ),
    );
}

export function seedance2DisplayResultNodeIds(nodes, selectedByPlaceholder = {}) {
  const resultGroups = new Map();
  const displayed = new Set();
  nodes.forEach((node) => {
    if (node?.metadata?.seedanceWorkflowRole !== 'result') return;
    const placeholderId = node?.metadata?.seedanceSourcePlaceholderId;
    if (!placeholderId) {
      displayed.add(node.id);
      return;
    }
    const group = resultGroups.get(placeholderId) || [];
    group.push(node);
    resultGroups.set(placeholderId, group);
  });
  resultGroups.forEach((group, placeholderId) => {
    const ordered = seedance2ResultVersionsForNode(nodes, group[0].id);
    const selectedId = selectedByPlaceholder[placeholderId];
    const selected = ordered.find((node) => node.id === selectedId) || ordered.at(-1);
    if (selected) displayed.add(selected.id);
  });
  return displayed;
}

export function createSeedance2ExtractedFrameMetadata(options = {}) {
  return {
    status: 'success',
    generationMode: 'image',
    seedanceWorkflowRole: 'extracted-frame',
    seedanceSourceResultNodeId: options.sourceResultNodeId,
    seedanceSourcePlaceholderId: options.sourcePlaceholderId,
    seedanceFrameTimeSeconds: options.frameTimeSeconds,
    seedanceFrameIndex: options.frameIndex,
    seedanceConnectsToNextPlaceholderId: options.nextPlaceholderId,
    seedanceReferenceSlot: 'upstream_hd_frame',
  };
}

export function buildSeedance2ReferenceSlotBindings(sourceImageNode) {
  const key = inferSeedance2ReferenceSlotKey(sourceImageNode);
  return {
    [key]: {
      nodeId: sourceImageNode.id,
      value: seedance2ImageReferenceValue(sourceImageNode),
      label: SEEDANCE2_REFERENCE_SLOT_LABELS[key],
      required: key === 'current_shot' || key === 'upstream_hd_frame',
      // Purpose is assigned after the selected provider/model operation resolves.
      // Leaving it unset distinguishes this creation-time binding from a user's
      // explicit purpose selection.
    },
  };
}

export function inferSeedance2ReferenceSlotKey(sourceImageNode) {
  const text = `${sourceImageNode?.title || ''}\n${sourceImageNode?.metadata?.storyLabel || ''}\n${sourceImageNode?.metadata?.source || ''}`.toLowerCase();
  if (/上游|高清参考|参考帧|上一|前一|previous|upstream/.test(text)) return 'upstream_hd_frame';
  if (/角色|人物|character/.test(text)) return 'character';
  if (/场景|scene/.test(text)) return 'scene';
  return 'current_shot';
}

export function imageNodeAspectRatioToken(sourceImageNode) {
  if (!sourceImageNode || sourceImageNode.type !== 'image') return '';
  const width = Number(sourceImageNode.metadata?.naturalWidth || sourceImageNode.width);
  const height = Number(sourceImageNode.metadata?.naturalHeight || sourceImageNode.height);
  if (!width || !height) return '';
  return nearestSeedance2AspectRatio(width / height);
}

export function seedance2LayoutRatioFromImageNode(sourceImageNode) {
  if (!sourceImageNode || sourceImageNode.type !== 'image') return '';
  const width = Number(sourceImageNode.metadata?.naturalWidth || sourceImageNode.width);
  const height = Number(sourceImageNode.metadata?.naturalHeight || sourceImageNode.height);
  if (!width || !height) return '';
  return seedance2RatioFromNaturalSize(width, height, '9:16');
}

export function seedance2SourceRatioFromImageNode(sourceImageNode) {
  if (!sourceImageNode || sourceImageNode.type !== 'image') return null;
  const width = Number(sourceImageNode.metadata?.naturalWidth || sourceImageNode.width);
  const height = Number(sourceImageNode.metadata?.naturalHeight || sourceImageNode.height);
  return seedance2SourceRatioFromNaturalSize(width, height);
}

export function removeLegacySeedance2TextNodes(nodes = []) {
  return nodes.filter((node) => !(node?.type === 'text' && typeof node.id === 'string' && node.id.startsWith('text-seedance2-')));
}

export function defaultSeedancePromptTemplate() {
  return '故事全局设定 + 当前分镜内容 + 角色/场景资产 + 参考图内容 + 上游参考帧分析 + Seedance 视频提示词模板 = 当前视频提示词';
}

export function normalizeSeedance2Resolution(value) {
  return String(value || '').trim();
}

export function normalizeSeedance2Duration(value) {
  const normalized = String(value || '').trim();
  const duration = Number(normalized);
  return Number.isFinite(duration) && duration > 0 ? normalized : '';
}

export function resolveSeedance2WorkflowRatioSelection({ selection, inheritSourceRatio, ratioTouched } = {}) {
  return selection === 'manual' || inheritSourceRatio === false || ratioTouched
    ? 'manual'
    : 'upstream';
}

export function resolveSeedance2WorkflowRatio({ storedRatio, selection, upstreamRatio } = {}) {
  if (selection === 'manual') {
    return normalizeSeedance2CreationAspectRatio(storedRatio || '9:16');
  }
  return normalizeSeedance2CreationAspectRatio(upstreamRatio || storedRatio || '9:16');
}

export function normalizeSeedance2AspectRatio(value) {
  const normalized = String(value || '').trim();
  if (SEEDANCE2_ASPECT_RATIO_VALUES.includes(normalized)) return normalized;
  const match = normalized.match(/^(\d+(?:\.\d+)?)[x:](\d+(?:\.\d+)?)$/i);
  if (!match) return '16:9';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return '16:9';
  return nearestSeedance2AspectRatio(width / height);
}

export function normalizeSeedance2ResultRatio(value) {
  const ratio = normalizeSeedance2AspectRatio(value || '16:9');
  return SEEDANCE2_RESULT_RATIO_VALUES.includes(ratio) ? ratio : '16:9';
}

export function seedance2PlaceholderSize(value) {
  switch (normalizeSeedance2AspectRatio(value || '9:16')) {
    case '9:16':
      return { ...SEEDANCE2_PORTRAIT_MIN_SIZE };
    case '1:1':
      return { width: 520, height: 520 };
    case '4:3':
      return { width: 560, height: 420 };
    case '3:4':
      return { width: 480, height: 640 };
    case '21:9':
      return { width: 680, height: 292 };
    default:
      return { ...SEEDANCE2_PLACEHOLDER_FRAME_SIZE };
  }
}

export function seedance2ResultSizeFromSourceHeight(sourceHeight, ratioValue) {
  const height = Math.max(1, Math.round(Number(sourceHeight) || SEEDANCE2_PLACEHOLDER_FRAME_SIZE.height));
  const ratio = normalizeSeedance2ResultRatio(ratioValue);
  const [widthRatio, heightRatio] = ratio.split(':').map(Number);
  return {
    width: Math.round(height * (widthRatio / heightRatio)),
    height,
  };
}

export function nextSeedance2ResultPosition(sourcePlaceholder, existingResults = [], ratioValue) {
  const gapX = 48;
  const gapY = 32;
  const size = seedance2ResultSizeFromSourceHeight(sourcePlaceholder.height, ratioValue);
  const stackOffset = existingResults.reduce(
    (total, node) => total + (Number(node.height) || size.height) + gapY,
    0,
  );
  return {
    x: sourcePlaceholder.position.x + sourcePlaceholder.width + gapX,
    y: sourcePlaceholder.position.y + stackOffset,
  };
}

export function updateSeedanceGenerationTaskState(current = {}, placeholderId, patch = {}) {
  return {
    ...current,
    [placeholderId]: {
      ...(current[placeholderId] || { status: 'idle' }),
      ...patch,
    },
  };
}

export function findNextSeedance2Placeholder(sourcePlaceholderIdOrNodes, nodesOrSourcePlaceholder) {
  const isLegacyCall = Array.isArray(sourcePlaceholderIdOrNodes);
  const nodes = isLegacyCall
    ? sourcePlaceholderIdOrNodes
    : Array.isArray(nodesOrSourcePlaceholder)
      ? nodesOrSourcePlaceholder
      : [];
  const sourcePlaceholderId = isLegacyCall
    ? nodesOrSourcePlaceholder?.id
    : sourcePlaceholderIdOrNodes;
  const fallbackSource = Array.isArray(nodesOrSourcePlaceholder) ? undefined : nodesOrSourcePlaceholder;
  const source = nodes.find((node) => node.id === sourcePlaceholderId) || fallbackSource;
  const sourceIndex = Number(source?.metadata?.seedanceShotIndex || 0);
  const sourceWorkflowNodeId = source?.metadata?.seedanceWorkflowNodeId;
  if (!sourceIndex) {
    if (!isLegacyCall) return null;
    const sourceNodeIndex = nodes.findIndex((node) => node.id === sourcePlaceholderId);
    const nodesAfterSource = sourceNodeIndex >= 0 ? nodes.slice(sourceNodeIndex + 1) : nodes;
    return nodesAfterSource.find(
      (node) =>
        node?.type === 'video' &&
        node?.metadata?.seedanceWorkflowRole === 'placeholder' &&
        Number(node?.metadata?.seedanceShotIndex || 0) > 0 &&
        (!sourceWorkflowNodeId || node?.metadata?.seedanceWorkflowNodeId === sourceWorkflowNodeId),
    ) || null;
  }
  return nodes.find(
    (node) =>
      node?.type === 'video' &&
      node?.metadata?.seedanceWorkflowRole === 'placeholder' &&
      Number(node?.metadata?.seedanceShotIndex || 0) === sourceIndex + 1 &&
      (!sourceWorkflowNodeId || node?.metadata?.seedanceWorkflowNodeId === sourceWorkflowNodeId),
  ) || null;
}

export function compactBulkSeedance2PlaceholderPanels(nodes = []) {
  const placeholderCountByWorkflowId = new Map();
  nodes.forEach((node) => {
    const workflowId = seedance2BulkPlaceholderWorkflowId(node);
    if (!workflowId) return;
    placeholderCountByWorkflowId.set(workflowId, (placeholderCountByWorkflowId.get(workflowId) || 0) + 1);
  });

  let changed = false;
  const compacted = nodes.map((node) => {
    const workflowId = seedance2BulkPlaceholderWorkflowId(node);
    if (!workflowId || (placeholderCountByWorkflowId.get(workflowId) || 0) <= 1) return node;
    if (node?.metadata?.seedancePromptEditedByUser || node?.metadata?.seedancePromptExpandedByUser) return node;
    if (node?.metadata?.seedancePromptPanelMode === 'compact') return node;
    changed = true;
    return {
      ...node,
      metadata: {
        ...node.metadata,
        seedancePromptPanelMode: 'compact',
      },
    };
  });
  return changed ? compacted : nodes;
}

function seedance2BulkPlaceholderWorkflowId(node) {
  if (
    node?.type !== 'video' ||
    node?.metadata?.content ||
    node?.metadata?.seedanceWorkflowRole !== 'placeholder'
  ) return '';
  return String(node?.metadata?.seedanceWorkflowNodeId || '').trim();
}

function seedance2ImageReferenceValue(sourceImageNode) {
  const meta = sourceImageNode?.metadata || {};
  const value = String(meta.backendUrl || meta.content || meta.backendRel || meta.storageKey || '').trim();
  return value.startsWith('blob:') ? '' : value;
}

function clampInt(value, min, max) {
  const number = Math.floor(Math.abs(Number(value)) || min);
  return Math.max(min, Math.min(max, number));
}

const SEEDANCE2_ASPECT_RATIO_VALUES = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];

export function normalizeSeedance2CreationAspectRatio(value) {
  const normalized = String(value || '').trim();
  if (SEEDANCE2_ASPECT_RATIO_VALUES.includes(normalized)) return normalized;
  const match = normalized.match(/^(\d+(?:\.\d+)?)[x:](\d+(?:\.\d+)?)$/i);
  if (!match) return '9:16';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return '9:16';
  return nearestSeedance2AspectRatio(width / height);
}

function nearestSeedance2AspectRatio(ratio) {
  return SEEDANCE2_ASPECT_RATIO_VALUES.reduce((best, item) => (
    Math.abs(seedance2AspectRatioNumber(item) - ratio) < Math.abs(seedance2AspectRatioNumber(best) - ratio) ? item : best
  ), '16:9');
}

function seedance2AspectRatioNumber(value) {
  const [width, height] = value.split(':').map(Number);
  return width / height;
}
