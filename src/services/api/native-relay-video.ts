export type NativeRelayVideoRequest = {
  method: "GET" | "POST";
  baseUrl: string;
  apiKey?: string;
  path: string;
  body?: string;
  proxyUrl?: string;
};

export type NativeRelayVideoResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export function shouldUseNativeRelayVideo(_protocol = "") {
  return false;
}

export async function requestNativeRelayVideo<T>(_request: NativeRelayVideoRequest): Promise<NativeRelayVideoResult<T>> {
  throw new Error("Web 版通过同源代理提交视频任务，不再使用桌面原生通道");
}
