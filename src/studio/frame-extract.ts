export async function loadVideo(src: string) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("视频无法读取，换一个文件再试。"));
    video.src = src;
  });
  return video;
}

function grabFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法抽帧");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function seek(video: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.onerror = () => reject(new Error("抽帧定位失败"));
    video.currentTime = target;
  });
}

export async function extractFrameAt(src: string, time: number) {
  const video = await loadVideo(src);
  await seek(video, time);
  const url = grabFrame(video);
  video.src = "";
  return url;
}

export async function extractCurrentFrame(video: HTMLVideoElement) {
  return grabFrame(video);
}

export async function extractEvenFrames(src: string, count = 4) {
  const video = await loadVideo(src);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const n = Math.max(1, Math.min(8, count));
  const frames: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : (duration * i) / (n - 1);
    await seek(video, t);
    frames.push(grabFrame(video));
  }
  video.src = "";
  return frames;
}
