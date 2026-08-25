"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Clapperboard,
  FolderOpen,
  Image as ImageIcon,
  Music2,
  Play,
  Plus,
  Save,
  Trash2,
  Type,
  Upload,
  UserRound,
  Video,
  Wand2,
} from "lucide-react";
import { generateStudioAudio } from "@/studio/generate/audio";
import { generateStudioImage } from "@/studio/generate/image";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { useStudioHistory } from "@/studio/history";
import { useStudioSession } from "@/studio/session";
import { CanvasActionsProvider } from "@/studio/canvas/context";
import { canvasNodeTypes, DEFAULT_AUDIO, DEFAULT_IMAGE, DEFAULT_TEXT, DEFAULT_VIDEO } from "@/studio/canvas/nodes";
import { GRAPH_KEY, type CanvasData, type CanvasKind } from "@/studio/canvas/types";
import { storyWorkflowTemplate } from "@/studio/canvas/templates";
import { characterLock, draftPlan, planStory } from "@/studio/story/plan";
import { splitModel } from "@/studio/split";

function topoOrder(nodes: Node<CanvasData>[], edges: Edge[]) {
  const indeg = new Map(nodes.map((item) => [item.id, 0]));
  const adj = new Map(nodes.map((item) => [item.id, [] as string[]]));
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    indeg.set(edge.target, (indeg.get(edge.target) || 0) + 1);
  }
  const queue = nodes.filter((item) => !indeg.get(item.id)).map((item) => item.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of adj.get(id) || []) {
      const value = (indeg.get(next) || 1) - 1;
      indeg.set(next, value);
      if (value === 0) queue.push(next);
    }
  }
  for (const node of nodes) if (!order.includes(node.id)) order.push(node.id);
  return order;
}

