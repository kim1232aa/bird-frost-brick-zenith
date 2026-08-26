"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { Clapperboard, Copy, Crop, Download, FileText, Image as ImageIcon, ListChecks, Play, RefreshCw, ScanSearch, Settings2, Sparkles, Zap } from "lucide-react";
import { liveCatalog } from "@/studio/ops";
import { preferredAudioKey, preferredImageKey, preferredTextKey, preferredVideoKey } from "@/studio/model-select";
import { ModelMenu } from "@/studio/model-menu";
import { useCanvasActions } from "./context";
import { STYLE_PRESETS, type CanvasData } from "./types";

export const DEFAULT_IMAGE = preferredImageKey();
export const DEFAULT_VIDEO = preferredVideoKey();
export const DEFAULT_TEXT = preferredTextKey();
export const DEFAULT_AUDIO = preferredAudioKey();

function ModelSelect({
  value,
  kind,
  onChange,
  label,
}: {
  value: string;
  kind: "image" | "video" | "text" | "audio";
  onChange: (value: string) => void;
  label?: string;
}) {
  return <ModelMenu kind={kind} value={value} onChange={onChange} label={label ?? ""} wiredOnly={false} />;
}

function ChipRow({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="chip-row nodrag nowheel">
      {options.map((item) => {
        const next = typeof item === "string" ? item : item.value;
        const label = typeof item === "string" ? item : item.label;
        return (
          <button key={next} type="button" className={value === next ? "is-active" : undefined} onClick={() => onChange(next)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Port({
  id,
  type,
  position,
  label,
  tone,
  offset,
}: {
  id: string;
  type: "source" | "target";
  position: Position;
  label: string;
  tone?: string;
  offset?: number;
}) {
  return (
    <Handle
      type={type}
      position={position}
      id={id}
      className={`flow-port flow-port-${tone || id}`}
      title={label}
      style={offset ? { top: offset } : undefined}
    />
  );
}

function NodeFrame({
  title,
  status,
  children,
  wide,
}: {
  title: string;
  status?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "flow-node flow-node-story" : "flow-node"}>
      <header className="flow-node-head">
        <b>{title}</b>
        <span>{status || "待命"}</span>
      </header>
      {children}
    </div>
  );
}

function runningStatus(status?: string) {
  return /生成中|提交|运行/.test(status || "");
}

function OrigStage({
  selected,
  status,
  error,
  children,
}: {
  selected?: boolean;
  status?: string;
  error?: string;
  children?: ReactNode;
}) {
  const running = runningStatus(status);
  const failed = status === "失败";
  return (
    <div className={`orig-stage ${selected ? "is-selected" : ""}`}>
      {running ? (
        <div className="orig-loading">
          <span className="orig-spinner" />
          <em>生成中</em>
        </div>
      ) : failed ? (
        <div className="orig-loading orig-fail">
          <em>失败</em>
          {error ? <small>{error}</small> : null}
        </div>
      ) : (
        children
      )}
      {selected ? (
        <>
          <i className="orig-dot tl" />
          <i className="orig-dot tr" />
          <i className="orig-dot bl" />
          <i className="orig-dot br" />
        </>
      ) : null}
    </div>
  );
}

export function PromptNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  return (
    <div className={`orig-node orig-text ${selected ? "is-selected" : ""}`}>
      <Port id="out" type="source" position={Position.Right} label="文本" tone="out" offset={80} />
      <OrigStage selected={selected} status={data.status}>
        <textarea
          className="orig-stage-text nodrag nowheel"
          value={data.text || ""}
          onChange={(event) => updateNodeData(id, { text: event.target.value })}
          placeholder="双击编辑文字 / 提示词"
        />
      </OrigStage>
    </div>
  );
}

export function ImageNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const running = runningStatus(data.status);
  const locked = running || Boolean(actions.busy);
  const showPanel = selected || running || !data.url;
  return (
    <div className={`orig-node ${selected ? "is-selected" : ""}`}>
      <Port id="in" type="target" position={Position.Left} label="提示" tone="in" offset={130} />
      <Port id="ref" type="target" position={Position.Top} label="参考" tone="ref" />
      <Port id="char" type="target" position={Position.Top} label="角色" tone="char" />
      <Port id="scene" type="target" position={Position.Top} label="场景" tone="scene" />
      <Port id="out" type="source" position={Position.Right} label="图像" tone="out" offset={130} />
      <OrigStage selected={selected} status={data.status}>
        {data.url ? <img src={data.url} alt="" /> : <div className="orig-empty" />}
      </OrigStage>
      {showPanel ? (
      <div className="orig-panel nodrag nowheel">
        <textarea
          rows={3}
          value={data.prompt || ""}
          onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
          placeholder="提示词"
        />
        <div className="orig-toolbar">
          <span className="orig-op">
            <ImageIcon size={14} />
            {data.url ? "编辑图片" : "生成图片"}
          </span>
          <button type="button" className="orig-go" disabled={locked} title="生成" onClick={() => void actions.runNode(id)}>
            <Zap size={14} />
          </button>
          <button type="button" className="orig-icon" disabled={locked} title="再生成" onClick={() => void actions.runNode(id)}>
            <RefreshCw size={14} />
          </button>
          <button type="button" className="orig-icon" disabled={locked} title="润色提示词" onClick={() => void actions.enhanceNode(id)}>
            <Sparkles size={14} />
          </button>
          <button type="button" className="orig-icon" title="复制节点" onClick={() => actions.duplicateNode(id)}>
            <Copy size={14} />
          </button>
          <button type="button" className="orig-icon" disabled={!data.url} title="下载" onClick={() => actions.downloadNode(id)}>
            <Download size={14} />
          </button>
        </div>
        {data.url ? (
          <div className="orig-tools nodrag">
            <button type="button" onClick={() => actions.openImageTool(id, "crop")}>裁切</button>
            <button type="button" onClick={() => actions.openImageTool(id, "mask")}>局部重绘</button>
            <button type="button" onClick={() => actions.openImageTool(id, "angle")}>多角度</button>
            <button type="button" onClick={() => actions.openImageTool(id, "split")}>切九宫格</button>
            <button type="button" onClick={() => actions.openImageTool(id, "reverse")}>反推提示词</button>
            <button type="button" onClick={() => actions.copyPrompt(id)}>复制提示词</button>
            <button type="button" onClick={() => actions.copyImage(id)}>复制图片</button>
            <button type="button" onClick={() => actions.spawnUpscale(id)}>放大</button>
          </div>
        ) : (
          <div className="orig-tools nodrag">
            <button type="button" disabled>裁切</button>
            <button type="button" disabled>局部重绘</button>
            <button type="button" disabled>多角度</button>
            <button type="button" disabled>切九宫格</button>
            <button type="button" disabled>反推提示词</button>
          </div>
        )}
        <div className="orig-model">
          <Settings2 size={14} />
          <ModelSelect value={data.model || DEFAULT_IMAGE} kind="image" onChange={(model) => updateNodeData(id, { model })} />
        </div>
        <details className="orig-params">
          <summary>图片参数</summary>
          <label>
            画幅
            <ChipRow value={data.ratio || "1:1"} options={["1:1", "16:9", "9:16", "3:4", "4:3"]} onChange={(ratio) => updateNodeData(id, { ratio })} />
          </label>
          <label>
            质量
            <ChipRow value={data.size || "2K"} options={["1K", "2K", "3K"]} onChange={(size) => updateNodeData(id, { size })} />
          </label>
          <label>
            张数
            <ChipRow value={String(data.count || 1)} options={["1", "2", "4"]} onChange={(count) => updateNodeData(id, { count: Number(count) })} />
          </label>
          <label>
            负面提示
            <input value={data.negative || ""} onChange={(event) => updateNodeData(id, { negative: event.target.value })} placeholder="不要出现的内容" />
          </label>
          <label>
            种子
            <input value={data.seed || ""} onChange={(event) => updateNodeData(id, { seed: event.target.value })} placeholder="可空" />
          </label>
          <button type="button" className="studio-ghost" disabled={!data.url || locked} onClick={() => actions.spawnUpscale(id)}>
            放大这张图
          </button>
        </details>
      </div>
      ) : null}
    </div>
  );
}

export function VideoNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const running = runningStatus(data.status);
  const locked = running || Boolean(actions.busy);
  const showPanel = selected || running || !data.url;
  return (
    <div className={`orig-node orig-video ${selected ? "is-selected" : ""}`}>
      <Port id="in" type="target" position={Position.Left} label="提示" tone="in" offset={130} />
      <Port id="frame" type="target" position={Position.Top} label="首帧" tone="ref" />
      <Port id="char" type="target" position={Position.Top} label="角色" tone="char" />
      <Port id="out" type="source" position={Position.Right} label="视频" tone="out" offset={130} />
      <OrigStage selected={selected} status={data.status}>
        {data.url ? <video src={data.url} muted controls className="nodrag" /> : <div className="orig-empty" />}
      </OrigStage>
      {showPanel ? (
      <div className="orig-panel nodrag nowheel">
        <textarea
          rows={3}
          value={data.prompt || ""}
          onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
          placeholder="镜头运动 / 对白"
        />
        <div className="orig-toolbar">
          <span className="orig-op">
            <ImageIcon size={14} />
            生成视频
          </span>
          <button type="button" className="orig-go" disabled={locked} onClick={() => void actions.runNode(id)}>
            <Zap size={14} />
          </button>
          <button type="button" className="orig-icon" disabled={locked} onClick={() => void actions.runNode(id)}>
            <RefreshCw size={14} />
          </button>
          <button type="button" className="orig-icon" disabled={locked} title="润色" onClick={() => void actions.enhanceNode(id)}>
            <Sparkles size={14} />
          </button>
          <button type="button" className="orig-icon" title="复制" onClick={() => actions.duplicateNode(id)}>
            <Copy size={14} />
          </button>
          <button type="button" className="orig-icon" disabled={!data.url} title="下载" onClick={() => actions.downloadNode(id)}>
            <Download size={14} />
          </button>
        </div>
        <div className="orig-model">
          <Settings2 size={14} />
          <ModelSelect value={data.model || DEFAULT_VIDEO} kind="video" onChange={(model) => updateNodeData(id, { model })} />
        </div>
        <div className="orig-params is-open">
          <label>
            时长
            <ChipRow
              value={String(data.duration || 6)}
              options={[4, 5, 6, 8, 10].map((item) => ({ value: String(item), label: `${item}s` }))}
              onChange={(duration) => updateNodeData(id, { duration: Number(duration) })}
            />
          </label>
          <label>
            画幅
            <ChipRow value={data.ratio || "16:9"} options={["16:9", "9:16", "1:1"]} onChange={(ratio) => updateNodeData(id, { ratio })} />
          </label>
        </div>
      </div>
      ) : null}
    </div>
  );
}

export function SeedanceNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const running = runningStatus(data.status) || /占位|生成/.test(actions.busy);
  return (
    <div className={`sd2-panel ${selected ? "is-selected" : ""}`}>
      {running ? (
        <div className="orig-busy-bar">
          <span className="orig-spinner sm" />
          生成中
        </div>
      ) : null}
      <Port id="in" type="target" position={Position.Left} label="提示" tone="in" />
      <Port id="frame" type="target" position={Position.Top} label="首帧" tone="ref" />
      <Port id="char" type="target" position={Position.Top} label="角色" tone="char" />
      <Port id="last" type="target" position={Position.Top} label="尾帧" tone="scene" />
      <header>
        <div>
          <b>Seedance2 视频工作流</b>
          <small>分镜式</small>
        </div>
      </header>
      <p className="sd2-note">使用故事导演内容和视频提示词模板，为每个分镜创建下游视频占位框。</p>
      <p className="sd2-link">已直接连接故事导演：创建或刷新时，将按故事导演的全部分镜生成视频提示词。</p>
      <div className="flow-mini-grid nodrag">
        <label>
          分镜数量
          <input value={`${data.shotCount || 1} 镜 · 跟随故事导演`} readOnly />
        </label>
        <label>
          视频模型
          <ModelSelect value={data.model || DEFAULT_VIDEO} kind="video" onChange={(model) => updateNodeData(id, { model })} />
        </label>
      </div>
      <label className="nodrag">
        文本模型
        <ModelSelect value={data.textModel || DEFAULT_TEXT} kind="text" onChange={(textModel) => updateNodeData(id, { textModel })} />
      </label>
      <section className="sd2-block">
        <p>视频设置</p>
        <label className="nodrag">
          时长
          <ChipRow
            value={String(data.duration || 5)}
            options={[4, 5, 8, 10].map((item) => ({ value: String(item), label: `约 ${item} 秒` }))}
            onChange={(duration) => updateNodeData(id, { duration: Number(duration) })}
          />
        </label>
        <small>部分接口没有 seconds 字段；失败会显示官方原文。</small>
        <label className="nodrag">
          画幅
          <ChipRow value={data.ratio || "16:9"} options={["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"]} onChange={(ratio) => updateNodeData(id, { ratio })} />
        </label>
        <label className="nodrag flow-check">
          <input type="checkbox" checked={data.generateAudio !== false} onChange={(event) => updateNodeData(id, { generateAudio: event.target.checked })} />
          生成原声
        </label>
      </section>
      <label className="nodrag">
        视频提示词模板
        <textarea
          className="nodrag nowheel"
          rows={3}
          value={data.prompt || "故事全局设定 + 当前分镜内容 + 角色/场景资产 + 参考图内容 + 上游参考帧分析 + Seedance 视频提示词模板 = 当前视频提示词"}
          onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
        />
      </label>
      {data.url ? <video src={data.url} muted controls className="nodrag" /> : null}
      <button type="button" className="nodrag sd2-cta" disabled={Boolean(actions.busy)} onClick={() => void actions.runNode(id)}>
        创建 / 刷新视频占位框
      </button>
      <Port id="out" type="source" position={Position.Right} label="视频" tone="out" />
    </div>
  );
}

export function CharacterNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const running = runningStatus(data.status);
  const locked = running || Boolean(actions.busy);
  const showPanel = selected || running || !data.url;
  return (
    <div className={`orig-node ${selected ? "is-selected" : ""}`}>
      <Port id="in" type="target" position={Position.Left} label="参考" tone="ref" offset={130} />
      <Port id="out" type="source" position={Position.Right} label="角色图" tone="char" offset={130} />
      <OrigStage selected={selected} status={data.status}>
        {data.url ? <img src={data.url} alt="" /> : <div className="orig-empty">三视图定妆</div>}
      </OrigStage>
      {showPanel ? (
        <div className="orig-panel nodrag nowheel">
          <input value={data.name || ""} placeholder="角色名" onChange={(event) => updateNodeData(id, { name: event.target.value })} />
          <textarea rows={2} value={data.look || ""} placeholder="外形 / 服装锁定" onChange={(event) => updateNodeData(id, { look: event.target.value })} />
          <div className="orig-toolbar">
            <span className="orig-op">
              <ImageIcon size={14} />
              生成定妆
            </span>
            <button type="button" className="orig-go" disabled={locked} onClick={() => void actions.runNode(id)}>
              <Zap size={14} />
            </button>
          </div>
          {data.url ? (
            <div className="orig-tools nodrag">
              <button type="button" disabled={locked} onClick={() => actions.openImageTool(id, "derived")}>
                出四视图
              </button>
              <button type="button" onClick={() => actions.openImageTool(id, "crop")}>裁切</button>
              <button type="button" onClick={() => actions.copyImage(id)}>复制图片</button>
            </div>
          ) : null}
          <div className="orig-model">
            <Settings2 size={14} />
            <ModelSelect value={data.model || DEFAULT_IMAGE} kind="image" onChange={(model) => updateNodeData(id, { model })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function UpscaleNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const running = runningStatus(data.status);
  const locked = running || Boolean(actions.busy);
  const showPanel = selected || running || !data.url;
  return (
    <div className={`orig-node ${selected ? "is-selected" : ""}`}>
      <Port id="in" type="target" position={Position.Left} label="图像" tone="in" offset={130} />
      <Port id="out" type="source" position={Position.Right} label="图像" tone="out" offset={130} />
      <OrigStage selected={selected} status={data.status}>
        {data.url ? <img src={data.url} alt="" /> : <div className="orig-empty">接一张图进来</div>}
      </OrigStage>
      {showPanel ? (
        <div className="orig-panel nodrag nowheel">
          <div className="orig-toolbar">
            <span className="orig-op">
              <ImageIcon size={14} />
              放大
            </span>
            <button type="button" className="orig-go" disabled={locked} onClick={() => void actions.runNode(id)}>
              <Zap size={14} />
            </button>
          </div>
          <div className="orig-model">
            <Settings2 size={14} />
            <ModelSelect value={data.model || DEFAULT_IMAGE} kind="image" onChange={(model) => updateNodeData(id, { model })} />
          </div>
          <details className="orig-params" open>
            <summary>图片参数</summary>
            <ChipRow value={data.size || "3K"} options={["2K", "3K"]} onChange={(size) => updateNodeData(id, { size })} />
          </details>
        </div>
      ) : null}
    </div>
  );
}

export function AudioNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const running = runningStatus(data.status);
  const locked = running || Boolean(actions.busy);
  const showPanel = selected || running || !data.url;
  return (
    <div className={`orig-node orig-audio ${selected ? "is-selected" : ""}`}>
      <Port id="in" type="target" position={Position.Left} label="文本" tone="in" offset={90} />
      <OrigStage selected={selected} status={data.status}>
        {data.url ? <audio src={data.url} controls className="nodrag" /> : <div className="orig-empty">音频</div>}
      </OrigStage>
      {showPanel ? (
        <div className="orig-panel nodrag nowheel">
          <textarea rows={3} value={data.prompt || ""} onChange={(event) => updateNodeData(id, { prompt: event.target.value })} placeholder="旁白 / 氛围" />
          <div className="orig-toolbar">
            <span className="orig-op">生成音频</span>
            <button type="button" className="orig-go" disabled={locked} onClick={() => void actions.runNode(id)}>
              <Zap size={14} />
            </button>
          </div>
          {liveCatalog("audio", false).length ? (
            <div className="orig-model">
              <Settings2 size={14} />
              <ModelSelect value={data.model || DEFAULT_AUDIO} kind="audio" onChange={(model) => updateNodeData(id, { model })} />
            </div>
          ) : (
            <small className="flow-note">运营后台接好音频模型后可选</small>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UploadNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  return (
    <div className={`orig-node ${selected ? "is-selected" : ""}`}>
      <Port id="out" type="source" position={Position.Right} label="图像" tone="out" offset={130} />
      <OrigStage selected={selected} status={data.status}>
        {data.url ? <img src={data.url} alt="" /> : <div className="orig-empty">上传素材</div>}
      </OrigStage>
      {selected || !data.url ? (
        <div className="orig-panel nodrag nowheel">
          <label className="orig-upload">
            选择图片
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => updateNodeData(id, { url: String(reader.result || ""), status: "已上传" });
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function StoryNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData, getEdges } = useReactFlow();
  const actions = useCanvasActions();
  const cast = data.cast || [];
  const shots = data.shots || [];
  const scenes = data.scenes || [];
  const missing = cast.filter((person) => !person.url && !person.locked).length;
  const analyzed = shots.length > 0 || cast.length > 0;
  const incoming = getEdges().filter((edge) => edge.target === id);
  const countPort = (handle: string) => incoming.filter((edge) => edge.targetHandle === handle).length;
  return (
    <div className={`sd-panel ${selected ? "is-selected" : ""}`}>
      {runningStatus(data.status) || actions.busy ? (
        <div className="orig-busy-bar">
          <span className="orig-spinner sm" />
          {actions.busy || data.status || "生成中"}
        </div>
      ) : null}
      <Port id="ref" type="target" position={Position.Left} label="参考" tone="ref" offset={118} />
      <Port id="char" type="target" position={Position.Left} label="角色" tone="char" offset={168} />
      <Port id="scene" type="target" position={Position.Left} label="场景" tone="scene" offset={218} />
      <Port id="prop" type="target" position={Position.Left} label="其它" tone="prop" offset={268} />
      <span className="sd-port-tag" style={{ top: 110 }}>参考</span>
      <span className="sd-port-tag" style={{ top: 160 }}>角色</span>
      <span className="sd-port-tag" style={{ top: 210 }}>场景</span>
      <span className="sd-port-tag" style={{ top: 260 }}>其它</span>
      <header className="sd-head nodrag">
        <div>
          <b>
            <Clapperboard size={16} />
            故事导演
          </b>
          <small>分析故事，生成角色资产，再按镜头批量生成分镜</small>
        </div>
        <div className="sd-head-models">
          <ModelSelect value={data.textModel || DEFAULT_TEXT} kind="text" onChange={(textModel) => updateNodeData(id, { textModel })} />
          <ModelSelect value={data.imageModel || DEFAULT_IMAGE} kind="image" onChange={(imageModel) => updateNodeData(id, { imageModel })} />
          <span className={analyzed ? "sd-pill is-on" : "sd-pill"}>{actions.busy || (analyzed ? "已分析" : "待分析")}</span>
        </div>
      </header>
      <textarea
        className="nodrag nowheel sd-story"
        value={data.text || ""}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
        placeholder="粘贴小说、章节或剧情梗概。可包含角色、场景、对白和画风要求。"
      />
      <div className="sd-5 nodrag">
        <label className="sd-field">
          画风预设
          <select value={data.style || "电影感写实"} onChange={(event) => updateNodeData(id, { style: event.target.value })}>
            {STYLE_PRESETS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="sd-field">
          模式
          <select value={data.mode || "single"} onChange={(event) => updateNodeData(id, { mode: event.target.value as "single" | "grid9" })}>
            <option value="single">逐镜生成</option>
            <option value="grid9">9宫格分镜</option>
          </select>
        </label>
        <label className="sd-field">
          镜头数
          <input
            type="number"
            min={1}
            max={99}
            value={data.shotCount || 5}
            onChange={(event) => updateNodeData(id, { shotCount: Number(event.target.value) || 5 })}
          />
        </label>
        <label className="sd-field">
          画幅
          <select value={data.ratio || "16:9"} onChange={(event) => updateNodeData(id, { ratio: event.target.value })}>
            {["16:9", "9:16", "1:1"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="sd-field">
          质量
          <select value={data.quality || "2K"} onChange={(event) => updateNodeData(id, { quality: event.target.value })}>
            {["1K", "2K", "3K"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <section className="sd-img-block nodrag">
        <p>图片生成模型与参数</p>
        <label className="sd-field">
          图片模型
          <ModelSelect value={data.imageModel || DEFAULT_IMAGE} kind="image" onChange={(imageModel) => updateNodeData(id, { imageModel })} />
        </label>
        <details className="orig-params">
          <summary>图片参数 · 尺寸 / 画幅</summary>
          <ChipRow value={data.ratio || "16:9"} options={["16:9", "9:16", "1:1"]} onChange={(ratio) => updateNodeData(id, { ratio })} />
          <ChipRow value={data.quality || "2K"} options={["1K", "2K", "3K"]} onChange={(quality) => updateNodeData(id, { quality })} />
        </details>
        <small>图片模型在本面板选择。角色图/分镜图用这里选的模型。生成还是编辑由模型能力决定。</small>
      </section>
      <div className="sd-actions nodrag">
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => void actions.runAllStory(id)}>
          {actions.busy ? <span className="orig-spinner sm" /> : <Play size={16} />}
          <b>一键全流程</b>
          <span>分析、角色图、分镜图</span>
        </button>
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => void actions.analyzeStory(id)}>
          <FileText size={16} />
          <b>分析故事</b>
          <span>生成角色/场景/分镜 JSON</span>
        </button>
        <button type="button" disabled={Boolean(actions.busy) || !cast.length} onClick={() => void actions.generateCharacters(id)}>
          <ImageIcon size={16} />
          <b>补齐缺失角色图</b>
          <span>{analyzed ? (missing ? `缺 ${missing} 个` : "角色图已齐全") : "需先分析故事"}</span>
        </button>
        <button type="button" disabled={Boolean(actions.busy) || !shots.length} onClick={() => void actions.generateShots(id)}>
          <ListChecks size={16} />
          <b>{data.mode === "grid9" ? "生成9宫格" : "生成分镜图"}</b>
          <span>{data.mode === "grid9" ? "每9镜一张" : "按镜头提交"}</span>
        </button>
      </div>
      <div className="sd-spawn nodrag">
        <button type="button" onClick={() => actions.spawnCharacterConfig(id)}>
          角色图配置节点
        </button>
        <button type="button" onClick={() => actions.spawnShotConfig(id)}>
          分镜图配置节点
        </button>
      </div>
      {analyzed && data.development ? (
        <section className="sd-block">
          <p>故事内容发展</p>
          <pre className="sd-dev">{data.development}</pre>
        </section>
      ) : null}
      {analyzed ? (
        <section className="sd-block">
          <p>一句话故事</p>
          <b className="sd-logline">{data.logline || "分析完成，但模型没返回 logline"}</b>
          <div className="sd-progress">
            进度：角色 {cast.filter((item) => item.url).length}/{cast.length || 0} · 分镜 {shots.filter((item) => item.url).length}/{shots.length || 0} · 场景 {scenes.length}
          </div>
          {scenes.length ? <small className="sd-scenes">场景：{scenes.join(" / ")}</small> : null}
        </section>
      ) : null}
      <div className="sd-tiles">
        <div>
          <small>角色</small>
          <b>
            {cast.length} 个 / 缺 {missing}
          </b>
        </div>
        <div>
          <small>场景</small>
          <b>{scenes.length} 个</b>
        </div>
        <div>
          <small>镜头</small>
          <b>{shots.length} 个</b>
        </div>
      </div>
      <section className="sd-block">
        <p>上游输入</p>
        <div className="sd-tiles sd-tiles-4">
          <div>
            <small>故事参考</small>
            <b>{countPort("ref")} 张</b>
          </div>
          <div>
            <small>角色参考</small>
            <b>{countPort("char") + cast.filter((item) => item.url).length} 张</b>
          </div>
          <div>
            <small>场景参考</small>
            <b>{countPort("scene")} 张</b>
          </div>
          <div>
            <small>其它参考</small>
            <b>{countPort("prop")} 张</b>
          </div>
        </div>
      </section>
      {cast.length ? (
        <section className="sd-block">
          <p>角色资产</p>
          {cast.map((person, index) => (
            <div key={person.name} className="sd-row">
              {person.url ? <img src={person.url} alt="" /> : <i />}
              <div>
                <b>{person.name}</b>
                <small>
                  {person.importance === "main" ? "主角" : "配角"} · {person.url ? "已出图" : "还没出图"}
                </small>
              </div>
              <button type="button" className="nodrag" disabled={Boolean(actions.busy)} onClick={() => void actions.generateCharacters(id, index)}>
                {person.url ? "重做" : "出图"}
              </button>
            </div>
          ))}
        </section>
      ) : (
        <p className="sd-foot">角色/场景/镜头会在“分析故事”成功后回填；没有上游参考图也可以直接按文案生成。</p>
      )}
      {shots.length ? (
        <section className="sd-block">
          <p>分镜队列</p>
          {shots.map((shot, index) => (
            <div key={`${shot.title}-${index}`} className="sd-row">
              {shot.url ? <img src={shot.url} alt="" /> : <i />}
              <div>
                <b>
                  {index + 1}. {shot.title}
                </b>
                <small>
                  {shot.camera} · {(shot.characters || []).join("/") || "角色未定"} · {shot.status || "pending"}
                </small>
              </div>
              <button type="button" className="nodrag" disabled={Boolean(actions.busy)} onClick={() => void actions.generateShots(id, index)}>
                {shot.url ? "重做" : "出图"}
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <Port id="out" type="source" position={Position.Right} label="分镜" tone="out" />
    </div>
  );
}

export function ConfigNode({ id, data, selected }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const mode = data.generationMode || "image";
  const locked = Boolean(actions.busy) || runningStatus(data.status);
  return (
    <div className={`sd-panel config-panel ${selected ? "is-selected" : ""}`}>
      <Port id="in" type="target" position={Position.Left} label="输入" tone="in" offset={90} />
      <Port id="ref" type="target" position={Position.Top} label="参考" tone="ref" />
      <Port id="out" type="source" position={Position.Right} label="输出" tone="out" offset={90} />
      <header className="sd-head nodrag">
        <div>
          <b>
            <Settings2 size={16} />
            生成配置
          </b>
          <small>原版配置节点：接文本/参考图，选模式后生成</small>
        </div>
        <span className="sd-pill">{data.status || "待命"}</span>
      </header>
      <div className="chip-row nodrag">
        {(["image", "video", "audio"] as const).map((item) => (
          <button key={item} type="button" className={mode === item ? "is-active" : undefined} onClick={() => updateNodeData(id, { generationMode: item, kind: "config" })}>
            {item === "image" ? "生图" : item === "video" ? "生视频" : "音频"}
          </button>
        ))}
      </div>
      <textarea
        className="sd-story nodrag nowheel"
        style={{ height: 88, minHeight: 72 }}
        value={data.prompt || ""}
        onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
        placeholder="提示词，可接上游文本"
      />
      <label className="sd-field nodrag">
        模型
        <ModelSelect
          value={data.model || (mode === "video" ? DEFAULT_VIDEO : mode === "audio" ? DEFAULT_AUDIO : DEFAULT_IMAGE)}
          kind={mode === "audio" ? "audio" : mode}
          onChange={(model) => updateNodeData(id, { model })}
        />
      </label>
      {mode === "image" ? (
        <>
          <ChipRow value={data.ratio || "1:1"} options={["1:1", "16:9", "9:16"]} onChange={(ratio) => updateNodeData(id, { ratio })} />
          <ChipRow value={data.size || "2K"} options={["1K", "2K", "3K"]} onChange={(size) => updateNodeData(id, { size })} />
        </>
      ) : null}
      {mode === "video" ? (
        <ChipRow
          value={String(data.duration || 5)}
          options={[4, 5, 6, 8, 10].map((item) => ({ value: String(item), label: `${item}s` }))}
          onChange={(duration) => updateNodeData(id, { duration: Number(duration) })}
        />
      ) : null}
      <button type="button" className="studio-primary nodrag" disabled={locked} onClick={() => void actions.runNode(id)}>
        {locked ? actions.busy || "生成中" : "生成"}
      </button>
    </div>
  );
}

export const canvasNodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  video: VideoNode,
  character: CharacterNode,
  upscale: UpscaleNode,
  story: StoryNode,
  audio: AudioNode,
  upload: UploadNode,
  seedance: SeedanceNode,
  config: ConfigNode,
};
