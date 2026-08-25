"use client";

import { App as AntdApp, ConfigProvider, theme } from "antd";
import CanvasHomePage from "@/app/canvas/home/page";

export function BoundlessCanvasHome() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorBgBase: "#0f0f0f", colorText: "#efe9dd", borderRadius: 10 },
      }}
    >
      <AntdApp>
        <CanvasHomePage />
      </AntdApp>
    </ConfigProvider>
  );
}
