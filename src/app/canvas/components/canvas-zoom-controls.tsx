import type { ReactNode } from "react";
import { Compass, Focus, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Button, Modal, Tooltip } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+84px)] right-3 z-50 sm:bottom-5 sm:left-5 sm:right-auto" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex h-14 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={dockStyle}>
                <Tooltip title={isMiniMapOpen ? "关闭小地图" : "打开小地图"}>
                    <Button
                        type="text"
                        className="!h-10 !w-10 !min-w-10 !p-0 sm:!h-8 sm:!w-8 sm:!min-w-8"
                        style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                        icon={<Compass className="size-4" />}
                        onClick={onToggleMiniMap}
                        aria-label={isMiniMapOpen ? "关闭小地图" : "打开小地图"}
                    />
                </Tooltip>
                <Tooltip title="重置视图">
                    <Button type="text" className="!h-10 !w-10 !min-w-10 !p-0 sm:!h-8 sm:!w-8 sm:!min-w-8" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label="重置视图" />
                </Tooltip>
                <Tooltip title="放大/缩小画布">
                    <input
                        type="range"
                        min="5"
                        max="500"
                        step="1"
                        value={Math.round(scale * 100)}
                        className="hidden w-24 sm:block"
                        style={{ accentColor: theme.node.activeStroke }}
                        onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                        aria-label="放大/缩小画布"
                    />
                </Tooltip>
                <span className="hidden w-10 text-right text-xs tabular-nums sm:inline-block" style={{ color: theme.node.muted }}>
                    {Math.round(scale * 100)}%
                </span>
                <Tooltip title="快捷键">
                    <Button type="text" className="!h-10 !w-10 !min-w-10 !p-0 sm:!h-8 sm:!w-8 sm:!min-w-8" style={shortcutsOpen ? activeStyle : { color: theme.toolbar.item }} icon={<HelpCircle className="size-4" />} onClick={() => setShortcutsOpen(true)} aria-label="快捷键" />
                </Tooltip>
            </div>
            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut label="拖动画布" value="平移视图" />
                    <Shortcut label="滚轮" value="缩放画布" />
                    <Shortcut label="点击板块" value="出现蓝色选中框" />
                    <Shortcut label="选中板块 + Delete / Backspace" value="删除板块" />
                    <Shortcut label="Ctrl / Cmd + 拖动" value="框选多个节点" />
                    <Shortcut label="Shift / Ctrl / Cmd + 点击" value="追加选择节点" />
                    <Shortcut label="Ctrl / Cmd + A" value="全选节点" />
                    <Shortcut label="Ctrl / Cmd + C / V" value="复制 / 粘贴节点，或粘贴剪切板文本/图片" />
                    <Shortcut label="Ctrl / Cmd + D" value="复制一份选中节点" />
                    <Shortcut label="Ctrl / Cmd + Z" value="撤销" />
                    <Shortcut label="Ctrl / Cmd + Shift + Z / Y" value="重做" />
                    <Shortcut label="Ctrl / Cmd + + / -" value="放大 / 缩小" />
                    <Shortcut label="Ctrl / Cmd + 0" value="重置视图" />
                    <Shortcut label="Ctrl / Cmd + N / O" value="新建画布 / 导入素材" />
                    <Shortcut label="I / T / G" value="新增图片 / 文本 / 配置节点" />
                    <Shortcut label="V / A" value="新增视频 / 音频节点" />
                    <Shortcut label="U" value="导入素材" />
                    <Shortcut label="L / B" value="打开素材库 / 我的素材" />
                    <Shortcut label="M" value="显示或隐藏小地图" />
                    <Shortcut label="H" value="打开画布助手" />
                    <Shortcut label="?" value="打开快捷键" />
                    <Shortcut label="Delete / Backspace" value="删除选中板块或连线" />
                    <Shortcut label="Esc" value="取消选择并关闭浮层" />
                </div>
            </Modal>
        </div>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
