import assert from "node:assert/strict";
import test from "node:test";
import {
    buildAuthHeaders,
    inferCapabilityFromModelName,
    rejectUnsupportedCustomRelayProxy,
    resolveUniqueModelOwner,
} from "./api-relay-model-inference.ts";

test("wan image suffixes classify as image before generic wan video matching", () => {
    assert.equal(inferCapabilityFromModelName("wan2.6-t2i"), "image");
    assert.equal(inferCapabilityFromModelName("wan2.7-image"), "image");
    assert.equal(inferCapabilityFromModelName("wan2.6-i2i"), "image");
    assert.equal(inferCapabilityFromModelName("wan2.7-t2v"), "video");
    assert.equal(inferCapabilityFromModelName("wan2.6"), "video");
    assert.equal(inferCapabilityFromModelName("wan-image-to-video"), "video");
});

test("buildAuthHeaders honors Key and x-api-key schemes", () => {
    assert.deepEqual(buildAuthHeaders("secret", "Key"), { Authorization: "Key secret" });
    assert.deepEqual(buildAuthHeaders("secret", "x-api-key"), { "x-api-key": "secret" });
    assert.deepEqual(buildAuthHeaders("secret", "Bearer"), { Authorization: "Bearer secret" });
    assert.deepEqual(buildAuthHeaders("secret"), { Authorization: "Bearer secret" });
    assert.deepEqual(buildAuthHeaders(""), {});
});

test("plain model names with multiple owners are ambiguous", () => {
    const resolution = resolveUniqueModelOwner([{ id: "a" }, { id: "b" }]);
    assert.equal(resolution.status, "ambiguous");
    if (resolution.status === "ambiguous") {
        assert.equal(resolution.owners.length, 2);
    }
    const unique = resolveUniqueModelOwner([{ id: "a" }]);
    assert.equal(unique.status, "resolved");
    const empty = resolveUniqueModelOwner([]);
    assert.equal(empty.status, "empty");
});

test("custom proxy mode is rejected when the server does not implement it", () => {
    assert.throws(
        () => rejectUnsupportedCustomRelayProxy("custom"),
        /尚未由服务端安全实现/,
    );
    assert.doesNotThrow(() => rejectUnsupportedCustomRelayProxy("direct"));
    assert.doesNotThrow(() => rejectUnsupportedCustomRelayProxy(undefined));
});
