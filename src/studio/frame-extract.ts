function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    if (!url.startsWith("blob:") && !url.startsWith("data:")) video.crossOrigin = "anonymous";
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("视频无法读取，请换一个本地文件"));
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const safe = Math.min(Math.max(0, time), Math.max(0, (video.duration || 0) - 0.05));
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("定位视频帧失败"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = safe;
  });
}

export function captureVideoFrame(video: HTMLVideoElement) {
  const width = video.videoWidth || 0;
  const height = video.videoHeight || 0;
  if (!width || !height) throw new Error("还没读到画面，稍后再抽");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法抽帧");
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function extractVideoFrames(url: string, times: number[]) {
  const video = await loadVideo(url);
  const frames: string[] = [];
  for (const time of times) {
    await seek(video, time);
    frames.push(captureVideoFrame(video));
  }
  video.removeAttribute("src");
  video.load();
  return frames;

}

export function evenFrameTimes(duration: number, count: number) {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  if (!duration || n === 1) return [0];
  if (n === 2) return [0, Math.max(0, duration - 0.05)];
  const step = duration / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.min(duration - 0.05, i * step));
}

export function videoFileUrl(file: File) {
  return URL.createObjectURL(file);
}
