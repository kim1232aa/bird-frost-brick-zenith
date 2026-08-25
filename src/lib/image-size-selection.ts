export function explicitImageSizeToAspectRatio(size: string) {
    const match = String(size || "").trim().match(/^(\d+)x(\d+)$/i);
    if (!match) return size;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return size;
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
    let x = Math.abs(Math.trunc(a));
    let y = Math.abs(Math.trunc(b));
    while (y) {
        const next = x % y;
        x = y;
        y = next;
    }
    return x || 1;
}
