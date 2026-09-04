export type ManifestRead<T> = () => Promise<readonly T[]>;
export type ManifestWrite<T> = (items: T[]) => Promise<void>;
export type ManifestUpdate<T> = (current: T[]) => T[];

type ManifestEnvelope = { items?: unknown };

export function parseManifestItems<T>(raw: string, isItem: (value: unknown) => value is T) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("作品文件索引损坏，无法解析");
  }
  const items = parsed && typeof parsed === "object" ? (parsed as ManifestEnvelope).items : undefined;
  if (!Array.isArray(items)) {
    throw new Error("作品文件索引损坏，缺少作品列表");
  }
  return items.filter(isItem);
}

/**
 * Serialize read-modify-write operations so concurrent saves cannot replace
 * each other's manifest entries. A failed operation releases the queue for the
 * next caller instead of permanently poisoning it.
 */
export function createSerializedManifestUpdater<T>(read: ManifestRead<T>, write: ManifestWrite<T>) {
  let tail: Promise<void> = Promise.resolve();

  return async (update: ManifestUpdate<T>) => {
    const run = tail.then(async () => {
      const current = [...await read()];
      const next = update(current);
      await write(next);
      return next;
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}
