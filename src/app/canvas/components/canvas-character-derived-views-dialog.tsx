"use client";

import { Button, Modal } from "antd";
import type { CharacterDerivedViewAngle } from "../types";

export type ResolvedCharacterDerivedView = {
    id: string;
    label: string;
    angle: CharacterDerivedViewAngle;
    /** A caller-resolved transient URL. This component never resolves storage keys. */
    url: string;
};

type CanvasCharacterDerivedViewsDialogProps = {
    open: boolean;
    views: readonly ResolvedCharacterDerivedView[];
    onClose: () => void;
    onExpand: () => void;
};

export function CanvasCharacterDerivedViewsDialog({ open, views, onClose, onExpand }: CanvasCharacterDerivedViewsDialogProps) {
    return (
        <Modal title="角色角度图" open={open} onCancel={onClose} footer={null} width={760} centered destroyOnHidden>
            <div className="space-y-4">
                <p className="text-sm opacity-65">原角色设定表保留，展开不会替换原图。</p>
                <div className="grid grid-cols-2 gap-3">
                    {views.map((view) => (
                        <figure key={view.id} className="overflow-hidden rounded-xl border bg-black/5">
                            <img
                                src={view.url}
                                alt={view.label}
                                className="aspect-square w-full object-contain"
                                draggable={false}
                            />
                            <figcaption className="px-3 py-2 text-xs font-medium">{view.label}</figcaption>
                        </figure>
                    ))}
                </div>
                <div className="flex justify-end">
                    <Button type="primary" disabled={!views.length} onClick={onExpand}>展开为画布节点</Button>
                </div>
            </div>
        </Modal>
    );
}
