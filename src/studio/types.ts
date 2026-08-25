import type { StudioAdapterId } from "./adapters/types";

export type StudioCapability = "text" | "image" | "video" | "audio";

export type { StudioAdapterId };

export type StudioEndpointMap = {
  chat?: string;
  images?: string;
  videosCreate?: string;
  videosPoll?: string;
};

export type StudioProviderBlueprint = {
  id: string;
  name: string;
  adapter: StudioAdapterId;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  capabilities: StudioCapability[];
  remark: string;
  models: string[];
  textModels: string[];
  imageModels: string[];
  videoModels: string[];
  audioModels: string[];
  endpoints: StudioEndpointMap;
  nsfw?: boolean;
};

export type StudioRouteMap = Record<StudioCapability, { providerId: string; model: string }>;
