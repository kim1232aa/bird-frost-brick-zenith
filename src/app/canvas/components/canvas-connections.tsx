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
                <marker key={type} id={`canvas-connection-arrow-${type}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 2.5 2 L 10 6 L 2.5 10" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
    const pathD = buildConnectionPath(start.x, start.y, end.x, end.y);
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
            <path className="canvas-connection-flow" d={pathD} stroke={color} strokeWidth={active ? 2.2 : 1.6} strokeOpacity={active ? 0.95 : 0.72} strokeLinecap="round" strokeDasharray="10 16" fill="none" style={{ pointerEvents: "none" }} />
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
    const pathD = buildConnectionPath(snappedStartX, snappedStartY, snappedEndX, snappedEndY);
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
// ConnectionHandleDot is size-12, hanging 24px outside the node, and centers a size-5 ring.
const PORT_CENTER_OUTSET = 24;
const PORT_DOT_RADIUS = 10;
// Story director row: left-3, -translate-x-full, h-10, gap-2, then a size-6 ring.
// Center of that ring is 12px (left-3) + 12px (half the ring) left of the node edge.
const STORY_PORT_CENTER_OUTSET = 24;
const STORY_PORT_DOT_RADIUS = 12;

function buildConnectionPath(startX: number, startY: number, endX: number, endY: number) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const span = Math.max(Math.abs(dx), Math.abs(dy) * 0.35, 1);
    // A fan-out from one port (the story director feeding every shot card) keeps
    // an identical horizontal span, so a curvature built from dx alone stacks
    // every line on top of the others at the source. Letting the vertical
    // distance add a bounded share spreads the bundle into a clean staircase.
    let curvature = Math.max(48, Math.min(320, span * 0.42 + Math.min(Math.abs(dy) * 0.12, 90)));
    // A back-edge (target sits left of the source) must not share one huge
    // horizontal handle — that loops through both nodes. Shorten the bulge and
    // add a vertical offset so the arc clears the cards.
    const reversed = dx < 48;
    if (reversed) {
        curvature = Math.max(36, Math.min(140, Math.abs(dx) * 0.28 + 56));
    }
    const clearance = reversed ? Math.min(96, 28 + Math.abs(dy) * 0.18 + distance * 0.04) * (dy >= 0 ? 1 : -1) : 0;
    const c1x = startX + curvature;
    const c1y = startY + clearance;
    const c2x = endX - curvature;
    const c2y = endY + clearance;
    return `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
}

function getConnectionPoint(node: CanvasNodeData, side: "source" | "target", promptPanelOpen = false, handleId?: string): Position {
    if (side === "target" && node.type === CanvasNodeType.StoryDirector && handleId) {
        const index = STORY_DIRECTOR_INPUT_HANDLES.findIndex((handle) => handle.id === handleId);
        if (index >= 0) {
            // Anchor precisely onto the center of the port ring protruding from the left edge
            const panelHeight = Math.min(780, Math.max(760, node.height || 760));
            return {
                x: node.position.x - 12,
                y: node.position.y + panelHeight * storyHandleTopRatio(index),
            };
        }
    }

    if (side === "target" && promptPanelOpen) {
        return {
            x: node.position.x + node.width / 2 - PROMPT_PANEL_WIDTH / 2,
            y: node.position.y + node.height + PROMPT_PANEL_TOP_GAP + PROMPT_TEXTAREA_CENTER_Y,
        };
    }

    const edgeX = side === "source" ? node.position.x + node.width : node.position.x;
    const centerX = side === "source" ? edgeX + PORT_CENTER_OUTSET : edgeX - PORT_CENTER_OUTSET;
    // Meet the visible dot on the rim the stroke actually arrives at. The port is
    // opaque and painted above the SVG layer, so ending on the far rim buries the
    // arrow head under it and reads as a line crossing through the port.
    return {
        x: side === "source" ? centerX + PORT_DOT_RADIUS : centerX - PORT_DOT_RADIUS,
        y: node.position.y + node.height / 2,
    };
}

function storyHandleTopRatio(index: number) {
    return [0.46, 0.55, 0.64, 0.73][index] || 0.55;
}
