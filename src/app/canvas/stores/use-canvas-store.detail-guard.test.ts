import { register } from "node:module";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

// The store pulls in the server canvas functions, which boot a real database.
// This test only exercises in-memory reducer behaviour.
mock.module(new URL("../../../studio/server/canvases.ts", import.meta.url).href, {
    namedExports: {
        listServerCanvases: async () => [],
        getServerCanvas: async () => null,
        saveServerCanvas: async () => ({ ok: true }),
        deleteServerCanvases: async () => ({ ok: true }),
        loadServerCanvasById: async () => null,
    },
});

const { useCanvasStore } = await import("./use-canvas-store.ts");
type CanvasProject = import("./use-canvas-store.ts").CanvasProject;

const STUB_ID = "stub-canvas";

function stubProject(): CanvasProject {
    return {
        id: STUB_ID,
        title: "已有画布",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        detailLoaded: false,
        nodeCount: 12,
        connectionCount: 7,
        cover: null,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
}

function loadedProject(): CanvasProject {
    return {
        ...stubProject(),
        detailLoaded: true,
        nodes: [{ id: "n1", type: "image", title: "", position: { x: 0, y: 0 }, width: 10, height: 10 }] as any,
    };
}

test("updateProject leaves a list stub untouched so its empty nodes never reach the server", () => {
    useCanvasStore.setState({ projects: [stubProject()] });

    useCanvasStore.getState().updateProject(STUB_ID, { nodes: [], connections: [] });

    const project = useCanvasStore.getState().projects[0]!;
    assert.equal(project.detailLoaded, false, "stub must stay unloaded, otherwise persist would push it");
    assert.equal(project.nodeCount, 12, "server node count must survive the stub write attempt");
    assert.equal(project.updatedAt, "2026-01-01T00:00:00.000Z", "stub must not be touched at all");
});

test("updateProject still applies once the graph is loaded", () => {
    useCanvasStore.setState({ projects: [loadedProject()] });

    const nextNodes = [
        { id: "n1", type: "image", title: "", position: { x: 0, y: 0 }, width: 10, height: 10 },
        { id: "n2", type: "image", title: "", position: { x: 1, y: 1 }, width: 10, height: 10 },
    ] as any;
    useCanvasStore.getState().updateProject(STUB_ID, { nodes: nextNodes, connections: [] });

    const project = useCanvasStore.getState().projects[0]!;
    assert.equal(project.nodes.length, 2);
    assert.equal(project.nodeCount, 2);
});

test("a loaded project still refuses a bare empty-nodes patch over a non-empty graph", () => {
    useCanvasStore.setState({ projects: [loadedProject()] });

    useCanvasStore.getState().updateProject(STUB_ID, { nodes: [] });

    assert.equal(useCanvasStore.getState().projects[0]!.nodes.length, 1);
});
