"use client";

import { App as AntdApp, ConfigProvider, theme } from "antd";
import CanvasPage from "@/app/canvas/workspace/canvas-client-page";

export function BoundlessCanvasWorkspace() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorBgBase: "#0f0f0f", colorText: "#efe9dd", borderRadius: 10 },
      }}
    >
      <AntdApp>
        <CanvasPage />
      </AntdApp>
    </ConfigProvider>
  );
}
