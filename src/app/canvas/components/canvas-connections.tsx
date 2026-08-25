import type { MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, STORY_DIRECTOR_INPUT_HANDLES, type CanvasConnection, type CanvasNodeData, type ConnectionHandle, type Position } from "../types";

const connectionColors: Record<CanvasNodeType, string> = {
    [CanvasNodeType.Image]: "#60a5fa",
    [CanvasNodeType.Text]: "#a78bfa",
    [CanvasNodeType.Config]: "#34d399",
    [CanvasNodeType.Video]: "#fb923c",
    [CanvasNodeType.Audio]: "#f472b6",
    [CanvasNodeType.StoryDirector]: "#f59e0b",
    [CanvasNodeType.Seedance2Workflow]: "#22d3ee",
};

export function CanvasConnectionDefs() {
    return (
        <defs>
            {Object.entries(connectionColors).map(([type, color]) => (
                <marker key={type} id={`canvas-connection-arrow-${type}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 2 2 L 10 6 L 2 10" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
            ))}
        </defs>
    );
}

export function ConnectionPath({
    connection,
    from,
    to,
    toPanelOpen = false,
    active,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    toPanelOpen?: boolean;
    active: boolean;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const start = getConnectionPoint(from, "source", false, connection.fromHandleId);
    const end = getConnectionPoint(to, "target", toPanelOpen, connection.toHandleId);
    const startX = start.x;
    const startY = start.y;
    const endX = end.x;
    const endY = end.y;
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const curvature = Math.max(80, Math.min(420, dx * 0.45 + dy * 0.12));
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
    const color = connectionColors[from.type] || theme.node.activeStroke;
    const mutedColor = active ? color : theme.node.muted;

    return (
        <g className={active ? "canvas-connection-active" : undefined}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            <path
                d={pathD}
                stroke={color}
                strokeWidth={active ? 9 : 7}
                strokeOpacity={active ? 0.18 : 0.08}
                strokeLinecap="round"
                fill="none"
                style={{ pointerEvents: "none" }}
            />
            <path
                d={pathD}
                stroke={mutedColor}
                strokeWidth={active ? 3.2 : 2.2}
                strokeOpacity={active ? 1 : 0.76}
                strokeLinecap="round"
                markerEnd={`url(#canvas-connection-arrow-${from.type})`}
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 8px ${color}88)` : undefined, pointerEvents: "none" }}
            />
            {active ? <path className="canvas-connection-flow" d={pathD} stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="10 16" fill="none" style={{ pointerEvents: "none" }} /> : null}
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target, targetHandleId, targetPanelOpen = false }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData; targetHandleId?: string | null; targetPanelOpen?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const nodeSource = getConnectionPoint(node, "source", false, handle.handleType === "source" ? handle.handleId : undefined);
    const nodeTarget = getConnectionPoint(node, "target", targetPanelOpen, handle.handleType === "target" ? handle.handleId : undefined);
    const startX = handle.handleType === "source" ? nodeSource.x : mouseWorld.x;
    const startY = handle.handleType === "source" ? nodeSource.y : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : nodeTarget.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : nodeTarget.y;
    const snappedSource = target ? getConnectionPoint(target, "source") : null;
    const snappedTarget = target ? getConnectionPoint(target, "target", targetPanelOpen, targetHandleId || undefined) : null;
    const snappedStartX = handle.handleType === "target" && snappedSource ? snappedSource.x : startX;
    const snappedStartY = handle.handleType === "target" && snappedSource ? snappedSource.y : startY;
    const snappedEndX = handle.handleType === "source" && snappedTarget ? snappedTarget.x : endX;
    const snappedEndY = handle.handleType === "source" && snappedTarget ? snappedTarget.y : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const verticalDistance = Math.abs(snappedEndY - snappedStartY);
    const curvature = Math.max(80, Math.min(420, distance * 0.45 + verticalDistance * 0.12));
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + curvature} ${snappedStartY}, ${snappedEndX - curvature} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;
    const color = connectionColors[node.type] || theme.node.activeStroke;

    return (
        <g>
            <path d={pathD} stroke={color} strokeWidth="8" strokeOpacity="0.15" strokeLinecap="round" fill="none" />
            <path className="canvas-connection-flow" d={pathD} stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" strokeDasharray="10 14" />
        </g>
    );
}

const PROMPT_PANEL_WIDTH = 500;
const PROMPT_PANEL_TOP_GAP = 16;
const PROMPT_TEXTAREA_CENTER_Y = 60;

function getConnectionPoint(node: CanvasNodeData, side: "source" | "target", promptPanelOpen = false, handleId?: string): Position {
    if (side === "target" && node.type === CanvasNodeType.StoryDirector && handleId) {
        const index = STORY_DIRECTOR_INPUT_HANDLES.findIndex((handle) => handle.id === handleId);
        if (index >= 0) {
            return {
                x: node.position.x + node.width * storyHandleLeftRatio(index),
                y: node.position.y + node.height * storyHandleTopRatio(index),
            };
        }
    }

    if (side === "target" && promptPanelOpen) {
        return {
            x: node.position.x + node.width / 2 - PROMPT_PANEL_WIDTH / 2,
            y: node.position.y + node.height + PROMPT_PANEL_TOP_GAP + PROMPT_TEXTAREA_CENTER_Y,
        };
    }

    return {
        x: side === "source" ? node.position.x + node.width : node.position.x,
        y: node.position.y + node.height / 2,
    };
}

function storyHandleTopRatio(index: number) {
    return [0.46, 0.55, 0.64, 0.73][index] || 0.55;
}

function storyHandleLeftRatio(index: number) {
    return [0, 0, 0, 0][index] || 0;
}
