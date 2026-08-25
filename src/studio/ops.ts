import { create } from "zustand";
import { persist } from "zustand/middleware";
import { catalogKey, STUDIO_CATALOG, type ModelCard } from "./catalog";
import { useStudioSession } from "./session";

export type CreditKind = "text" | "image" | "video";

export type LedgerRow = {
  id: string;
  at: number;
  kind: CreditKind;
  delta: number;
  reason: string;
  model: string;
  ok: boolean;
};

export type AuditRow = {
  id: string;
  at: number;
  action: string;
  detail: string;
};

type OpsState = {
  unlisted: Record<string, boolean>;
  points: Record<string, number>;
  credits: Record<CreditKind, number>;
  ledger: LedgerRow[];
  audit: AuditRow[];
  adminOpen: boolean;
  setListed: (key: string, listed: boolean) => void;
  setPoints: (key: string, points: number) => void;
  grant: (kind: CreditKind, amount: number, reason: string) => void;
  spend: (kind: CreditKind, model: string, points?: number) => LedgerRow;
  refund: (id: string) => void;
  setAdminOpen: (open: boolean) => void;
  exportJson: () => string;
};

const DEFAULT_CREDITS: Record<CreditKind, number> = { text: 2_000, image: 200, video: 40 };

function defaultPoints(card: ModelCard): number {
  if (card.kind === "video") return 5;
  if (card.kind === "text") return 1;
  return 1;
}

function audit(action: string, detail: string): AuditRow {
  return { id: crypto.randomUUID(), at: Date.now(), action, detail };
}

export const useOpsStore = create<OpsState>()(
  persist(
    (set, get) => ({
      unlisted: {},
      points: {},
      credits: { ...DEFAULT_CREDITS },
      ledger: [],
      audit: [],
      adminOpen: false,
      setListed: (key, listed) =>
        set({
          unlisted: { ...get().unlisted, [key]: !listed },
          audit: [audit(listed ? "上架模型" : "下架模型", key), ...get().audit].slice(0, 200),
        }),
      setPoints: (key, points) =>
        set({
          points: { ...get().points, [key]: Math.max(0, points) },
          audit: [audit("改成本", `${key} = ${points}`), ...get().audit].slice(0, 200),
        }),
      grant: (kind, amount, reason) => {
        const next = Math.max(0, get().credits[kind] + amount);
        const row: LedgerRow = {
          id: crypto.randomUUID(),
          at: Date.now(),
          kind,
          delta: amount,
          reason,
          model: "",
          ok: true,
        };
        set({
          credits: { ...get().credits, [kind]: next },
          ledger: [row, ...get().ledger].slice(0, 200),
          audit: [audit("发放额度", `${kind} ${amount > 0 ? "+" : ""}${amount} · ${reason}`), ...get().audit].slice(0, 200),
        });
      },
      spend: (kind, model, points) => {
        const cost = Math.max(1, points || 1);
        const have = get().credits[kind];
        if (have < cost) {
          throw new Error(`额度不足：${kind} 剩余 ${have}，本次需要 ${cost}。到后台发放或升级。`);
        }
        const row: LedgerRow = {
          id: crypto.randomUUID(),
          at: Date.now(),
          kind,
          delta: -cost,
          reason: "生成",
          model,
          ok: true,
        };
        set({
          credits: { ...get().credits, [kind]: have - cost },
          ledger: [row, ...get().ledger].slice(0, 200),
        });
        return row;
      },
      refund: (id) => {
        const row = get().ledger.find((item) => item.id === id);
        if (!row || row.delta >= 0 || !row.ok) return;
        set({
          credits: { ...get().credits, [row.kind]: get().credits[row.kind] - row.delta },
          ledger: get().ledger.map((item) => (item.id === id ? { ...item, ok: false, reason: `${item.reason} · 已退还` } : item)),
        });
      },
      setAdminOpen: (open) => set({ adminOpen: open }),
      exportJson: () =>
        JSON.stringify(
          {
            unlisted: get().unlisted,
            points: get().points,
            credits: get().credits,
            ledger: get().ledger.slice(0, 50),
            audit: get().audit.slice(0, 50),
          },
          null,
          2,
        ),
    }),
    { name: "boundless-studio:ops" },
  ),
);

export function liveCard(card: ModelCard): ModelCard {
  const ops = useOpsStore.getState();
  const relays = useStudioSession.getState().relays;
  const key = catalogKey(card);
  const relay = relays.find((item) => item.id === card.providerId);
  const wired = Boolean(relay?.enabled && relay.apiKey);
  const points = ops.points[key] ?? defaultPoints(card);
  return {
    ...card,
    wired,
    cost: `${points} 点`,
  };
}

export function liveCatalog(kind?: ModelCard["kind"], generate = false) {
  const ops = useOpsStore.getState();
  return STUDIO_CATALOG.filter((item) => {
    if (kind && item.kind !== kind) return false;
    if (ops.unlisted[catalogKey(item)]) return false;
    const card = liveCard(item);
    if (generate && !card.wired) return false;
    if (generate && kind === "video" && !item.verified) return false;
    return true;
  }).map(liveCard);
}

export function modelPoints(value: string) {
  const card = STUDIO_CATALOG.find((item) => catalogKey(item) === value);
  if (!card) return 1;
  return useOpsStore.getState().points[value] ?? defaultPoints(card);
}
