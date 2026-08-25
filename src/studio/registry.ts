import { listStudioAdapters, getStudioAdapter, resolveAdapterId, type StudioAdapterId } from "./adapters";
import { arkVideoPollPath } from "./adapters/contracts";
import { xaiImaginePollPath } from "./adapters/contracts";

export { listStudioAdapters, getStudioAdapter, resolveAdapterId };

export function resolveVideoAdapter(input: { adapterType?: string; model?: string; baseUrl?: string }): StudioAdapterId {
  return resolveAdapterId(input);
}

export function videoCreatePath(adapter: StudioAdapterId) {
  if (adapter === "ark-plan") return "/contents/generations/tasks";
  if (adapter === "agnes") return "/videos";
  if (adapter === "civitai") return "/videoGen";
  return "/videos/generations";
}

export function videoPollPath(adapter: StudioAdapterId, taskId: string) {
  if (adapter === "ark-plan") return arkVideoPollPath(taskId);
  if (adapter === "xai-imagine") return xaiImaginePollPath(taskId);
  if (adapter === "agnes") return `/videos/${encodeURIComponent(taskId)}`;
  return `/videos/${encodeURIComponent(taskId)}`;
}

export function toStudioVideoWire(
  adapter: StudioAdapterId,
  model: string,
  payload: {
    prompt: string;
    duration?: number;
    ratio?: string;
    negative_prompt?: string;
    first_frame?: string;
  },
) {
  if (adapter === "xai-imagine") {
    return {
      model,
      prompt: payload.prompt,
      duration: payload.duration,
      aspect_ratio: payload.ratio || "16:9",
      resolution: "720p",
      ...(payload.first_frame ? { image: { url: payload.first_frame } } : {}),
    };
  }
  if (adapter === "ark-plan") {
    const content: Array<Record<string, unknown>> = [{ type: "text", text: payload.prompt }];
    if (payload.first_frame) content.push({ type: "image_url", image_url: { url: payload.first_frame } });
    return {
      model,
      content,
      duration: payload.duration,
      ratio: payload.ratio || "adaptive",
      generate_audio: true,
      watermark: false,
    };
  }
  return { model, prompt: payload.prompt, duration: payload.duration, ratio: payload.ratio };
}
