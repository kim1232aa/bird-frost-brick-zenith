"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { catalogKey, type ModelCard } from "./catalog";
import { liveCatalog, useOpsStore } from "./ops";
import { useStudioSession } from "./session";

export function ModelMenu({
  kind,
  value,
  onChange,
  label,
  wiredOnly = false,
}: {
  kind: ModelCard["kind"];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  wiredOnly?: boolean;
}) {
  const wired = liveCatalog(kind, true);
  const all = liveCatalog(kind, false);
  const cards = wiredOnly ? (wired.length ? wired : all) : all;
  useStudioSession((state) => state.relays);
  useOpsStore((state) => state.unlisted);
  const groups = useMemo(() => {
    const map = new Map<string, ModelCard[]>();
    for (const card of cards) {
      const list = map.get(card.provider) || [];
      list.push(card);
      map.set(card.provider, list);
    }
    return [...map.entries()];
  }, [cards]);
  const current = cards.find((card) => catalogKey(card) === value) || cards[0];
  const safeValue = current ? catalogKey(current) : "";
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0, width: 320 });
  const idRef = useRef(`menu-${kind}-${Math.random().toString(36).slice(2, 8)}`);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), 420);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const below = rect.bottom + 6;
    const height = 320;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    setBox({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", onKey);
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== idRef.current) setOpen(false);
    };
    window.addEventListener("model-menu-open", closeOther);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("model-menu-open", closeOther);
    };
  }, [open]);

  const fallback = kind === "image" ? "生图模型" : kind === "video" ? "视频模型" : kind === "audio" ? "音频模型" : "文本模型";

  return (
    <div className="model-menu nodrag nowheel">
      {label === "" ? null : <span className="model-menu-label">{label || fallback}</span>}
      <button
        ref={triggerRef}
        type="button"
        className="model-menu-trigger"
        data-kind={kind}
        title={current ? `${current.provider} · ${current.model}` : "选择模型"}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) window.dispatchEvent(new CustomEvent("model-menu-open", { detail: idRef.current }));
            return next;
          });
        }}
      >
        <span className="model-menu-name">{current?.model || "选择模型"}</span>
        <span className="model-menu-vendor">{current?.provider || ""}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div ref={menuRef} className="model-menu-pop" style={{ top: box.top, left: box.left, width: box.width }} role="listbox">
              <div className="model-menu-search p-2 border-b border-stone-200 dark:border-stone-800 sticky top-0 bg-inherit z-10">
                <input
                  type="text"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 outline-none focus:border-stone-400"
                  placeholder="🔍 快速搜索模型..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {groups.length === 0 ? <p className="model-menu-empty">暂无可用模型</p> : null}
              {groups.map(([provider, list]) => {
                const filtered = filter.trim()
                  ? list.filter((c) => c.model.toLowerCase().includes(filter.toLowerCase()) || c.provider.toLowerCase().includes(filter.toLowerCase()))
                  : list;
                if (filtered.length === 0) return null;
                const isExpanded = Boolean(expandedProviders[provider]);
                const displayed = list.length > 5 && !filter.trim() && !isExpanded ? filtered.slice(0, 5) : filtered;

                return (
                  <div key={provider} className="model-menu-group">
                    <p>{provider}</p>
                    {displayed.map((card) => {
                      const key = catalogKey(card);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={key === safeValue ? "is-on" : undefined}
                          title={`${card.provider} · ${card.model}`}
                          onClick={() => {
                            onChange(key);
                            setOpen(false);
                          }}
                        >
                          <span className="model-menu-row-name">{card.model}</span>
                          <span className="model-menu-row-meta">
                            {card.wired ? "已接线" : "待接线"}
                            {card.nsfw ? " · NSFW" : ""}
                            {card.verified ? " · 已实测" : " · 未实测"}
                          </span>
                        </button>
                      );
                    })}
                    {list.length > 5 && !filter.trim() ? (
                      <button
                        type="button"
                        className="model-menu-expand-btn text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 py-1.5 px-3 w-full text-left font-medium flex items-center justify-between"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedProviders((prev) => ({ ...prev, [provider]: !prev[provider] }));
                        }}
                      >
                        <span>{isExpanded ? "▲ 收起" : `▼ 展开更多 (${list.length} 个模型)`}</span>
                        <span className="text-[10px] opacity-60">{isExpanded ? "收起折叠" : `+${list.length - 5}`}</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
