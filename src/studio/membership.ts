import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useOpsStore, type CreditKind } from "./ops";

export type StudioPlanId = "studio" | "pro";
export type StudioUsageKind = CreditKind;

const PLAN_LIMITS: Record<StudioPlanId, Record<StudioUsageKind, number>> = {
  studio: { text: 2_000, image: 200, video: 40 },
  pro: { text: 20_000, image: 2_000, video: 400 },
};

/**
 * Membership and credits are a localStorage mock for the Web preview.
 * They do not bill a server and must not be treated as a real quota system.
 */
export const MEMBERSHIP_IS_LOCAL_MOCK = true;

type MembershipState = {
  plan: StudioPlanId;
  record: (kind: StudioUsageKind) => boolean;
  remaining: (kind: StudioUsageKind) => number;
  upgrade: () => void;
};

export const useMembershipStore = create<MembershipState>()(
  persist(
    (set, get) => ({
      plan: "studio",
      record: () => true,
      remaining: (kind) => useOpsStore.getState().credits[kind],
      upgrade: () => {
        const ops = useOpsStore.getState();
        if (get().plan === "pro") return;
        ops.grant("image", 1_800, "升级专业版");
        ops.grant("video", 360, "升级专业版");
        ops.grant("text", 18_000, "升级专业版");
        set({ plan: "pro" });
      },
    }),
    { name: "boundless-studio:membership" },
  ),
);

export function planLabel(plan: StudioPlanId) {
  return plan === "pro" ? "专业版（本地演示）" : "工作室（本地演示）";
}

export function planLimits(plan: StudioPlanId) {
  return PLAN_LIMITS[plan];
}
