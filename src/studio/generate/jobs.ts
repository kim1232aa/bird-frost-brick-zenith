import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioJobKind = "image" | "edit" | "video" | "i2v" | "extract";
export type StudioJobStatus = "queued" | "running" | "succeeded" | "failed";

export type StudioJob = {
  id: string;
  kind: StudioJobKind;
  status: StudioJobStatus;
  prompt: string;
  model: string;
  providerId: string;
  urls: string[];
  error?: string;
  credits: number;
  createdAt: number;
  finishedAt?: number;
};

type JobsState = {
  jobs: StudioJob[];
  start: (input: Omit<StudioJob, "id" | "status" | "createdAt" | "urls" | "finishedAt" | "error">) => string;
  succeed: (id: string, urls: string[]) => void;
  fail: (id: string, error: string) => void;
  clear: () => void;
};

export const useStudioJobs = create<JobsState>()(
  persist(
    (set, get) => ({
      jobs: [],
      start: (input) => {
        const id = crypto.randomUUID();
        const job: StudioJob = {
          ...input,
          id,
          status: "running",
          urls: [],
          createdAt: Date.now(),
        };
        set({ jobs: [job, ...get().jobs].slice(0, 80) });
        return id;
      },
      succeed: (id, urls) =>
        set({
          jobs: get().jobs.map((item) =>
            item.id === id ? { ...item, status: "succeeded", urls, finishedAt: Date.now() } : item,
          ),
        }),
      fail: (id, error) =>
        set({
          jobs: get().jobs.map((item) =>
            item.id === id ? { ...item, status: "failed", error, finishedAt: Date.now() } : item,
          ),
        }),
      clear: () => set({ jobs: [] }),
    }),
    { name: "boundless-studio:jobs" },
  ),
);
