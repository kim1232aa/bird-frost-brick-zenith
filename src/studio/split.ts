export function splitModel(value: string) {
  const [providerId, ...rest] = (value || "").split("::");
  return { providerId: providerId || "", model: rest.join("::") };
}

export function queryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function dropToCanvas(payload: {
  kind: "image" | "video" | "upload" | "story" | "prompt";
  url?: string;
  prompt?: string;
  model?: string;
  text?: string;
}) {
  localStorage.setItem("boundless-studio:canvas-drop", JSON.stringify(payload));
}
