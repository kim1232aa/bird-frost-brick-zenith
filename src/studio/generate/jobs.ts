import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioJobKind = "image" | "video" | "edit" | "i2v" | "extract";
export type StudioJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type StudioJob = {
  id: string;
  kind: StudioJobKind;
  status: StudioJobStatus;
  title: string;
  prompt: string;
  model: string;
  providerId: string;
  urls: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type JobsState = {
  jobs: StudioJob[];
  enqueue: (input: Omit<StudioJob, "id" | "status" | "createdAt" | "updatedAt" | "urls"> & { urls?: string[] }) => StudioJob;
  start: (id: string) => void;
  succeed: (id: string, urls: string[]) => void;
  fail: (id: string, error: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useStudioJobs = create<JobsState>()(
  persist(
    (set, get) => ({
      jobs: [],
      enqueue: (input) => {
        const job: StudioJob = {
          id: crypto.randomUUID(),
          kind: input.kind,
          status: "queued",
          title: input.title,
          prompt: input.prompt,
          model: input.model,
          providerId: input.providerId,
          urls: input.urls || [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set({ jobs: [job, ...get().jobs].slice(0, 80) });
        return job;
      },
      start: (id) =>
        set({
          jobs: get().jobs.map((job) => (job.id === id ? { ...job, status: "running", updatedAt: Date.now() } : job)),
        }),
      succeed: (id, urls) =>
        set({
          jobs: get().jobs.map((job) =>
            job.id === id ? { ...job, status: "succeeded", urls, error: undefined, updatedAt: Date.now() } : job,
          ),
        }),
      fail: (id, error) =>
        set({
          jobs: get().jobs.map((job) => (job.id === id ? { ...job, status: "failed", error, updatedAt: Date.now() } : job)),
        }),
      cancel: (id) =>
        set({
          jobs: get().jobs.map((job) => (job.id === id ? { ...job, status: "canceled", updatedAt: Date.now() } : job)),
        }),
      remove: (id) => set({ jobs: get().jobs.filter((job) => job.id !== id) }),
      clear: () => set({ jobs: [] }),
    }),
    { name: "boundless-studio:jobs" },
  ),
);
