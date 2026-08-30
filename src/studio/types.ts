import type { StudioAdapterId } from "./adapters/types";
import type { ImageCapabilityProfileSelection } from "@/services/api/image-model-capabilities";
import type { VideoCapabilityProfileId } from "@/services/api/video-model-capabilities";

export type StudioCapability = "text" | "image" | "video" | "audio";

export type { StudioAdapterId };

export type StudioEndpointMap = {
  chat?: string;
  images?: string;
  videosCreate?: string;
  videosPoll?: string;
  audio?: string;
  models?: string;
};

export type StudioProviderBlueprint = {
  id: string;
  name: string;
  adapter: StudioAdapterId;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  capabilities: StudioCapability[];
  runnableCapabilities?: StudioCapability[];
  remark: string;
  models: string[];
  textModels: string[];
  imageModels: string[];
  videoModels: string[];
  audioModels: string[];
  endpoints: StudioEndpointMap;
  nsfw?: boolean;
  videoCapabilityProfiles?: Record<string, VideoCapabilityProfileId>;
  imageCapabilityProfiles?: Record<string, ImageCapabilityProfileSelection>;
};

export type StudioRouteMap = Record<StudioCapability, { providerId: string; model: string }>;
