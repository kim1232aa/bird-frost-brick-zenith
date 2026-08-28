"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
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
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Clapperboard,
  Eraser,
  FolderOpen,
  Hand,
  Library,
  Image as ImageIcon,
  Music2,
  Play,
  Plus,
  Save,
  Settings2,
  Redo2,
  Trash2,
  Type,
  Undo2,
  Upload,
  UserRound,
  Video,
  Wand2,
} from "lucide-react";
import { generateStudioAudio } from "@/studio/generate/audio";
import { generateStudioText } from "@/studio/generate/text";
import { generateStudioImage } from "@/studio/generate/image";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { useStudioHistory } from "@/studio/history";
import { useStudioSession } from "@/studio/session";
import { CanvasActionsProvider } from "@/studio/canvas/context";
import { cropDataUrl, splitGrid, copyImageUrl, anglePrompt, derivedViewPrompt } from "@/studio/canvas/image-edit";
import { ImageToolsDialog, type ImageToolKind } from "@/studio/canvas/image-tools-dialog";
import { canvasNodeTypes, DEFAULT_AUDIO, DEFAULT_IMAGE, DEFAULT_TEXT, DEFAULT_VIDEO } from "@/studio/canvas/nodes";
import { GRAPH_KEY, type CanvasData, type CanvasKind } from "@/studio/canvas/types";
import { storyWorkflowTemplate } from "@/studio/canvas/templates";
import { enhancePrompt, planStory } from "@/studio/story/plan";
import { characterSheetPrompt, grid9Prompt, shotImagePrompt } from "@/studio/story/prompts";
import { splitModel } from "@/studio/split";

