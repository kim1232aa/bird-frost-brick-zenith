/** Web stub: native Wails bindings are unavailable in the browser. */

export async function GetDesktopAPIToken(): Promise<string> {
  return "";
}

export async function FetchRelayModels(_baseUrl: string, _apiKey: string) {
  return { models: [] as string[], message: "web runtime does not use native relay discovery", status: 0 };
}

export async function FetchCivitaiServices(_apiKey: string, _offset: number, _proxyUrl: string) {
  return { status: 0, message: "web runtime does not use native Civitai fetch", body: "" };
}

export async function RequestRelayVideo(
  _method: string,
  _baseUrl: string,
  _apiKey: string,
  _path: string,
  _body: string,
  _proxyUrl: string,
) {
  return { status: 0, message: "web runtime does not use native video relay", body: "" };
}

export async function GetClientConfig() {
  return { autoCheckUpdates: false };
}

export async function GetUpdateState() {
  return { supported: false, phase: "idle" };
}

export async function CheckForUpdates() {
  return { supported: false, phase: "idle" };
}

export async function SetAutoCheckUpdates(_enabled: boolean) {
  return;
}

export async function SetUpstreamURL(_value: string) {
  return;
}

export async function StartUpdate() {
  return;
}
