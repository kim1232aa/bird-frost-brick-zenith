import { unzipSync, zipSync } from "fflate";

type ZipFile = {
    name: string;
    data: BlobPart;
};

export async function createZip(files: ZipFile[]) {
    const entries = await Promise.all(
        files.map(async (file) => {
            const data = new Uint8Array(await new Blob([file.data]).arrayBuffer());
            return [file.name, data] as const;
        }),
    );
    return new Blob([zipSync(Object.fromEntries(entries), { level: 0 })], { type: "application/zip" });
}

type ReadZipOptions = {
    maxArchiveBytes?: number;
    maxEntries?: number;
    maxEntryBytes?: number;
    maxExtractedBytes?: number;
};

export async function readZip(file: Blob, options: ReadZipOptions = {}) {
    const { maxArchiveBytes = 100 * 1024 * 1024, maxEntries = 10000, maxEntryBytes = 50 * 1024 * 1024, maxExtractedBytes = 500 * 1024 * 1024 } = options;

    if (file.size > maxArchiveBytes) {
        throw new Error(`压缩包文件大小 ${file.size} 字节超过上限 ${maxArchiveBytes} 字节`);
    }

    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const entryCount = Object.keys(entries).length;

    if (entryCount > maxEntries) {
        throw new Error(`压缩包条目数 ${entryCount} 超过上限 ${maxEntries}`);
    }

    let totalExtracted = 0;
    const result = new Map<string, Blob>();

    for (const [name, data] of Object.entries(entries)) {
        if (data.byteLength > maxEntryBytes) {
            throw new Error(`压缩包单项 ${name} 大小 ${data.byteLength} 字节超过上限 ${maxEntryBytes} 字节`);
        }
        totalExtracted += data.byteLength;
        if (totalExtracted > maxExtractedBytes) {
            throw new Error(`压缩包总解压大小 ${totalExtracted} 字节超过上限 ${maxExtractedBytes} 字节`);
        }
        result.set(name, new Blob([data]));
    }

    return result;
}
