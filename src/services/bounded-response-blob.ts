export async function readBoundedResponseBlob(response: Response, maxBytes: number, abort: () => void) {
    const contentLengthHeader = response.headers.get("Content-Length");
    const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
    if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
        abort();
        throw new Error(`响应文件超过 ${maxBytes} 字节上限`);
    }
    if (!response.body) {
        const file = await response.blob();
        if (file.size > maxBytes) throw new Error(`响应文件超过 ${maxBytes} 字节上限`);
        return file;
    }
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            abort();
            await reader.cancel().catch(() => undefined);
            throw new Error(`响应文件超过 ${maxBytes} 字节上限`);
        }
        chunks.push(new Uint8Array(value));
    }
    return new Blob(chunks, { type: response.headers.get("Content-Type") || "application/octet-stream" });
}
