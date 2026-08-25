export type VideoReferenceUseAs = "reference_video" | "first_clip" | "source_video";

export type ReferenceVideo = {
    id: string;
    name: string;
    type: string;
    url: string;
    storageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    /** Missing on legacy canvases; provider-specific validation owns any narrow compatibility behavior. */
    useAs?: VideoReferenceUseAs;
};

export type ReferenceAudio = {
    id: string;
    name: string;
    type: string;
    url: string;
    storageKey?: string;
    durationMs?: number;
};