const STORY_SEED = "雨夜码头，女警探林晚追踪一枚会发光的铜铃。克制、潮湿、霓虹，电影感写实。";

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
      if (parsed.nodes) return { nodes: parsed.nodes, edges: parsed.edges || [] };
    }
  } catch {
    /* ignore */
  }
  return { nodes: [], edges: [] };
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
  const saved = typeof window !== "undefined" ? loadGraph() : { nodes: [], edges: [] };
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
  const [drawer, setDrawer] = useState<"off" | "assets" | "library">("off");
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [imageTool, setImageTool] = useState<{ id: string; kind: ImageToolKind } | null>(null);
  const undoRef = useRef<Array<{ nodes: Node<CanvasData>[]; edges: Edge[] }>>([]);
  const redoRef = useRef<Array<{ nodes: Node<CanvasData>[]; edges: Edge[] }>>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const rfRef = useRef<ReactFlowInstance<Node<CanvasData>> | null>(null);
  const hydrated = useRef(false);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setNodes((current) => (current.length ? current : []));
    setEdges((current) => current);
  }, [setNodes, setEdges]);

  const snapshot = () => {
    undoRef.current = undoRef.current.concat([{ nodes: nodesRef.current, edges: edgesRef.current }]).slice(-30);
    redoRef.current = [];
    setHist({ undo: undoRef.current.length, redo: 0 });
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current = redoRef.current.concat([{ nodes: nodesRef.current, edges: edgesRef.current }]);
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHist({ undo: undoRef.current.length, redo: redoRef.current.length });
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = undoRef.current.concat([{ nodes: nodesRef.current, edges: edgesRef.current }]);
    setNodes(next.nodes);
    setEdges(next.edges);
    setHist({ undo: undoRef.current.length, redo: redoRef.current.length });
  };

  const removeSelected = () => {
    const ids = new Set(nodesRef.current.filter((item) => item.selected).map((item) => item.id));
    if (selected) ids.add(selected);
    if (!ids.size) return;
    snapshot();
    setNodes((items) => items.filter((item) => !ids.has(item.id)));
    setEdges((items) => items.filter((item) => !ids.has(item.source) && !ids.has(item.target)));
    setSelected(null);
  };

  const clearCanvas = () => {
    if (!nodesRef.current.length) return;
    snapshot();
    setNodes([]);
    setEdges([]);
    setSelected(null);
    localStorage.removeItem(GRAPH_KEY);
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
                ? {
                    kind,
                    text: extra?.text || STORY_SEED,
                    development: extra?.development || "",
                    textModel: DEFAULT_TEXT,
                    imageModel: DEFAULT_IMAGE,
                    videoModel: DEFAULT_VIDEO,
                    style: extra?.style || "电影感写实",
                    mode: "single" as const,
                    shotCount: extra?.shotCount || 5,
                    ratio: "16:9",
                    quality: "2K",
                    logline: "",
                    cast: [],
                    shots: [],
                    scenes: [],
                    status: "待分析",
                  }
                : kind === "audio"
                  ? { kind, prompt: extra?.prompt || "低沉旁白，潮湿港口", model: DEFAULT_AUDIO }
                  : kind === "config"
                    ? {
                        kind,
                        generationMode: extra?.generationMode || "image",
                        prompt: extra?.prompt || "",
                        model: extra?.model || DEFAULT_IMAGE,
                        ratio: extra?.ratio || "1:1",
                        size: extra?.size || "2K",
                        duration: extra?.duration || 5,
                        status: "待命",
                      }
                  : kind === "upload"
                    ? { kind, url: extra?.url, status: extra?.url ? "已上传" : "待上传" }
                    : { kind, prompt: extra?.prompt || "", model: extra?.model || DEFAULT_IMAGE, url: extra?.url, size: "2K", ratio: "1:1", ...extra };
    setNodes((items) =>
      items
        .map((item) => ({ ...item, selected: false }))
        .concat({
          id,
          type: kind,
          position: position || { x: 80 + offset, y: 72 + (kind === "video" || kind === "seedance" ? 220 : 0) },
          data,
          selected: true,
        }),
    );
    setSelected(id);
    window.setTimeout(() => rfRef.current?.fitView({ padding: 0.18, duration: 220 }), 40);
    return id;
  };

  const storyBoot = useRef(false);
  useEffect(() => {
    if (storyBoot.current) return;
    if (typeof window === "undefined" || !window.location.pathname.startsWith("/story")) return;
    storyBoot.current = true;
    const existing = nodesRef.current.find((item) => item.type === "story");
    if (existing) {
      setNodes((items) => items.map((item) => ({ ...item, selected: item.id === existing.id })));
      setSelected(existing.id);
      window.setTimeout(() => rfRef.current?.fitView({ padding: 0.16, duration: 220 }), 50);
      return;
    }
    add("story");
  }, []);

  const patchNode = (id: string, data: Partial<CanvasData>) => {
    const next = nodesRef.current.map((item) => (item.id === id ? { ...item, data: { ...item.data, ...data } } : item));
    nodesRef.current = next;
    setNodes(next);
  };

  const latest = (id: string) => nodesRef.current.find((item) => item.id === id);

  const storyRefs = (id: string) => {
    const incoming = sourcesOf(id, nodesRef.current, edgesRef.current);
    const urlOf = (handle: string) => incoming.find((item) => item.edge.targetHandle === handle)?.node.data.url;
    return {
      ref: urlOf("ref") || urlOf("in"),
      char: urlOf("char"),
      scene: urlOf("scene"),
      prop: urlOf("prop"),
    };
  };

  const sourcesOf = (id: string, snapshotNodes: Node<CanvasData>[], snapshotEdges: Edge[]) => {
    const byId = new Map(snapshotNodes.map((item) => [item.id, item]));
    return snapshotEdges
      .filter((edge) => edge.target === id)
      .map((edge) => ({ edge, node: byId.get(edge.source) }))
      .filter((item): item is { edge: Edge; node: Node<CanvasData> } => Boolean(item.node));
  };

  const analyzeStory = async (id: string) => {
    const node = latest(id);
    if (!node) return null;
    const idea = (node.data.text || "").trim();
    if (!idea) {
      setError("先在故事框里粘贴剧情");
      return null;
    }
    setBusy("分析故事…");
    setError("");
    patchNode(id, { status: "分析中" });
    try {
      const plan = await planStory({
        relays,
        idea,
        textModel: node.data.textModel,
        style: node.data.style,
        shotCount: node.data.mode === "grid9" ? Math.max(9, node.data.shotCount || 9) : node.data.shotCount,
        aspectRatio: node.data.ratio || "16:9",
      });
      snapshot();
      patchNode(id, {
        logline: plan.logline,
        development: plan.development,
        style: plan.style || node.data.style,
        scenes: plan.scenes,
        sceneBoard: plan.sceneBoard,
        cast: plan.cast,
        shots: plan.shots,
        status: "已分析",
      });
      addHistory({ kind: "story", title: idea.slice(0, 40), prompt: idea, model: splitModel(node.data.textModel || "").model, urls: [] });
      return plan;
    } catch (err) {
      const message = err instanceof Error ? err.message : "分析失败";
      setError(message);
      patchNode(id, { status: "分析失败" });
      return null;
    } finally {
      setBusy("");
    }
  };

  const generateCharacters = async (id: string, index?: number) => {
    const node = latest(id);
    if (!node?.data.cast?.length) {
      setError("先点「分析故事」，才会出现角色");
      return false;
    }
    const selection = splitModel(node.data.imageModel || DEFAULT_IMAGE);
    const next = [...node.data.cast];
    const targets = typeof index === "number" ? [index] : next.map((_, i) => i).filter((i) => !next[i].url && !next[i].locked);
    if (!targets.length) return true;
    for (const i of targets) {
      setBusy(`角色图 ${next[i].name}`);
      patchNode(id, { status: `出 ${next[i].name}` });
      try {
        const result = await generateStudioImage({
          relays,
          providerId: selection.providerId,
          model: selection.model,
          prompt: characterSheetPrompt(next[i], node.data.style || "电影感写实", Boolean(storyRefs(id).char || storyRefs(id).ref || node.data.cast?.some((person) => person.url))),
          imageUrl: storyRefs(id).char || storyRefs(id).ref,
          negativePrompt: next[i].negativePrompt,
          size: node.data.quality === "3K" ? "3K" : "2K",
        });
        next[i] = { ...next[i], url: result.url, status: "ready" };
        patchNode(id, { cast: [...next], status: "已分析" });
        const existing = nodesRef.current.find((item) => item.type === "character" && item.data.name === next[i].name);
        if (existing) patchNode(existing.id, { url: result.url, look: next[i].look, status: "已定妆" });
        addHistory({ kind: "image", title: `角色 ${next[i].name}`, prompt: next[i].look, model: result.model, urls: [result.url] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "角色图失败");
        setBusy("");
        return false;
      }
    }
    setBusy("");
    return true;
  };

  const generateShots = async (id: string, index?: number) => {
    const node = latest(id);
    if (!node?.data.shots?.length) {
      setError("先点「分析故事」，才会出现分镜");
      return false;
    }
    const selection = splitModel(node.data.imageModel || DEFAULT_IMAGE);
    const next = [...node.data.shots];
    const refPerson = node.data.cast?.find((person) => person.url);
    const ref = refPerson?.url;
    const targets = typeof index === "number" ? [index] : next.map((_, i) => i).filter((i) => !next[i].url);
    if (!targets.length && typeof index !== "number") return true;
    if (node.data.mode === "grid9") {
      const chunk = next.slice(0, 9);
      setBusy("生成9宫格分镜");
      try {
        const result = await generateStudioImage({
          relays,
          providerId: selection.providerId,
          model: selection.model,
          prompt: grid9Prompt({
            shots: chunk,
            cast: node.data.cast || [],
            scenes: node.data.sceneBoard || [],
            style: node.data.style || "电影感写实",
            aspectRatio: node.data.ratio || "16:9",
          }),
          imageUrl: ref,
          size: node.data.quality === "3K" ? "3K" : "2K",
        });
        const filled = next.map((shot, i) => (i < 9 ? { ...shot, url: result.url, status: "done" } : shot));
        patchNode(id, { shots: filled, status: "已分析" });
        addHistory({ kind: "image", title: "九宫格分镜", prompt: chunk[0]?.prompt || "", model: result.model, urls: [result.url] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "九宫格失败");
        setBusy("");
        return false;
      }
      setBusy("");
      return true;
    }
    const originX = node.position.x + 640;
    const originY = node.position.y;
    for (const i of targets) {
      setBusy(`第 ${i + 1} 镜 ${next[i].title}`);
      patchNode(id, { status: `出第 ${i + 1} 镜` });
      const appearing = next[i].appearingCharacterIds || [];
      const shotRef =
        node.data.cast?.find((person) => appearing.includes(person.id) && person.url)?.url ||
        storyRefs(id).char ||
        storyRefs(id).ref ||
        ref;
      try {
      const assembled = shotImagePrompt({
            shot: next[i],
            cast: node.data.cast || [],
            scenes: node.data.sceneBoard || [],
            style: node.data.style || "电影感写实",
            aspectRatio: node.data.ratio || "16:9",
            hasCharacterRef: Boolean(shotRef),
          });
        const result = await generateStudioImage({
          relays,
          providerId: selection.providerId,
          model: selection.model,
          prompt: assembled,
          imageUrl: shotRef,
          negativePrompt: (node.data.cast || []).map((person) => person.negativePrompt).filter(Boolean).join("；"),
          size: node.data.quality === "3K" ? "3K" : "2K",
        });
        next[i] = { ...next[i], url: result.url, status: "done" };
        patchNode(id, { shots: [...next], status: "已分析" });
        const childId = `image-shot-${id}-${i}`;
        const existing = nodesRef.current.find((item) => item.id === childId);
        if (existing) {
          patchNode(childId, { url: result.url, prompt: assembled, status: "完成" });
        } else {
          const child: Node<CanvasData> = {
            id: childId,
            type: "image",
            position: { x: originX, y: originY + i * 300 },
            data: {
              kind: "image",
              prompt: assembled,
              model: node.data.imageModel || DEFAULT_IMAGE,
              url: result.url,
              status: "完成",
              size: node.data.quality || "2K",
              ratio: node.data.ratio || "16:9",
            },
          };
          const nextNodes = nodesRef.current.concat(child);
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
          const edge: Edge = { id: `e-${id}-${childId}`, source: id, target: childId, sourceHandle: "out", targetHandle: "in", animated: true };
          const nextEdges = edgesRef.current.concat(edge);
          edgesRef.current = nextEdges;
          setEdges(nextEdges);
        }
        addHistory({ kind: "image", title: next[i].title, prompt: next[i].prompt, model: result.model, urls: [result.url] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "分镜失败");
        setBusy("");
        return false;
      }
    }
    setBusy("");
    return true;
  };

  const runAllStory = async (id: string) => {
    const analysis = await analyzeStory(id);
    if (!analysis) return;
    const charactersReady = await generateCharacters(id);
    if (!charactersReady) return;
    await generateShots(id);
  };

  const runNode = async (id: string) => {
    const snapshotNodes = nodesRef.current;
    const snapshotEdges = edgesRef.current;
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
      const mode = node.data.kind === "config" ? node.data.generationMode || "image" : node.data.kind;
      patchNode(id, { status: "生成中" });
      const selection = splitModel(
        node.data.model ||
          (mode === "video" || node.data.kind === "seedance"
            ? DEFAULT_VIDEO
            : mode === "audio"
              ? DEFAULT_AUDIO
              : DEFAULT_IMAGE),
      );
      if (mode === "audio") {
        const result = await generateStudioAudio({ relays, prompt: prompt || "ambient score", providerId: selection.providerId, model: selection.model });
        patchNode(id, { url: result.url, status: "完成" });
        return;
      }
      if (mode === "video" || node.data.kind === "seedance") {
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
        aspectRatio: node.data.ratio || "1:1",
        negativePrompt: node.data.negative,
        seed: node.data.seed ? Number(node.data.seed) : undefined,
        n: node.data.count,
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
      for (const id of topoOrder(nodesRef.current, edgesRef.current)) {
        const node = nodesRef.current.find((item) => item.id === id);
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

  const exportGraph = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "boundless-canvas.json";
    link.click();
    URL.revokeObjectURL(href);
  };

  const importGraph = (file: File) => {
    void file.text().then((text) => {
      const graph = JSON.parse(text) as { nodes: Node<CanvasData>[]; edges: Edge[] };
      if (!graph.nodes) throw new Error("不是画布 JSON");
      setNodes(graph.nodes);
      setEdges(graph.edges || []);
    }).catch((err) => setError(err instanceof Error ? err.message : "导入失败"));
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
    const node = latest(id);
    if (!node) return;
    const people = node.data.cast?.length ? node.data.cast : [{ name: "主角", look: "电影感写实，锁定外貌" }];
    snapshot();
    people.forEach((person, index) => {
      const created = add("character", { name: person.name, look: person.look, url: "url" in person ? String((person as { url?: string }).url || "") : "" }, { x: node.position.x - 460, y: node.position.y + index * 280 });
      setEdges((items) => items.concat({ id: `e-${created}-${id}-${index}`, source: created, target: id, sourceHandle: "out", targetHandle: "char", animated: true }));
    });
  };

  const duplicateNode = (id: string) => {
    const node = latest(id);
    if (!node) return;
    snapshot();
    const copyId = `${node.type}-${Date.now()}`;
    setNodes((items) =>
      items.concat({
        ...node,
        id: copyId,
        position: { x: node.position.x + 48, y: node.position.y + 48 },
        selected: true,
        data: { ...node.data },
      }).map((item) => (item.id === copyId ? item : { ...item, selected: false })),
    );
    setSelected(copyId);
  };

  const downloadNode = (id: string) => {
    const node = latest(id);
    if (!node?.data.url) return;
    const link = document.createElement("a");
    link.href = node.data.url;
    link.download = `${node.data.kind || "node"}-${id.slice(-6)}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  };

  const enhanceNode = async (id: string) => {
    const node = latest(id);
    if (!node) return;
    setBusy("润色提示词…");
    try {
      const next = await enhancePrompt({
        relays,
        prompt: node.data.prompt || node.data.text || "",
        textModel: node.data.textModel || DEFAULT_TEXT,
        kind: node.data.kind === "video" || node.data.kind === "seedance" ? "video" : "image",
      });
      patchNode(id, node.data.kind === "prompt" ? { text: next } : { prompt: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "润色失败");
    } finally {
      setBusy("");
    }
  };

  const spawnUpscale = (id: string) => {
    const node = latest(id);
    if (!node?.data.url) return;
    const created = add("upscale", { url: node.data.url, prompt: `upscale, keep identity, ${node.data.prompt || ""}`, model: node.data.model }, { x: node.position.x + 420, y: node.position.y });
    setEdges((items) => items.concat({ id: `e-${id}-${created}`, source: id, target: created, sourceHandle: "out", targetHandle: "in", animated: true }));
  };

  const copyPrompt = (id: string) => {
    const node = latest(id);
    if (!node) return;
    void navigator.clipboard.writeText(node.data.prompt || node.data.text || node.data.look || "");
    setBusy("已复制提示词");
    window.setTimeout(() => setBusy(""), 900);
  };

  const copyImage = (id: string) => {
    const node = latest(id);
    if (!node?.data.url) return;
    void copyImageUrl(node.data.url)
      .then(() => {
        setBusy("已复制图片");
        window.setTimeout(() => setBusy(""), 900);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "复制失败"));
  };

  const reversePrompt = async (id: string) => {
    const node = latest(id);
    if (!node?.data.url) return;
    setBusy("反推提示词…");
    try {
      const result = await generateStudioText({
        relays,
        imageUrl: node.data.url,
        system: "You reverse-engineer image generation prompts. Return the prompt only.",
        prompt: "Write a detailed cinematic still prompt that would recreate this image. Keep identity, wardrobe, camera, lighting and scene. No quotes.",
        model: splitModel(node.data.textModel || DEFAULT_TEXT).model,
        providerId: splitModel(node.data.textModel || DEFAULT_TEXT).providerId,
      });
      patchNode(id, { prompt: result.text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "反推失败");
    } finally {
      setBusy("");
    }
  };

  const derivedViews = async (id: string) => {
    const node = latest(id);
    if (!node) return;
    const angles = ["front", "side", "back", "portrait"] as const;
    const labels = ["正面", "侧面", "背面", "特写"];
    const selection = splitModel(node.data.model || DEFAULT_IMAGE);
    for (let index = 0; index < angles.length; index += 1) {
      setBusy(`四视图 ${labels[index]}`);
      try {
        const result = await generateStudioImage({
          relays,
          providerId: selection.providerId,
          model: selection.model,
          prompt: derivedViewPrompt(node.data.name || "角色", node.data.look || "", angles[index]),
          imageUrl: node.data.url,
          size: node.data.size || "2K",
        });
        const created = add(
          "image",
          { url: result.url, prompt: derivedViewPrompt(node.data.name || "角色", node.data.look || "", angles[index]), model: node.data.model, status: labels[index] },
          { x: node.position.x + 420, y: node.position.y + index * 280 },
        );
        setEdges((items) => items.concat({ id: `e-${id}-${created}`, source: id, target: created, sourceHandle: "out", targetHandle: "in", animated: true }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "四视图失败");
        break;
      }
    }
    setBusy("");
  };

  const openImageTool = (id: string, kind: "crop" | "mask" | "angle" | "split" | "reverse" | "derived") => {
    if (kind === "reverse") {
      void reversePrompt(id);
      return;
    }
    if (kind === "derived") {
      void derivedViews(id);
      return;
    }
    setImageTool({ id, kind });
  };

  const applyCrop = async (rect: { x: number; y: number; width: number; height: number }) => {
    if (!imageTool) return;
    const node = latest(imageTool.id);
    if (!node?.data.url) return;
    try {
      const url = await cropDataUrl(node.data.url, rect);
      patchNode(imageTool.id, { url, status: "已裁切" });
      setImageTool(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "裁切失败");
    }
  };

  const applyMask = async (edit: string) => {
    if (!imageTool) return;
    const node = latest(imageTool.id);
    if (!node?.data.url) return;
    setImageTool(null);
    setBusy("局部重绘…");
    try {
      const selection = splitModel(node.data.model || DEFAULT_IMAGE);
      const result = await generateStudioImage({
        relays,
        providerId: selection.providerId,
        model: selection.model,
        prompt: `Edit only the marked region: ${edit}. Keep identity, face, wardrobe and unmasked areas unchanged.`,
        imageUrl: node.data.url,
        size: node.data.size || "2K",
      });
      patchNode(imageTool.id, { url: result.url, status: "完成", prompt: `${node.data.prompt || ""}\n${edit}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "局部重绘失败");
    } finally {
      setBusy("");
    }
  };

  const applyAngle = async (params: { yaw: number; pitch: number; distance: number; wide: boolean }) => {
    if (!imageTool) return;
    const node = latest(imageTool.id);
    if (!node?.data.url) return;
    setImageTool(null);
    setBusy("多角度生成…");
    try {
      const selection = splitModel(node.data.model || DEFAULT_IMAGE);
      const prompt = anglePrompt(node.data.prompt || node.data.look || "", params);
      const result = await generateStudioImage({
        relays,
        providerId: selection.providerId,
        model: selection.model,
        prompt,
        imageUrl: node.data.url,
        size: node.data.size || "2K",
      });
      const created = add("image", { url: result.url, prompt, model: node.data.model, status: "多角度" }, { x: node.position.x + 420, y: node.position.y });
      setEdges((items) => items.concat({ id: `e-${node.id}-${created}`, source: node.id, target: created, sourceHandle: "out", targetHandle: "in", animated: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "多角度失败");
    } finally {
      setBusy("");
    }
  };

  const applySplit = async () => {
    if (!imageTool) return;
    const node = latest(imageTool.id);
    if (!node?.data.url) return;
    try {
      const cells = await splitGrid(node.data.url);
      setImageTool(null);
      cells.forEach((url, index) => {
        const created = add("image", { url, prompt: node.data.prompt, model: node.data.model, status: `格${index + 1}` }, { x: node.position.x + 420 + (index % 3) * 280, y: node.position.y + Math.floor(index / 3) * 280 });
        setEdges((items) => items.concat({ id: `e-${node.id}-${created}`, source: node.id, target: created, sourceHandle: "out", targetHandle: "in", animated: true }));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "切图失败");
    }
  };

  const spawnShotConfig = (id: string) => {
    const node = latest(id);
    if (!node) return;
    const board = node.data.shots?.length ? node.data.shots : [{ title: "第1镜", prompt: node.data.text || "", camera: "35mm", scene: "", characters: [] }];
    snapshot();
    board.forEach((shot, index) => {
      const created = add(
        "image",
        { prompt: shot.prompt, ratio: node.data.ratio, model: node.data.imageModel, status: shot.title, size: node.data.quality },
        { x: node.position.x + 640, y: node.position.y + index * 300 },
      );
      setEdges((items) => items.concat({ id: `e-${id}-${created}`, source: id, target: created, sourceHandle: "out", targetHandle: "in", animated: true }));
    });
  };

  const actions = useMemo(
    () => ({
      runNode,
      analyzeStory: async (id: string) => {
        await analyzeStory(id);
      },
      generateCharacters: async (id: string, index?: number) => {
        await generateCharacters(id, index);
      },
      generateShots: async (id: string, index?: number) => {
        await generateShots(id, index);
      },
      runAllStory: async (id: string) => {
        await runAllStory(id);
      },
      spawnCharacterConfig,
      spawnShotConfig,
      duplicateNode,
      downloadNode,
      enhanceNode,
      spawnUpscale,
      openImageTool,
      copyPrompt,
      copyImage,
      busy,
    }),
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
            onInit={(instance) => {
              rfRef.current = instance;
            }}
            fitView
            colorMode="dark"
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap pannable zoomable />
            <Controls />
            <Background variant={BackgroundVariant.Lines} gap={28} size={1} color="#323238" />
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
            <button type="button" title="移动/选择" onClick={() => setSelected(null)}>
              <Hand size={16} />
            </button>
            <button type="button" title="撤销" disabled={!hist.undo} onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button type="button" title="重做" disabled={!hist.redo} onClick={redo}>
              <Redo2 size={16} />
            </button>
            <i className="flow-split" />
            <button type="button" title="文本" onClick={() => add("prompt")}>
              <Type size={16} />
            </button>
            <button type="button" title="图片" onClick={() => add("image")}>
              <ImageIcon size={16} />
            </button>
            <button type="button" title="视频" onClick={() => add("video")}>
              <Video size={16} />
            </button>
            <button type="button" title="音频" onClick={() => add("audio")}>
              <Music2 size={16} />
            </button>
            <button type="button" title="生成配置" onClick={() => add("config")}>
              <Settings2 size={16} />
            </button>
            <button type="button" title="故事导演" onClick={() => add("story")}>
              <Clapperboard size={16} />
            </button>
            <button type="button" title="Seedance2 视频工作流" onClick={seedanceTemplate}>
              <Wand2 size={16} />
            </button>
            <button type="button" title="上传素材" onClick={() => add("upload")}>
              <Upload size={16} />
            </button>
            <i className="flow-split" />
            <button type="button" title="素材库" onClick={() => setDrawer("library")}>
              <Library size={16} />
            </button>
            <button type="button" title="我的素材" onClick={() => setDrawer("assets")}>
              <FolderOpen size={16} />
            </button>
            <button type="button" className="is-run" disabled={Boolean(busy) || empty} title={busy || "运行"} onClick={() => void run()}>
              <Play size={16} />
            </button>
            <button type="button" className="is-danger" title="删除选中" disabled={!selected} onClick={removeSelected}>
              <Trash2 size={16} />
            </button>
            <button type="button" className="is-danger" title="清空画布" disabled={empty} onClick={clearCanvas}>
              <Eraser size={16} />
            </button>
          </nav>
          {drawer !== "off" ? (
            <aside className="flow-drawer">
              <header>
                <b>{drawer === "assets" ? "我的素材" : "素材库"}</b>
                <button type="button" onClick={() => setDrawer("off")}>
                  关闭
                </button>
              </header>
              <div className="flow-asset-grid">
                {(drawer === "assets" ? history : history.filter((item) => item.kind === "image"))
                  .filter((item) => item.urls[0])
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flow-asset"
                      onClick={() => {
                        add(item.kind === "video" ? "video" : "upload", { url: item.urls[0], prompt: item.prompt, kind: item.kind === "video" ? "video" : "upload" });
                        setDrawer("off");
                      }}
                    >
                      {item.kind === "video" ? <video src={item.urls[0]} muted /> : <img src={item.urls[0]} alt="" />}
                      <small>{item.title}</small>
                    </button>
                  ))}
              </div>
            </aside>
          ) : null}
          {imageTool ? (
            <ImageToolsDialog
              kind={imageTool.kind}
              url={latest(imageTool.id)?.data.url || ""}
              onClose={() => setImageTool(null)}
              onCrop={(rect) => void applyCrop(rect)}
              onMask={(edit) => void applyMask(edit)}
              onAngle={(params) => void applyAngle(params)}
              onSplit={() => void applySplit()}
            />
          ) : null}
        </div>
        {selectedNode ? (
          <aside className="flow-inspector">
            <p className="studio-kicker">{selectedNode.data.kind === "story" ? "分镜台" : "NODE"}</p>
            <h2>{selectedNode.data.kind === "story" ? "故事导演" : selectedNode.data.kind}</h2>
            <p className="studio-hint">{busy || selectedNode.data.status || "点选节点后看结果。"}</p>
            {selectedNode.data.kind === "story" ? (
              <div className="story-board">
                <section>
                  <p>一句话</p>
                  <b>{selectedNode.data.logline || "还没分析"}</b>
                </section>
                <p className="sd-progress">
                  角色 {(selectedNode.data.cast || []).filter((item) => item.url).length}/{(selectedNode.data.cast || []).length} · 分镜{" "}
                  {(selectedNode.data.shots || []).filter((item) => item.url).length}/{(selectedNode.data.shots || []).length}
                </p>
                <section>
                  <p>角色资产</p>
                  {(selectedNode.data.cast || []).length ? (
                    (selectedNode.data.cast || []).map((person, index) => (
                      <div key={person.name} className="sd-row">
                        {person.url ? <img src={person.url} alt="" /> : <i />}
                        <div>
                          <b>{person.name}</b>
                          <small>{person.look?.slice(0, 42) || person.importance}</small>
                        </div>
                        <button type="button" disabled={Boolean(busy)} onClick={() => void generateCharacters(selectedNode.id, index)}>
                          {person.url ? "重做" : "出图"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <small>分析后会出现角色</small>
                  )}
                </section>
                <section>
                  <p>分镜队列</p>
                  {(selectedNode.data.shots || []).length ? (
                    (selectedNode.data.shots || []).map((shot, index) => (
                      <div key={`${shot.title}-${index}`} className="sd-row">
                        {shot.url ? <img src={shot.url} alt="" /> : <i />}
                        <div>
                          <b>
                            {index + 1}. {shot.title}
                          </b>
                          <small>{shot.camera} · {shot.status || "pending"}</small>
                        </div>
                        <button type="button" disabled={Boolean(busy)} onClick={() => void generateShots(selectedNode.id, index)}>
                          {shot.url ? "重做" : "出图"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <small>分析后会出现分镜</small>
                  )}
                </section>
                <button type="button" className="studio-primary" disabled={Boolean(busy)} onClick={() => void analyzeStory(selectedNode.id)}>
                  {busy || "分析故事"}
                </button>
                <button type="button" className="studio-ghost" disabled={Boolean(busy) || !(selectedNode.data.cast || []).length} onClick={() => void runAllStory(selectedNode.id)}>
                  一键全流程
                </button>
              </div>
            ) : (
              <>
                <dl className="flow-meta">
                  <div>
                    <dt>模型</dt>
                    <dd>{selectedNode.data.model || selectedNode.data.imageModel || selectedNode.data.textModel || "—"}</dd>
                  </div>
                  <div>
                    <dt>上游</dt>
                    <dd>{edges.filter((edge) => edge.target === selectedNode.id).length} 条连线</dd>
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
              </>
            )}
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
