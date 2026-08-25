export type CanvasWheelScrollable = Pick<HTMLElement, "scrollHeight" | "clientHeight" | "scrollTop">;

export function canScrollCanvasWheelTarget(target: CanvasWheelScrollable, deltaY: number) {
    const maximumScrollTop = target.scrollHeight - target.clientHeight;
    if (maximumScrollTop <= 1 || deltaY === 0) return false;
    if (deltaY < 0) return target.scrollTop > 0;
    return target.scrollTop < maximumScrollTop - 1;
}
