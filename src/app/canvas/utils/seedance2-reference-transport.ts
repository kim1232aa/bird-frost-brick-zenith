export type Seedance2ReferenceTransportSource =
  | { storageKey: string; url?: never }
  | { url: string; storageKey?: never };

export type Seedance2ReferenceValueResolver = (
  source: Seedance2ReferenceTransportSource,
) => Promise<string> | string;

const LOADABLE_REFERENCE_VALUE_PATTERN = /^(https?:|data:image\/)/i;
const IMAGE_BACKEND_PATH_PATTERN = /^\/?images\//i;
const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i;

export function seedance2ReferenceTransportSource(
  value: unknown,
): Seedance2ReferenceTransportSource | null {
  const raw = String(value || "").trim();
  if (!raw || LOADABLE_REFERENCE_VALUE_PATTERN.test(raw)) return null;
  if (raw.startsWith("image:")) return { storageKey: raw };
  if (raw.startsWith("blob:")) return { url: raw };
  if (raw.startsWith("/works/") || raw.startsWith("works/") || IMAGE_BACKEND_PATH_PATTERN.test(raw)) {
    return { url: raw.startsWith("/") ? raw : `/${raw}` };
  }
  if (!hasUrlScheme(raw) && IMAGE_FILE_EXTENSION_PATTERN.test(raw)) {
    return { url: `/images/${raw.replace(/^\/+/, "")}` };
  }
  return null;
}

export async function resolveSeedance2ReferenceTransportValue(
  value: unknown,
  resolveLocalImage: Seedance2ReferenceValueResolver,
) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const source = seedance2ReferenceTransportSource(raw);
  if (!source) return raw;
  try {
    const resolved = String(await resolveLocalImage(source)).trim();
    return resolved || raw;
  } catch (error) {
    return raw;
  }
}

export type Seedance2ReferenceTransportResolution =
  | { state: "ready"; value: string }
  | { state: "empty" }
  | { state: "unresolved"; value: string; reason: string };

/**
 * The lenient resolver falls back to the raw value when the image cannot be read,
 * which turns a dead `/works/...` path into a submitted reference. Submitting a
 * reference the browser itself could not load spends a paid request on an image the
 * provider will also fail to fetch, so the caller needs the failure, not a fallback.
 */
export async function resolveSeedance2ReferenceTransportResolution(
  value: unknown,
  resolveLocalImage: Seedance2ReferenceValueResolver,
): Promise<Seedance2ReferenceTransportResolution> {
  const raw = String(value || "").trim();
  if (!raw) return { state: "empty" };
  const source = seedance2ReferenceTransportSource(raw);
  if (!source) return { state: "ready", value: raw };
  let resolved = "";
  try {
    resolved = String(await resolveLocalImage(source)).trim();
  } catch (error) {
    return {
      state: "unresolved",
      value: raw,
      reason: error instanceof Error ? error.message : "读取失败",
    };
  }
  if (!resolved) return { state: "unresolved", value: raw, reason: "读取结果为空" };
  // Resolvers that swallow their own fetch error hand back the address they were
  // given. An unchanged local address means nothing was actually loaded.
  if (resolved === raw) {
    return { state: "unresolved", value: raw, reason: "图片无法加载（地址已失效或缓存已清除）" };
  }
  return { state: "ready", value: resolved };
}

export async function hydrateSeedance2CustomerReferencesForTransport<
  T extends { value: string },
>(
  references: readonly T[],
  resolveLocalImage: Seedance2ReferenceValueResolver,
): Promise<T[]> {
  const hydrated: T[] = [];
  for (const reference of references) {
    const value = await resolveSeedance2ReferenceTransportValue(
      reference.value,
      resolveLocalImage,
    );
    if (!value) continue;
    hydrated.push({ ...reference, value });
  }
  return hydrated;
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}
