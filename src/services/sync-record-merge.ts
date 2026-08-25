export type SyncTombstone = { id: string; deletedAt: string };

type SyncRecord = { id?: string } & Record<string, unknown>;

type MergeSyncRecordsInput<T extends SyncRecord> = {
    local: T[];
    remote: T[];
    localDeleted?: SyncTombstone[];
    remoteDeleted?: SyncTombstone[];
    timeKey: string;
};

export function mergeSyncRecords<T extends SyncRecord>({ local, remote, localDeleted = [], remoteDeleted = [], timeKey }: MergeSyncRecordsInput<T>) {
    const localById = recordMap(local);
    const remoteById = recordMap(remote);
    const tombstones = new Map(mergeSyncTombstones(remoteDeleted, localDeleted).map((item) => [item.id, item]));

    const records = new Map(remoteById);
    localById.forEach((item, id) => {
        const remoteItem = records.get(id);
        if (!remoteItem || recordTime(item, timeKey) >= recordTime(remoteItem, timeKey)) records.set(id, item);
    });

    tombstones.forEach((tombstone, id) => {
        const record = records.get(id);
        if (!record) return;
        if (recordTime(record, timeKey) > parseTime(tombstone.deletedAt)) {
            tombstones.delete(id);
            return;
        }
        records.delete(id);
    });

    return {
        records: [...records.values()].sort((a, b) => recordTime(b, timeKey) - recordTime(a, timeKey)),
        deleted: [...tombstones.values()].sort((a, b) => parseTime(b.deletedAt) - parseTime(a.deletedAt)),
    };
}

export function mergeSyncTombstones(...groups: SyncTombstone[][]) {
    const tombstones = new Map<string, SyncTombstone>();
    groups.flat().filter(validTombstone).forEach((item) => {
        const current = tombstones.get(item.id);
        if (!current || parseTime(item.deletedAt) > parseTime(current.deletedAt)) tombstones.set(item.id, item);
    });
    return [...tombstones.values()].sort((a, b) => parseTime(b.deletedAt) - parseTime(a.deletedAt));
}

function recordMap<T extends SyncRecord>(records: T[]) {
    const result = new Map<string, T>();
    records.forEach((record) => {
        const id = typeof record.id === "string" ? record.id.trim() : "";
        if (id) result.set(id, record);
    });
    return result;
}

function validTombstone(value: SyncTombstone) {
    return Boolean(value && typeof value.id === "string" && value.id.trim() && parseTime(value.deletedAt) > 0);
}

function recordTime(record: SyncRecord, key: string) {
    const value = record[key];
    return typeof value === "number" ? value : typeof value === "string" ? parseTime(value) : 0;
}

function parseTime(value: string) {
    return Date.parse(value || "") || 0;
}
