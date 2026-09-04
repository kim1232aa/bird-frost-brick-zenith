import assert from "node:assert/strict";
import test from "node:test";
import { createSerializedManifestUpdater, parseManifestItems } from "./works-manifest.ts";

type Row = { id: string; urls: string[] };

function row(id: string): Row {
  return { id, urls: [`/works/${id}.png`] };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("serializes concurrent manifest read-modify-write updates", async () => {
  let persisted: Row[] = [];
  const update = createSerializedManifestUpdater<Row>(
    async () => {
      await delay(2);
      return persisted.map((item) => ({ ...item, urls: [...item.urls] }));
    },
    async (next) => {
      await delay(2);
      persisted = next;
    },
  );

  await Promise.all([
    update((current) => [row("first"), ...current]),
    update((current) => [row("second"), ...current]),
  ]);

  assert.deepEqual(persisted.map((item) => item.id), ["second", "first"]);
});

test("a failed manifest write does not poison later queued updates", async () => {
  let persisted: Row[] = [];
  let writes = 0;
  const update = createSerializedManifestUpdater<Row>(
    async () => persisted.map((item) => ({ ...item, urls: [...item.urls] })),
    async (next) => {
      writes += 1;
      if (writes === 1) throw new Error("synthetic manifest failure");
      persisted = next;
    },
  );

  await assert.rejects(update((current) => [row("failed"), ...current]), /synthetic manifest failure/);
  await update((current) => [row("recovered"), ...current]);

  assert.deepEqual(persisted.map((item) => item.id), ["recovered"]);
});

test("rejects a malformed manifest instead of treating it as an empty library", () => {
  assert.throws(
    () => parseManifestItems<Row>("{not-json", (value): value is Row => Boolean(value && typeof value === "object")),
    /作品文件索引损坏/,
  );
});
