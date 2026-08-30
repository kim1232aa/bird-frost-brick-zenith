import { listStudioAdapters, getStudioAdapter, resolveAdapterId, type StudioAdapterId } from "./adapters/index.ts";
import { officialAwareVideoCreatePath, toStudioVideoWire, videoPollPath as contractVideoPollPath } from "./adapters/contracts.ts";

export { listStudioAdapters, getStudioAdapter, resolveAdapterId, toStudioVideoWire };

export function resolveVideoAdapter(input: { adapterType?: string; model?: string; baseUrl?: string }): StudioAdapterId {
  return resolveAdapterId(input);
}

export function videoCreatePath(
  adapter: StudioAdapterId,
  endpoints?: { videosCreate?: string },
  options?: { baseUrl?: string; protocol?: string },
) {
  return officialAwareVideoCreatePath(adapter, endpoints, options);
}

export function videoPollPath(
  adapter: StudioAdapterId,
  taskId: string,
  endpoints?: { videosPoll?: string },
  options?: { baseUrl?: string; protocol?: string },
) {
  return contractVideoPollPath(adapter, taskId, endpoints, options);
}
