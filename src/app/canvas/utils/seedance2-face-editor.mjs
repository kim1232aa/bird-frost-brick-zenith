export const FACE_EDITOR_DEFAULT_GRID_COLOR = "#ef4444";
export const FACE_EDITOR_DEFAULT_GRID_OPACITY = 0.82;
export const FACE_EDITOR_DEFAULT_GRID_SPACING = 24;
export const FACE_EDITOR_DEFAULT_GRID_STROKE_WIDTH = 2;
export const FACE_EDITOR_MIN_ELLIPSE_SIZE = 24;

const resizeHandleDirections = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

const seedance2FaceEditOriginalMetadataKeys = [
  "content",
  "backendUrl",
  "backendRel",
  "storageKey",
  "naturalWidth",
  "naturalHeight",
  "bytes",
  "mimeType",
];

export function createDefaultFaceSelection(imageSize) {
  const width = clamp(Math.round(imageSize.width * 0.3), FACE_EDITOR_MIN_ELLIPSE_SIZE, imageSize.width);
  const height = clamp(Math.round(imageSize.height * 0.5), FACE_EDITOR_MIN_ELLIPSE_SIZE, imageSize.height);
  return clampEllipseBox({
    x: Math.round((imageSize.width - width) / 2),
    y: Math.round((imageSize.height - height) / 2),
    width,
    height,
    rotation: 0,
  }, imageSize);
}

export function clampEllipseBox(box, imageSize) {
  const width = clamp(Math.round(box.width), FACE_EDITOR_MIN_ELLIPSE_SIZE, imageSize.width);
  const height = clamp(Math.round(box.height), FACE_EDITOR_MIN_ELLIPSE_SIZE, imageSize.height);
  return {
    x: clamp(Math.round(box.x), 0, imageSize.width - width),
    y: clamp(Math.round(box.y), 0, imageSize.height - height),
    width,
    height,
    rotation: normalizeRotation(box.rotation),
  };
}

export function moveEllipseBox(box, delta, imageSize) {
  return clampEllipseBox({ ...box, x: box.x + delta.dx, y: box.y + delta.dy }, imageSize);
}

export function resizeEllipseBox(box, handle, delta, imageSize, lockCircle) {
  const direction = resizeHandleDirections[handle] || resizeHandleDirections.se;
  const horizontal = resizeAxis(box.x, box.width, delta.dx, direction.x, imageSize.width);
  const vertical = resizeAxis(box.y, box.height, delta.dy, direction.y, imageSize.height);

  if (lockCircle) {
    const hasHorizontalResize = direction.x !== 0;
    const hasVerticalResize = direction.y !== 0;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const maxWidth = direction.x < 0 ? right : imageSize.width - box.x;
    const maxHeight = direction.y < 0 ? bottom : imageSize.height - box.y;
    const maxSize = Math.max(0, Math.min(maxWidth, maxHeight));
    const minSize = Math.min(FACE_EDITOR_MIN_ELLIPSE_SIZE, maxSize);
    let requestedSize;
    if (hasHorizontalResize && hasVerticalResize) {
      requestedSize = Math.min(horizontal.size, vertical.size);
    } else if (hasHorizontalResize) {
      requestedSize = horizontal.size;
    } else {
      requestedSize = vertical.size;
    }
    const size = clamp(requestedSize, minSize, maxSize);
    return clampEllipseBox(
      {
        x: direction.x < 0 ? right - size : box.x,
        y: direction.y < 0 ? bottom - size : box.y,
        width: size,
        height: size,
        rotation: box.rotation,
      },
      imageSize,
    );
  }

  return clampEllipseBox(
    { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size, rotation: box.rotation },
    imageSize,
  );
}

export function createFaceLayerFromSelection(id, selection) {
  return {
    id,
    kind: "face",
    sourceSelection: { ...selection },
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
    rotation: selection.rotation,
    opacity: 1,
  };
}

export function createDefaultFaceGridLayer(id, basis) {
  return {
    id,
    kind: "grid",
    x: basis.x,
    y: basis.y,
    width: basis.width,
    height: basis.height,
    rotation: basis.rotation || 0,
    color: FACE_EDITOR_DEFAULT_GRID_COLOR,
    opacity: FACE_EDITOR_DEFAULT_GRID_OPACITY,
    spacing: FACE_EDITOR_DEFAULT_GRID_SPACING,
    strokeWidth: FACE_EDITOR_DEFAULT_GRID_STROKE_WIDTH,
  };
}

