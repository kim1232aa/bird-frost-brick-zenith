import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useOpsStore, type CreditKind } from "./ops";

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
    price: "免费",
    limits: { text: 2_000, image: 200, video: 40 },
    perks: ["本地额度账本", "全部生成器可用", "无限画布与作品库", "自行接线自己的 API"],
  },
  {
    id: "pro",
    name: "专业版",
    tagline: "日更电商 / 短片",
    price: "演示加额",
    limits: { text: 20_000, image: 2_000, video: 400 },
    perks: ["图额度 ×10", "视频额度 ×10", "故事导演优先队列（演示）", "导出流水与审计"],
  },
  {
    id: "team",
    name: "团队版",
    tagline: "多人共用一套中转",
    price: "演示加额",
    limits: { text: 80_000, image: 8_000, video: 1_600 },
    perks: ["专业版全部能力", "运营后台模型上下架", "WebDAV 同步", "多中转轮询"],
  },
];

export const STUDIO_CREDIT_PACKS: Array<{ id: string; label: string; kind: StudioUsageKind; amount: number }> = [
  { id: "img-20", label: "+20 生图点", kind: "image", amount: 20 },
  { id: "img-100", label: "+100 生图点", kind: "image", amount: 100 },
  { id: "vid-5", label: "+5 视频点", kind: "video", amount: 5 },
  { id: "vid-20", label: "+20 视频点", kind: "video", amount: 20 },
  { id: "txt-200", label: "+200 文本点", kind: "text", amount: 200 },
];

/**
 * Membership and credits are a localStorage mock for the Web preview.
 * They do not bill a server and must not be treated as a real quota system.
 */
export const MEMBERSHIP_IS_LOCAL_MOCK = true;

type MembershipState = {
  plan: StudioPlanId;
  record: (kind: StudioUsageKind) => boolean;
  remaining: (kind: StudioUsageKind) => number;
  upgrade: (plan?: StudioPlanId) => void;
  buyPack: (id: string) => void;
};

function grantPlanDelta(from: StudioPlanId, to: StudioPlanId) {
  if (from === to) return;
  const current = STUDIO_PLANS.find((item) => item.id === from)!;
  const next = STUDIO_PLANS.find((item) => item.id === to)!;
  const ops = useOpsStore.getState();
  (["image", "video", "text"] as const).forEach((kind) => {
    const delta = Math.max(0, next.limits[kind] - current.limits[kind]);
    if (delta) ops.grant(kind, delta, `升级${next.name}`);
  });
}

export const useMembershipStore = create<MembershipState>()(
  persist(
    (set, get) => ({
      plan: "studio",
      record: () => true,
      remaining: (kind) => useOpsStore.getState().credits[kind],
      upgrade: (plan = "pro") => {
        const current = get().plan;
        if (current === plan) return;
        const rank = { studio: 0, pro: 1, team: 2 };
        if (rank[plan] < rank[current]) {
          set({ plan });
          return;
        }
        grantPlanDelta(current, plan);
        set({ plan });
      },
      buyPack: (id) => {
        const pack = STUDIO_CREDIT_PACKS.find((item) => item.id === id);
        if (!pack) return;
        useOpsStore.getState().grant(pack.kind, pack.amount, `补充包 ${pack.label}`);
      },
    }),
    { name: "boundless-studio:membership" },
  ),
);

export function planById(id: StudioPlanId) {
  return STUDIO_PLANS.find((item) => item.id === id) || STUDIO_PLANS[0];
}

export function planLabel(plan: StudioPlanId) {
  const item = planById(plan);
  return MEMBERSHIP_IS_LOCAL_MOCK ? `${item.name}（本地演示）` : item.name;
}

export function planLimits(plan: StudioPlanId) {
  return planById(plan).limits;
}
