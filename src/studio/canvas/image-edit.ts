export type CropRect = { x: number; y: number; width: number; height: number };

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = url;
  });
}

export async function cropDataUrl(url: string, crop: CropRect) {
  const image = await loadImage(url);
  const x = Math.round(crop.x * image.width);
  const y = Math.round(crop.y * image.height);
  const width = Math.max(1, Math.round(crop.width * image.width));
  const height = Math.max(1, Math.round(crop.height * image.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法裁切");
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

export async function splitGrid(url: string, cols = 3, rows = 3) {
  const image = await loadImage(url);
  const cellW = Math.floor(image.width / cols);
  const cellH = Math.floor(image.height / rows);
  const out: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = cellW;
      canvas.height = cellH;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
      out.push(canvas.toDataURL("image/png"));
    }
  }
  return out;
}

export async function copyImageUrl(url: string) {
  if (navigator.clipboard?.write && url.startsWith("data:")) {
    const blob = await (await fetch(url)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return;
  }
  await navigator.clipboard.writeText(url);
}

export function anglePrompt(base: string, params: { yaw: number; pitch: number; distance: number; wide: boolean }) {
  const yaw = params.yaw === 0 ? "front" : params.yaw > 0 ? `${params.yaw} degrees to the right` : `${Math.abs(params.yaw)} degrees to the left`;
  const pitch = params.pitch === 0 ? "eye level" : params.pitch > 0 ? `camera pitched up ${params.pitch} degrees` : `camera pitched down ${Math.abs(params.pitch)} degrees`;
  return `${base || "same subject, same wardrobe, same scene"}. Camera orbit: ${yaw}, ${pitch}, distance ${params.distance} meters, ${params.wide ? "wide angle lens" : "standard 50mm"}. Keep identity, face, clothing and scene continuity. Photoreal cinematic still.`;
}

export function derivedViewPrompt(name: string, look: string, angle: "front" | "side" | "back" | "portrait") {
  const view =
    angle === "front"
      ? "full body front standing, facing camera, neutral pose"
      : angle === "side"
        ? "full body side profile standing, neutral pose"
        : angle === "back"
          ? "full body back view standing, same clothes"
          : "upper body facial close-up, three-quarter, studio";
  return `生成角色设定分图，纯白无缝背景，棚拍光，电影感写实。
角色：${name}
外貌：${look}
视图：${view}
同一套服装、同一发型、同一脸型。不要文字、水印、场景、额外人物。`;
}