export function createGridLinePlan(bounds, spacing) {
  const normalizedBounds = {
    x: bounds.x ?? 0,
    y: bounds.y ?? 0,
    width: bounds.width,
    height: bounds.height,
    rotation: bounds.rotation ?? 0,
  };
  const safeSpacing = normalizeGridSpacing(spacing);
  const max = Math.ceil(Math.max(normalizedBounds.width, normalizedBounds.height) / safeSpacing) * safeSpacing;
  const offsets = [];
  for (let offset = -max; offset <= max; offset += safeSpacing) {
    offsets.push(offset);
  }
  return {
    bounds: normalizedBounds,
    spacing: safeSpacing,
    diagonals: [
      ...offsets.map((offset) => ({ direction: "down", offset })),
      ...offsets.map((offset) => ({ direction: "up", offset })),
    ],
  };
}

export function faceEditorLayerOrder(layers) {
  return [
    ...layers.filter((layer) => layer.kind === "face").map((layer) => layer.id),
    ...layers.filter((layer) => layer.kind === "grid").map((layer) => layer.id),
  ];
}

export function preserveNodeDisplayPatch(node, imageMetadata) {
  const originalMetadata = node.metadata || {};
  const metadata = {
    ...originalMetadata,
    ...imageMetadata,
    status: "success",
    errorDetails: undefined,
  };
  preserveExistingMetadataField(metadata, originalMetadata, "prompt");
  preserveExistingMetadataField(metadata, originalMetadata, "imageSequenceNumber");
  preserveExistingMetadataField(metadata, originalMetadata, "freeResize");

  return {
    ...node,
    metadata,
  };
}

export function createSeedance2FaceEditOriginalBackup(node, imageMetadata) {
  const originalMetadata = node.metadata || {};
  return preserveNodeDisplayPatch(node, {
    ...imageMetadata,
    seedance2FaceEditOriginal:
      originalMetadata.seedance2FaceEditOriginal ||
      pickSeedance2FaceEditOriginalMetadata(originalMetadata),
  });
}

export function restoreSeedance2FaceEditOriginalNode(node, overrides = {}) {
  const originalMetadata = node.metadata?.seedance2FaceEditOriginal;
  if (!originalMetadata) return node;
  return preserveNodeDisplayPatch(node, {
    ...createSeedance2FaceEditOriginalRestorePatch(originalMetadata, overrides),
    seedance2FaceEditOriginal: originalMetadata,
  });
}

function pickSeedance2FaceEditOriginalMetadata(metadata) {
  const backup = {};
  for (const key of seedance2FaceEditOriginalMetadataKeys) {
    const value = metadata[key];
    if (value !== undefined) {
      backup[key] = value;
    }
  }
  return backup;
}

function createSeedance2FaceEditOriginalRestorePatch(originalMetadata, overrides) {
  const source = { ...originalMetadata, ...overrides };
  const patch = {};
  for (const key of seedance2FaceEditOriginalMetadataKeys) {
    patch[key] = source[key];
  }
  return patch;
}

function preserveExistingMetadataField(target, source, key) {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    target[key] = source[key];
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeGridSpacing(spacing) {
  const numeric = Number(spacing);
  if (!Number.isFinite(numeric) || numeric <= 0) return FACE_EDITOR_DEFAULT_GRID_SPACING;
  return Math.max(4, Math.round(numeric));
}

function resizeAxis(start, size, delta, direction, max) {
  const end = start + size;
  if (direction > 0) {
    const minSize = Math.min(FACE_EDITOR_MIN_ELLIPSE_SIZE, Math.max(0, max - start));
    const nextEnd = clamp(end + delta, start + minSize, max);
    return { start, size: nextEnd - start };
  }
  if (direction < 0) {
    const minSize = Math.min(FACE_EDITOR_MIN_ELLIPSE_SIZE, Math.max(0, end));
    const nextStart = clamp(start + delta, 0, end - minSize);
    return { start: nextStart, size: end - nextStart };
  }
  return { start, size };
}

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 180 || numeric < -180) {
    return ((((numeric + 180) % 360) + 360) % 360) - 180;
  }
  return Math.round(numeric * 100) / 100;
}
