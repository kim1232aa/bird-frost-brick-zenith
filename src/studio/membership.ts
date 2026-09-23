import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MEMBERSHIP_IS_LOCAL_MOCK, useOpsStore, type CreditKind } from "./ops";

export { MEMBERSHIP_IS_LOCAL_MOCK };

export type StudioPlanId = "studio" | "pro" | "team";
export type StudioUsageKind = CreditKind;

export type StudioPlan = {
  id: StudioPlanId;
  name: string;
  tagline: string;
  price: string;
  limits: Record<StudioUsageKind, number>;
  perks: string[];
};

export const STUDIO_PLANS: StudioPlan[] = [
  {
    id: "studio",
    name: "工作室",
    tagline: "先跑通工作流",
    price: "本机预览",
    limits: { text: 2_000, image: 200, video: 40 },
    perks: ["本机演示额度", "全部生成器可用", "无限画布与作品库", "自行接线自己的 API"],
  },
  {
    id: "pro",
    name: "专业版",
    tagline: "日更电商 / 短片",
    price: "未接结算",
    limits: { text: 20_000, image: 2_000, video: 400 },
    perks: ["图额度 ×10", "视频额度 ×10", "故事导演优先队列", "导出流水与审计"],
  },
  {
    id: "team",
    name: "团队版",
    tagline: "多人共用一套中转",
    price: "未接结算",
    limits: { text: 80_000, image: 8_000, video: 1_600 },
    perks: ["专业版全部能力", "运营后台模型上下架", "多中转轮询"],
  },
];

type MembershipState = {
  plan: StudioPlanId;
  record: (kind: StudioUsageKind, model?: string, points?: number) => boolean;
  remaining: (kind: StudioUsageKind) => number;
};

export const useMembershipStore = create<MembershipState>()(
  persist(
    (): MembershipState => ({
      plan: "studio",
      record: (_kind, _model = "", _points = 1) => {
        // Debit happens in generate helpers via ops.spend, with refund on failure.
        // This marker stays for account UI callers and must not double-charge.
        return true;
      },
      remaining: (kind) => useOpsStore.getState().credits[kind],
    }),
    { name: "boundless-studio:membership" },
  ),
);

export function planById(id: StudioPlanId) {
  return STUDIO_PLANS.find((item) => item.id === id) || STUDIO_PLANS[0];
}

export function planLabel(plan: StudioPlanId) {
  return planById(plan).name;
}

export function planLimits(plan: StudioPlanId) {
  return planById(plan).limits;
}