function loadGraph(): { nodes: Node<CanvasData>[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(GRAPH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { nodes: Node<CanvasData>[]; edges: Edge[] };
      if (parsed.nodes?.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  return storyWorkflowTemplate();
}

function takeDrop(): CanvasData | null {
  try {
    const raw = localStorage.getItem("boundless-studio:canvas-drop");
    if (!raw) return null;
    localStorage.removeItem("boundless-studio:canvas-drop");
    return JSON.parse(raw) as CanvasData;
  } catch {
    return null;
  }
}

function CanvasInner() {
  const relays = useStudioSession((state) => state.relays);
  const addHistory = useStudioHistory((state) => state.add);
  const history = useStudioHistory((state) => state.items);
  const saved = typeof window !== "undefined" ? loadGraph() : storyWorkflowTemplate();
  const dropped = typeof window !== "undefined" ? takeDrop() : null;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasData>>(
    dropped
      ? [
          ...saved.nodes,
          {
            id: `${dropped.kind || "image"}-drop`,
            type: dropped.kind || "image",
            position: { x: 280, y: 160 },
            data: { ...dropped, kind: dropped.kind || "image" },
          },
        ]
      : saved.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(saved.edges);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const undoRef = useRef<Array<{ nodes: Node<CanvasData>[]; edges: Edge[] }>>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setNodes((current) => {
      if (!current.length) return storyWorkflowTemplate().nodes;
      return current.map((node) => {
        if (node.type !== "story" || (node.data.cast && node.data.cast.length)) return node;
        const plan = draftPlan(node.data.text || "", node.data.style, node.data.shotCount || 5);
        return { ...node, data: { ...node.data, ...plan, status: "待生成" } };
      });
    });
    setEdges((current) => (current.length ? current : storyWorkflowTemplate().edges));
  }, [setNodes, setEdges]);

  const snapshot = () => {
    undoRef.current = undoRef.current.concat([{ nodes, edges }]).slice(-20);
  };

  const onConnect = useCallback(
    (connection: Connection) => setEdges((items) => addEdge({ ...connection, animated: true }, items)),
    [setEdges],
  );

  const add = (kind: CanvasKind, extra?: Partial<CanvasData>, position?: { x: number; y: number }) => {
    snapshot();
    const id = `${kind}-${Date.now()}`;
    const offset = nodes.length * 24;
    const data: CanvasData =
      kind === "prompt"
        ? { kind, text: extra?.text || "cinematic still, photoreal, rainy neon dock" }
        : kind === "character"
          ? { kind, name: extra?.name || "林晚", look: extra?.look || "black trench, wet hair, sharp jaw, 30s", model: DEFAULT_IMAGE }
          : kind === "video"
            ? { kind, prompt: extra?.prompt || "slow push in, cinematic", model: DEFAULT_VIDEO, duration: 6, ratio: "16:9" }
            : kind === "seedance"
              ? { kind, prompt: extra?.prompt || "slow orbit around the subject, cinematic", model: DEFAULT_VIDEO, duration: 5, ratio: "16:9", generateAudio: true }
              : kind === "story"
                ? (() => {
                    const seed = draftPlan(extra?.text || "雨夜码头，女警探林晚追踪一枚会发光的铜铃。克制、潮湿、霓虹，电影感写实。", extra?.style || "电影感写实", extra?.shotCount || 5);
                    return {
                      kind,
                      text: extra?.text || seed.logline,
                      development: seed.development,
                      textModel: DEFAULT_TEXT,
                      imageModel: DEFAULT_IMAGE,
                      videoModel: DEFAULT_VIDEO,
                      style: seed.style,
                      mode: "single" as const,
                      shotCount: seed.shots.length,
                      ratio: "16:9",
                      quality: "2K",
                      logline: seed.logline,
                      cast: seed.cast,
                      shots: seed.shots,
                      scenes: seed.scenes,
                    };
                  })()
                : kind === "audio"
                  ? { kind, prompt: extra?.prompt || "低沉旁白，潮湿港口", model: DEFAULT_AUDIO }
                  : kind === "upload"
                    ? { kind, url: extra?.url, status: extra?.url ? "已上传" : "待上传" }
                    : { kind, prompt: extra?.prompt || "", model: extra?.model || DEFAULT_IMAGE, url: extra?.url, size: "2K", ratio: "1:1", ...extra };
    setNodes((items) =>
      items.concat({
        id,
        type: kind,
        position: position || { x: 120 + offset, y: 80 + (kind === "video" || kind === "seedance" ? 260 : 0) },
        data,
      }),
    );
    setSelected(id);
    return id;
  };

  const patchNode = (id: string, data: Partial<CanvasData>) => {
    setNodes((items) => items.map((item) => (item.id === id ? { ...item, data: { ...item.data, ...data } } : item)));
  };

  const sourcesOf = (id: string, snapshotNodes: Node<CanvasData>[], snapshotEdges: Edge[]) => {
    const byId = new Map(snapshotNodes.map((item) => [item.id, item]));
    return snapshotEdges
      .filter((edge) => edge.target === id)
      .map((edge) => ({ edge, node: byId.get(edge.source) }))
      .filter((item): item is { edge: Edge; node: Node<CanvasData> } => Boolean(item.node));
  };

  const analyzeStory = async (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    setBusy("分析故事…");
    setError("");
    try {
      const plan = await planStory({
        relays,
        idea: node.data.text || "",
        textModel: node.data.textModel,
        style: node.data.style,
        shotCount: node.data.shotCount,
      });
      snapshot();
      patchNode(id, {
        logline: plan.logline,
        development: plan.development,
        style: plan.style,
        scenes: plan.scenes,
        cast: plan.cast,
        shots: plan.shots,
        status: "已分析",
      });
      const originX = node.position.x + 520;
      const originY = node.position.y;
      const nextNodes: Node<CanvasData>[] = [];
      const nextEdges: Edge[] = [];
      plan.cast.forEach((person, index) => {
        const childId = `character-${Date.now()}-${index}`;
        nextNodes.push({
          id: childId,
          type: "character",
          position: { x: originX, y: originY + index * 240 },
          data: { kind: "character", name: person.name, look: person.look, model: node.data.imageModel || DEFAULT_IMAGE, status: person.importance },
        });
        nextEdges.push({
          id: `e-${id}-${childId}`,
          source: id,
          target: childId,
          sourceHandle: "out",
          targetHandle: "in",
          animated: true,
        });
      });
      plan.shots.forEach((shot, index) => {
        const childId = `image-shot-${Date.now()}-${index}`;
        nextNodes.push({
          id: childId,
          type: "image",
          position: { x: originX + 320, y: originY + index * 220 },
          data: {
            kind: "image",
            prompt: shot.prompt,
            model: node.data.imageModel || DEFAULT_IMAGE,
            status: shot.title,
            size: node.data.quality || "2K",
            ratio: node.data.ratio || "16:9",
          },
        });
        const character = nextNodes[index % Math.max(plan.cast.length, 1)];
        if (character && character.type === "character") {
          nextEdges.push({
            id: `e-${character.id}-${childId}`,
            source: character.id,
            target: childId,
            sourceHandle: "out",
            targetHandle: "char",
            animated: true,
          });
        }
        nextEdges.push({
          id: `e-${id}-shot-${childId}`,
          source: id,
          target: childId,
          sourceHandle: "out",
          targetHandle: "in",
          animated: true,
        });
      });
      setNodes((items) => items.concat(nextNodes));
      setEdges((items) => items.concat(nextEdges));
      addHistory({ kind: "story", title: (node.data.text || "故事").slice(0, 40), prompt: node.data.text || "", model: splitModel(node.data.textModel || "").model, urls: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
      patchNode(id, { status: "分析失败" });
    } finally {
      setBusy("");
    }
  };

  const generateCharacters = async (id: string, index?: number) => {
    const node = nodes.find((item) => item.id === id);
    if (!node?.data.cast?.length) return;
    const selection = splitModel(node.data.imageModel || DEFAULT_IMAGE);
    const next = [...node.data.cast];
    const targets = typeof index === "number" ? [index] : next.map((_, i) => i);
    for (const i of targets) {
      if (next[i].url && typeof index !== "number") continue;
      if (next[i].locked && typeof index !== "number") continue;
      setBusy(`定妆 ${next[i].name}`);
      try {
        const result = await generateStudioImage({
          relays,
          providerId: selection.providerId,
          model: selection.model,
          prompt: `character bible portrait, locked identity, studio, ${next[i].look}, name ${next[i].name}, ${node.data.style || "cinematic"}`,
          size: node.data.quality === "3K" ? "3K" : "2K",
        });
        next[i] = { ...next[i], url: result.url, status: "ready" };
        patchNode(id, { cast: [...next] });
        addHistory({ kind: "image", title: `定妆 ${next[i].name}`, prompt: next[i].look, model: result.model, urls: [result.url] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "定妆失败");
        break;
      }
    }
    setBusy("");
  };

  const generateShots = async (id: string, index?: number) => {
    const node = nodes.find((item) => item.id === id);
    if (!node?.data.shots?.length) return;
    const selection = splitModel(node.data.imageModel || DEFAULT_IMAGE);
    const bible = characterLock(node.data.cast || []);
    const next = [...node.data.shots];
    const ref = node.data.cast?.find((person) => person.url)?.url;
    const targets = typeof index === "number" ? [index] : next.map((_, i) => i);
    for (const i of targets) {
      setBusy(`分镜 ${next[i].title}`);
      try {
        const result = await generateStudioImage({
          relays,
          providerId: selection.providerId,
          model: selection.model,
          prompt: `${next[i].prompt}. Camera: ${next[i].camera}. Style: ${node.data.style || "cinematic"}. Character lock: ${bible}`,
          imageUrl: ref,
          size: node.data.quality === "3K" ? "3K" : "2K",
        });
        next[i] = { ...next[i], url: result.url, status: "done" };
        patchNode(id, { shots: [...next] });
        addHistory({ kind: "image", title: next[i].title, prompt: next[i].prompt, model: result.model, urls: [result.url] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "分镜失败");
        break;
      }
    }
    setBusy("");
  };

  const runAllStory = async (id: string) => {
    await analyzeStory(id);
    await generateCharacters(id);
    await generateShots(id);
  };

  const runNode = async (id: string) => {
    const snapshotNodes = nodes;
    const snapshotEdges = edges;
    const node = snapshotNodes.find((item) => item.id === id);
    if (!node) return;
    if (node.data.kind === "story") {
      await analyzeStory(id);
      return;
    }
    if (node.data.kind === "prompt" || node.data.kind === "upload") return;
    setBusy(`运行 ${node.data.kind}`);
    setError("");
    try {
      const incoming = sourcesOf(id, snapshotNodes, snapshotEdges);
      const byHandle = (handle?: string | null) => incoming.filter((item) => (item.edge.targetHandle || "in") === handle).map((item) => item.node);
      const promptNodes = [...byHandle("in"), ...incoming.map((item) => item.node).filter((item) => item.data.kind === "prompt" || item.data.kind === "story")];
      const characters = [...byHandle("char"), ...incoming.map((item) => item.node).filter((item) => item.data.kind === "character")];
      const images = incoming.map((item) => item.node).filter((item) => item.data.url && ["image", "upscale", "character", "upload"].includes(item.data.kind));
      const prompt = [
        promptNodes[0]?.data.text,
        characters.map((item) => `${item.data.name}, ${item.data.look}`).join("; "),
        node.data.prompt || node.data.look || node.data.text || "",
      ]
        .filter(Boolean)
        .join(", ");
      const imageUrl = images[0]?.data.url;
      patchNode(id, { status: "生成中" });
      const selection = splitModel(
        node.data.model ||
          (node.data.kind === "video" || node.data.kind === "seedance"
            ? DEFAULT_VIDEO
            : node.data.kind === "audio"
              ? DEFAULT_AUDIO
              : DEFAULT_IMAGE),
      );
      if (node.data.kind === "audio") {
        const result = await generateStudioAudio({ relays, prompt: prompt || "ambient score", providerId: selection.providerId, model: selection.model });
        patchNode(id, { url: result.url, status: "完成" });
        return;
      }
      if (node.data.kind === "video" || node.data.kind === "seedance") {
        const created = await createStudioVideo({
          relays,
          prompt: prompt || "cinematic motion",
          providerId: selection.providerId,
          model: selection.model,
          duration: node.data.duration || 6,
          aspectRatio: node.data.ratio || "16:9",
          imageUrl,
          generateAudio: node.data.generateAudio !== false,
        });
        const url = await waitStudioVideo({ relays, providerId: created.providerId, taskId: created.id, model: created.model });
        patchNode(id, { url, status: "完成" });
        addHistory({ kind: "video", title: (prompt || "画布视频").slice(0, 40), prompt, model: created.model, urls: [url] });
        return;
      }
      const result = await generateStudioImage({
        relays,
        prompt: prompt || "cinematic still",
        providerId: selection.providerId,
        model: selection.model,
        imageUrl: node.data.kind === "upscale" ? imageUrl : characters[0]?.data.url || imageUrl,
        size: node.data.size || node.data.quality || "2K",
      });
      patchNode(id, { url: result.url, status: "完成" });
      addHistory({ kind: "image", title: (prompt || "画布生图").slice(0, 40), prompt, model: result.model, urls: [result.url] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "运行失败";
      setError(message);
      patchNode(id, { status: "失败" });
    } finally {
      setBusy("");
    }
  };

  const run = async () => {
    setBusy("运行工作流…");
    setError("");
    try {
      for (const id of topoOrder(nodes, edges)) {
        const node = nodes.find((item) => item.id === id);
        if (!node) continue;
        if (node.data.kind === "story") continue;
        await runNode(id);
      }
    } finally {
      setBusy("");
    }
  };

  const save = () => {
    localStorage.setItem(GRAPH_KEY, JSON.stringify({ nodes, edges }));
    setBusy("已保存到本机");
    window.setTimeout(() => setBusy(""), 1200);
  };

  const load = () => {
    const graph = loadGraph();
    if (!graph?.nodes?.length) {
      setError("没有已保存的画布");
      return;
    }
    setNodes(graph.nodes);
    setEdges(graph.edges);
  };

  const seedanceTemplate = () => {
    snapshot();
    const uploadId = add("upload", {}, { x: 80, y: 280 });
    const seedId = add("seedance", {}, { x: 420, y: 240 });
    setEdges((items) => items.concat({ id: `e-${uploadId}-${seedId}`, source: uploadId, target: seedId, sourceHandle: "out", targetHandle: "frame", animated: true }));
  };

  const textToImage = () => {
    const promptId = add("prompt", {}, { x: 80, y: 140 });
    const imageId = add("image", {}, { x: 400, y: 120 });
    setEdges((items) => items.concat({ id: `e-${promptId}-${imageId}`, source: promptId, target: imageId, sourceHandle: "out", targetHandle: "in", animated: true }));
  };

  const spawnCharacterConfig = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    const person = node.data.cast?.[0];
    const created = add("character", { name: person?.name, look: person?.look, url: person?.url }, { x: node.position.x - 300, y: node.position.y + 80 });
    setEdges((items) => items.concat({ id: `e-${created}-${id}`, source: created, target: id, sourceHandle: "out", targetHandle: "char", animated: true, style: { stroke: "#6ea8ff" } }));
  };

  const spawnShotConfig = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    const shot = node.data.shots?.[0];
    const created = add(
      "image",
      { prompt: shot?.prompt, style: node.data.style, ratio: node.data.ratio, model: node.data.imageModel, status: "第1镜" },
      { x: node.position.x + 600, y: node.position.y - 40 },
    );
    setEdges((items) => items.concat({ id: `e-${id}-${created}`, source: id, target: created, sourceHandle: "out", targetHandle: "in", animated: true, style: { stroke: "#6ea8ff" } }));
  };

  const actions = useMemo(
    () => ({ runNode, analyzeStory, generateCharacters, generateShots, runAllStory, spawnCharacterConfig, spawnShotConfig, busy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, busy, relays],
  );

  const selectedNode = nodes.find((item) => item.id === selected);
  const empty = nodes.length === 0;

  return (
    <CanvasActionsProvider value={actions}>
      <div className={selectedNode ? "flow-shell has-inspector" : "flow-shell"}>
        <aside className="flow-side">
          <p className="studio-kicker">CANVAS</p>
          <h1>无限画布</h1>
          <p className="studio-hint">节点工作流。端口：提示 / 参考 / 角色 / 场景。故事导演会在节点内分析并展开角色和分镜。</p>
          <div className="flow-start">
            <button type="button" className="studio-ghost" onClick={() => add("prompt")}>
              <Type size={14} /> 文本
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("upload")}>
              <Upload size={14} /> 上传素材
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("character")}>
              <UserRound size={14} /> 角色定妆
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("image")}>
              <ImageIcon size={14} /> 生图
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("video")}>
              <Video size={14} /> 生视频
            </button>
            <button type="button" className="studio-ghost" onClick={seedanceTemplate}>
              <Clapperboard size={14} /> Seedance 工作流
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("story")}>
              <Wand2 size={14} /> 故事导演
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("audio")}>
              <Music2 size={14} /> 音频
            </button>
            <button type="button" className="studio-ghost" onClick={() => add("upscale")}>
              <Plus size={14} /> 放大
            </button>
          </div>
          <button type="button" className="studio-primary" disabled={Boolean(busy) || empty} onClick={() => void run()}>
            <Play size={14} /> {busy || "运行工作流"}
          </button>
          <div className="flow-start">
            <button type="button" className="studio-ghost" onClick={save}>
              <Save size={14} /> 保存
            </button>
            <button type="button" className="studio-ghost" onClick={load}>
              <FolderOpen size={14} /> 载入
            </button>
            <button
              type="button"
              className="studio-ghost"
              onClick={() => {
                snapshot();
                const next = storyWorkflowTemplate();
                setNodes(next.nodes);
                setEdges(next.edges);
              }}
            >
              <Trash2 size={14} /> 重置工作流
            </button>
          </div>
          {history.filter((item) => item.urls[0]).length ? (
            <div className="flow-assets">
              <p className="studio-kicker">我的素材</p>
              <div className="flow-asset-grid">
                {history
                  .filter((item) => item.urls[0])
                  .slice(0, 8)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flow-asset"
                      onClick={() => add(item.kind === "video" ? "video" : "upload", { url: item.urls[0], prompt: item.prompt, kind: item.kind === "video" ? "video" : "upload" })}
                    >
                      {item.kind === "video" ? <video src={item.urls[0]} muted /> : <img src={item.urls[0]} alt="" />}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="studio-error">{error}</p> : null}
        </aside>
        <div className="flow-board">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={({ nodes: next }) => setSelected(next[0]?.id || null)}
            nodeTypes={canvasNodeTypes}
            fitView
            colorMode="dark"
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background gap={22} color="#2a2a32" />
          </ReactFlow>
          {empty ? (
            <div className="flow-start-card">
              <p className="studio-kicker">START</p>
              <h2>开始创作</h2>
              <p>从一张素材、一句提示词、一个故事或 Seedance 工作流起步。</p>
              <div className="flow-start-grid">
                <button type="button" onClick={() => add("upload")}>
                  上传素材
                </button>
                <button type="button" onClick={textToImage}>
                  文生图
                </button>
                <button type="button" onClick={seedanceTemplate}>
                  Seedance
                </button>
                <button type="button" onClick={() => add("story")}>
                  故事导演
                </button>
              </div>
            </div>
          ) : null}
          <nav className="flow-toolbar">
            <button type="button" onClick={() => add("prompt")}>
              文本
            </button>
            <button type="button" onClick={() => add("image")}>
              图
            </button>
            <button type="button" onClick={() => add("video")}>
              视频
            </button>
            <button type="button" onClick={() => add("audio")}>
              音频
            </button>
            <button type="button" onClick={() => add("character")}>
              角色
            </button>
            <button type="button" onClick={() => add("story")}>
              故事
            </button>
            <button type="button" disabled={Boolean(busy) || empty} onClick={() => void run()}>
              {busy || "运行"}
            </button>
          </nav>
        </div>
        {selectedNode ? (
          <aside className="flow-inspector">
            <p className="studio-kicker">NODE</p>
            <h2>{selectedNode.data.kind}</h2>
            <p className="studio-hint">{selectedNode.data.status || "点选节点后在这里看上游绑定和结果。"}</p>
            <dl className="flow-meta">
              <div>
                <dt>模型</dt>
                <dd>{selectedNode.data.model || selectedNode.data.imageModel || selectedNode.data.textModel || "—"}</dd>
              </div>
              <div>
                <dt>上游</dt>
                <dd>{edges.filter((edge) => edge.target === selectedNode.id).length} 条连线</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{(selectedNode.data.cast || []).map((person) => person.name).join(" / ") || "无"}</dd>
              </div>
            </dl>
            {selectedNode.data.url ? (
              selectedNode.data.kind === "video" || selectedNode.data.kind === "seedance" ? (
                <video src={selectedNode.data.url} controls />
              ) : (
                <img src={selectedNode.data.url} alt="" />
              )
            ) : null}
            <button type="button" className="studio-primary" disabled={Boolean(busy)} onClick={() => void runNode(selectedNode.id)}>
              运行此节点
            </button>
          </aside>
        ) : null}
      </div>
    </CanvasActionsProvider>
  );
}

export function FlowCanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
