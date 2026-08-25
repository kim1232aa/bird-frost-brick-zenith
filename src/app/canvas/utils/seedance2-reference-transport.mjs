const LOADABLE_REFERENCE_VALUE_PATTERN = /^(https?:|data:image\/)/i;
const IMAGE_BACKEND_PATH_PATTERN = /^\/?images\//i;
const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i;

export function seedance2ReferenceTransportSource(value) {
  const raw = String(value || "").trim();
  if (!raw || LOADABLE_REFERENCE_VALUE_PATTERN.test(raw)) return null;
  if (raw.startsWith("image:")) return { storageKey: raw };
  if (raw.startsWith("blob:")) return { url: raw };
  if (IMAGE_BACKEND_PATH_PATTERN.test(raw)) {
    return { url: raw.startsWith("/") ? raw : `/${raw}` };
  }
  if (!hasUrlScheme(raw) && IMAGE_FILE_EXTENSION_PATTERN.test(raw)) {
    return { url: `/images/${raw.replace(/^\/+/, "")}` };
  }
  return null;
}

export async function resolveSeedance2ReferenceTransportValue(
  value,
  resolveLocalImage,
) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const source = seedance2ReferenceTransportSource(raw);
  if (!source) return raw;
  return String(await resolveLocalImage(source)).trim();
}

export async function hydrateSeedance2CustomerReferencesForTransport(
  references,
  resolveLocalImage,
) {
  const hydrated = [];
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

function hasUrlScheme(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}
