import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const componentSource = readFileSync(new URL("./api-access-settings-dialog.tsx", import.meta.url), "utf8");

test("API access dialog does not expose the unsupported dedicated proxy controls or copy", () => {
    assert.doesNotMatch(componentSource, /使用此中转的专属代理/u);
    assert.doesNotMatch(componentSource, /专属代理 URL/u);
    assert.doesNotMatch(componentSource, /checked=\{provider\.proxyMode === "custom"\}/u);
    assert.doesNotMatch(componentSource, /value=\{provider\.proxyUrl\}/u);
    assert.doesNotMatch(componentSource, /强制直连，不继承系统或环境代理/u);
    assert.doesNotMatch(componentSource, /代理地址只保存在本地配置/u);
});

test("API access dialog keeps provider, model, and capability configuration", () => {
    assert.match(componentSource, /协议适配器/u);
    assert.match(componentSource, /模型列表/u);
    assert.match(componentSource, /模型能力（可多选）/u);
    assert.match(componentSource, /API_CAPABILITIES\.map/u);
});
