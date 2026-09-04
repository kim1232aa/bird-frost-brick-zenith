/** UUID for browser + Node. `crypto.randomUUID` is missing on insecure HTTP. */

export function createId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  const randomUUID = cryptoObj && "randomUUID" in cryptoObj ? cryptoObj.randomUUID.bind(cryptoObj) : undefined;
  if (randomUUID) return randomUUID();

  const bytes = new Uint8Array(16);
  const fill = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (typeof fill === "function") fill(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
