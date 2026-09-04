import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const componentSource = readFileSync(
  new URL("./relay-config-transfer-panel.tsx", import.meta.url),
  "utf8",
);

test("relay transfer panel keeps explicit import but exposes no secret export controls", () => {
  assert.match(componentSource, /导入 Key \/ 配置/u);
  assert.doesNotMatch(componentSource, /导出密钥包/u);
  assert.doesNotMatch(componentSource, /导出完整配置/u);
  assert.doesNotMatch(componentSource, /\bexportBundle\b|\bexportEnvelope\b/u);
  assert.doesNotMatch(componentSource, /serializeRelayKeyBundle/u);
  assert.doesNotMatch(componentSource, /serializeRelayConfigEnvelope/u);
  assert.doesNotMatch(componentSource, /导出内容含明文 Key/u);
  assert.match(componentSource, /导出安全配置/u);
  assert.match(componentSource, /browserSafeConfigEnvelope/u);
  assert.match(componentSource, /apiKey: "",\s*imageHostApiKey: ""/u);
  assert.match(componentSource, /apiKeys: undefined/u);
});
