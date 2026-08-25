export const CHARACTER_DERIVED_VIEW_ANGLES = ["front", "side", "back", "portrait"];

const CHARACTER_DERIVED_VIEW_LABELS = {
  front: "Front",
  side: "Side",
  back: "Back",
  portrait: "Portrait",
};

export function areCharacterDerivedViewsStale(views, sourceStorageKey, parentNodeId, version = 1) {
  return !hasCompleteCharacterDerivedViews(views, sourceStorageKey, parentNodeId, version);
}

export function hasCompleteCharacterDerivedViews(views, sourceStorageKey, parentNodeId, version = 1) {
  if (!views || views.length !== CHARACTER_DERIVED_VIEW_ANGLES.length) return false;
  const angles = new Set(views.map((view) => view.angle));
  if (angles.size !== CHARACTER_DERIVED_VIEW_ANGLES.length) return false;
  return CHARACTER_DERIVED_VIEW_ANGLES.every((angle) => {
    const matchingViews = views.filter((candidate) => candidate.angle === angle);
    const view = matchingViews[0];
    return Boolean(
      matchingViews.length === 1 &&
      view &&
        view.storageKey &&
        view.width > 0 &&
        view.height > 0 &&
        view.mimeType &&
        view.bytes >= 0 &&
        view.sourceStorageKey === sourceStorageKey &&
        view.version === version &&
        (parentNodeId === undefined || view.id === characterDerivedViewId(parentNodeId, angle)),
    );
  });
}

export function characterDerivedViewId(parentNodeId, angle) {
  return `${parentNodeId}:${angle}`;
}

export async function splitAndStoreCharacterTurnaroundSheet({
  parentNodeId,
  sourceStorageKey,
  sourceUrl,
  existingViews,
  version = 1,
  upload,
}) {
  if (!upload) throw new Error("角色 turnaround 切图需要 uploadImage 上传器。");
  if (!areCharacterDerivedViewsStale(existingViews, sourceStorageKey, parentNodeId, version)) {
    return orderedCharacterDerivedViews(existingViews);
  }

  const image = await loadImage(sourceUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 4 || sourceHeight < 1) {
    throw new Error("角色 turnaround 图必须是可切分的横向 1x4 图像。");
  }

  return Promise.all(
    CHARACTER_DERIVED_VIEW_ANGLES.map(async (angle, index) => {
      const x = Math.round((index * sourceWidth) / CHARACTER_DERIVED_VIEW_ANGLES.length);
      const right = Math.round(((index + 1) * sourceWidth) / CHARACTER_DERIVED_VIEW_ANGLES.length);
      const blob = await cropImageToBlob(image, x, 0, Math.max(1, right - x), sourceHeight);
      const stored = await upload(blob, { retained: true });
      return {
        id: characterDerivedViewId(parentNodeId, angle),
        storageKey: stored.storageKey,
        width: stored.width,
        height: stored.height,
        mimeType: stored.mimeType,
        bytes: stored.bytes,
        sourceStorageKey,
        version,
        angle,
        label: CHARACTER_DERIVED_VIEW_LABELS[angle],
      };
    }),
  );
}

function orderedCharacterDerivedViews(views) {
  return CHARACTER_DERIVED_VIEW_ANGLES.map((angle) => {
    const view = views.find((candidate) => candidate.angle === angle);
    if (!view) throw new Error(`角色 turnaround 缺少 ${angle} 角度图。`);
    return view;
  });
}

function loadImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取角色 turnaround 图。"));
    image.src = sourceUrl;
  });
}

function cropImageToBlob(image, x, y, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建角色 turnaround 切图画布。");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法编码角色 turnaround 切图。"));
    }, "image/png");
  });
}
