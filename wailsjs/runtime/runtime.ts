export function BrowserOpenURL(url: string) {
  if (typeof window !== "undefined" && url) window.open(url, "_blank", "noopener,noreferrer");
}

export function EventsOn(_event: string, _callback: (...args: unknown[]) => void) {
  return () => undefined;
}
