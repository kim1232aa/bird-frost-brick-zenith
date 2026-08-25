"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { catalogKey } from "@/studio/catalog";
import { liveCatalog } from "@/studio/ops";
import { preferredAudioKey, preferredImageKey, preferredTextKey, preferredVideoKey } from "@/studio/model-select";
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
}: {
  value: string;
  kind: "image" | "video" | "text" | "audio";
  onChange: (value: string) => void;
}) {
  const list = liveCatalog(kind, kind !== "audio");
  return (
    <select className="nodrag nowheel" value={value} onChange={(event) => onChange(event.target.value)}>
      {list.map((card) => (
        <option key={catalogKey(card)} value={catalogKey(card)}>
          {card.provider} · {card.model}
          {card.nsfw ? " · NSFW" : ""}
        </option>
      ))}
    </select>
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

export function PromptNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  return (
    <NodeFrame title="文本" status={data.status}>
      <textarea
        className="nodrag nowheel"
        rows={5}
        value={data.text || ""}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
        placeholder="提示词 / 旁白"
      />
      <Port id="out" type="source" position={Position.Right} label="文本" tone="out" />
    </NodeFrame>
  );
}

export function ImageNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  return (
    <div className="shot-frame">
      <Port id="in" type="target" position={Position.Left} label="提示" tone="in" />
      <Port id="ref" type="target" position={Position.Top} label="参考" tone="ref" />
      <Port id="char" type="target" position={Position.Top} label="角色" tone="char" />
      <Port id="scene" type="target" position={Position.Top} label="场景" tone="scene" />
      <div className="shot-frame-media">
        {data.url ? <img src={data.url} alt="" /> : <div className="shot-empty">第1镜</div>}
        <span>{data.status || "待生成"}</span>
      </div>
      <p className="shot-frame-cap">画面比例 {data.ratio || "16:9"}，{data.style || "电影感写实"}。</p>
      <label className="nodrag">
        图片模型
        <ModelSelect value={data.model || DEFAULT_IMAGE} kind="image" onChange={(model) => updateNodeData(id, { model })} />
      </label>
      <div className="flow-mini-grid nodrag">
        <label>
          画幅
          <select className="nodrag nowheel" value={data.ratio || "1:1"} onChange={(event) => updateNodeData(id, { ratio: event.target.value })}>
            {["1:1", "16:9", "9:16", "3:4", "4:3"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          质量
          <select className="nodrag nowheel" value={data.size || "2K"} onChange={(event) => updateNodeData(id, { size: event.target.value })}>
            {["1K", "2K", "3K"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="nodrag nowheel"
        rows={2}
        value={data.prompt || ""}
        onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
        placeholder="最高优先人物数量规则 / 镜头描述"
      />
      <button type="button" className="nodrag flow-node-run" disabled={Boolean(actions.busy)} onClick={() => void actions.runNode(id)}>
        编辑图片
      </button>
      <Port id="out" type="source" position={Position.Right} label="图像" tone="out" />
    </div>
  );
}

export function VideoNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  return (
    <NodeFrame title="生视频" status={data.status}>
      <Port id="in" type="target" position={Position.Left} label="提示" tone="in" />
      <Port id="frame" type="target" position={Position.Top} label="首帧" tone="ref" />
      <Port id="char" type="target" position={Position.Top} label="角色" tone="char" />
      <label className="nodrag">
        模型
        <ModelSelect value={data.model || DEFAULT_VIDEO} kind="video" onChange={(model) => updateNodeData(id, { model })} />
      </label>
      <div className="flow-mini-grid nodrag">
        <label>
          时长
          <select className="nodrag nowheel" value={String(data.duration || 6)} onChange={(event) => updateNodeData(id, { duration: Number(event.target.value) })}>
            {[4, 5, 6, 8, 10].map((item) => (
              <option key={item} value={item}>
                {item}s
              </option>
            ))}
          </select>
        </label>
        <label>
          画幅
          <select className="nodrag nowheel" value={data.ratio || "16:9"} onChange={(event) => updateNodeData(id, { ratio: event.target.value })}>
            {["16:9", "9:16", "1:1", "adaptive"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="nodrag nowheel"
        rows={3}
        value={data.prompt || ""}
        onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
        placeholder="镜头运动 / 对白"
      />
      {data.url ? <video src={data.url} muted controls className="nodrag" /> : <div className="flow-empty">未生成</div>}
      <button type="button" className="nodrag flow-node-run" disabled={Boolean(actions.busy)} onClick={() => void actions.runNode(id)}>
        运行此节点
      </button>
      <Port id="out" type="source" position={Position.Right} label="视频" tone="out" />
    </NodeFrame>
  );
}

export function SeedanceNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  return (
    <div className="sd2-panel">
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
          <select className="nodrag nowheel" value={String(data.duration || 5)} onChange={(event) => updateNodeData(id, { duration: Number(event.target.value) })}>
            {[4, 5, 8, 10].map((item) => (
              <option key={item} value={item}>
                约 {item} 秒
              </option>
            ))}
          </select>
        </label>
        <small>部分接口没有 seconds 字段；以 num_frames / frame_rate 的四舍五入结果显示，不会把 duration 发给不支持的 API。</small>
        <label className="nodrag">
          画幅
          <select className="nodrag nowheel" value={data.ratio || "16:9"} onChange={(event) => updateNodeData(id, { ratio: event.target.value })}>
            {["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
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

export function CharacterNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const views = [data.url, data.url, data.url].filter(Boolean);
  return (
    <div className="char-sheet">
      <Port id="in" type="target" position={Position.Left} label="参考" tone="ref" />
      <div className="char-sheet-views">
        {views.length ? views.map((url, index) => <img key={index} src={url} alt="" />) : <div className="shot-empty">三视图定妆</div>}
      </div>
      <div className="char-sheet-meta">
        <b>{data.name || "未命名角色"}</b>
        <small>{views.length ? `${views.length} 个角度` : "待定妆"}</small>
      </div>
      <input className="nodrag nowheel" value={data.name || ""} placeholder="名字" onChange={(event) => updateNodeData(id, { name: event.target.value })} />
      <textarea className="nodrag nowheel" rows={2} value={data.look || ""} placeholder="外形 / 服装锁定" onChange={(event) => updateNodeData(id, { look: event.target.value })} />
      <label className="nodrag">
        定妆模型
        <ModelSelect value={data.model || DEFAULT_IMAGE} kind="image" onChange={(model) => updateNodeData(id, { model })} />
      </label>
      <button type="button" className="nodrag flow-node-run" disabled={Boolean(actions.busy)} onClick={() => void actions.runNode(id)}>
        生成定妆
      </button>
      <Port id="out" type="source" position={Position.Right} label="角色图" tone="char" />
    </div>
  );
}

export function UpscaleNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  return (
    <NodeFrame title="放大" status={data.status}>
      <Port id="in" type="target" position={Position.Left} label="图像" tone="in" />
      <label className="nodrag">
        模型
        <ModelSelect value={data.model || DEFAULT_IMAGE} kind="image" onChange={(model) => updateNodeData(id, { model })} />
      </label>
      <label className="nodrag">
        目标
        <select className="nodrag nowheel" value={data.size || "3K"} onChange={(event) => updateNodeData(id, { size: event.target.value })}>
          {["2K", "3K"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      {data.url ? <img src={data.url} alt="" /> : <div className="flow-empty">接一张图进来</div>}
      <button type="button" className="nodrag flow-node-run" disabled={Boolean(actions.busy)} onClick={() => void actions.runNode(id)}>
        放大
      </button>
      <Port id="out" type="source" position={Position.Right} label="图像" tone="out" />
    </NodeFrame>
  );
}

export function AudioNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  return (
    <NodeFrame title="音频" status={data.status}>
      <Port id="in" type="target" position={Position.Left} label="文本" tone="in" />
      {liveCatalog("audio", false).length ? (
        <label className="nodrag">
          模型
          <ModelSelect value={data.model || DEFAULT_AUDIO} kind="audio" onChange={(model) => updateNodeData(id, { model })} />
        </label>
      ) : (
        <span className="flow-note">接线页填阿里云 Token Plan 后可用</span>
      )}
      <textarea
        className="nodrag nowheel"
        rows={3}
        value={data.prompt || ""}
        onChange={(event) => updateNodeData(id, { prompt: event.target.value })}
      />
      {data.url ? <audio src={data.url} controls className="nodrag" /> : <div className="flow-empty">未生成</div>}
      <button type="button" className="nodrag flow-node-run" disabled={Boolean(actions.busy)} onClick={() => void actions.runNode(id)}>
        生成音频
      </button>
    </NodeFrame>
  );
}

export function UploadNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  return (
    <NodeFrame title="素材" status={data.status || (data.url ? "已上传" : "待上传")}>
      <input
        className="nodrag"
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
      {data.url ? <img src={data.url} alt="" /> : <div className="flow-empty">上传参考图 / 角色图</div>}
      <Port id="out" type="source" position={Position.Right} label="图像" tone="out" />
    </NodeFrame>
  );
}

export function StoryNode({ id, data }: NodeProps<Node<CanvasData>>) {
  const { updateNodeData } = useReactFlow();
  const actions = useCanvasActions();
  const cast = data.cast || [];
  const shots = data.shots || [];
  const scenes = data.scenes || [];
  const missing = cast.filter((person) => !person.url && !person.locked).length;
  const analyzed = Boolean(data.development || shots.length || cast.length);
  return (
    <div className="sd-panel">
      <Port id="ref" type="target" position={Position.Left} label="参考" tone="ref" offset={96} />
      <Port id="char" type="target" position={Position.Left} label="角色" tone="char" offset={148} />
      <Port id="scene" type="target" position={Position.Left} label="场景" tone="scene" offset={200} />
      <Port id="prop" type="target" position={Position.Left} label="其它" tone="prop" offset={252} />
      <div className="sd-port-labels">
        <span style={{ top: 88 }}>参考</span>
        <span style={{ top: 140 }}>角色</span>
        <span style={{ top: 192 }}>场景</span>
        <span style={{ top: 244 }}>其它</span>
      </div>
      <header className="sd-head">
        <div>
          <b>故事导演</b>
          <small>分析故事，生成角色资产，再按镜头批量生成分镜</small>
        </div>
        <div className="sd-head-tools nodrag">
          <ModelSelect value={data.textModel || DEFAULT_TEXT} kind="text" onChange={(textModel) => updateNodeData(id, { textModel })} />
          <ModelSelect value={data.imageModel || DEFAULT_IMAGE} kind="image" onChange={(imageModel) => updateNodeData(id, { imageModel })} />
          <span className={analyzed ? "sd-pill is-on" : "sd-pill"}>{actions.busy || (analyzed ? "已分析" : "待分析")}</span>
        </div>
      </header>
      <label className="sd-label">故事内容发展</label>
      <textarea
        className="nodrag nowheel sd-story"
        value={data.development || data.text || ""}
        onChange={(event) => updateNodeData(id, { development: event.target.value, text: event.target.value })}
        placeholder="粘贴小说、章节或剧情梗概。可包含角色、场景、对白和画风要求。"
      />
      <div className="sd-5 nodrag">
        <label>
          画风预设
          <select value={data.style || "电影感写实"} onChange={(event) => updateNodeData(id, { style: event.target.value })}>
            {STYLE_PRESETS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          模式
          <select value={data.mode || "single"} onChange={(event) => updateNodeData(id, { mode: event.target.value as "single" | "grid9" })}>
            <option value="single">逐镜生成</option>
            <option value="grid9">9宫格分镜</option>
          </select>
        </label>
        <label>
          镜头数
          <input type="number" min={1} max={12} value={data.shotCount || 5} onChange={(event) => updateNodeData(id, { shotCount: Number(event.target.value) || 5 })} />
        </label>
        <label>
          画幅
          <select value={data.ratio || "16:9"} onChange={(event) => updateNodeData(id, { ratio: event.target.value })}>
            {["16:9", "9:16", "1:1"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          质量
          <select value={data.quality || "2K"} onChange={(event) => updateNodeData(id, { quality: event.target.value })}>
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="3K">3K</option>
          </select>
        </label>
      </div>
      <section className="sd-block nodrag">
        <p>图片生成模型与参数</p>
        <label>
          图片模型
          <ModelSelect value={data.imageModel || DEFAULT_IMAGE} kind="image" onChange={(imageModel) => updateNodeData(id, { imageModel })} />
        </label>
        <small>图片模型在本面板选择。角色图/分镜图优先用这里选的 provider/model。生成还是编辑由模型能力决定，不用先选手动 operation。</small>
      </section>
      <div className="sd-actions nodrag">
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => void actions.runAllStory(id)}>
          <b>一键全流程</b>
          <span>分析、角色图、分镜图</span>
        </button>
        <button type="button" disabled={Boolean(actions.busy)} onClick={() => void actions.analyzeStory(id)}>
          <b>分析故事</b>
          <span>生成角色/场景/分镜 JSON</span>
        </button>
        <button type="button" disabled={Boolean(actions.busy) || !cast.length} onClick={() => void actions.generateCharacters(id)}>
          <b>补齐缺失角色图</b>
          <span>{missing ? `缺 ${missing} 个` : "角色图已齐全"}</span>
        </button>
        <button type="button" disabled={Boolean(actions.busy) || !shots.length} onClick={() => void actions.generateShots(id)}>
          <b>生成分镜图</b>
          <span>按镜头提交</span>
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
            <b>0 张</b>
          </div>
          <div>
            <small>角色参考</small>
            <b>{cast.filter((item) => item.url).length} 张</b>
          </div>
          <div>
            <small>场景参考</small>
            <b>0 张</b>
          </div>
          <div>
            <small>其它参考</small>
            <b>0 张</b>
          </div>
        </div>
      </section>
      <section className="sd-block">
        <p>角色资产</p>
        {cast.length ? (
          cast.map((person, index) => (
            <div key={person.name} className="sd-row">
              {person.url ? <img src={person.url} alt="" /> : <i />}
              <div>
                <b>{person.name}</b>
                <small>
                  {person.importance} · {person.locked ? "已锁定" : person.url ? "已生成" : "待定妆"}
                </small>
              </div>
              <button type="button" className="nodrag" disabled={Boolean(actions.busy)} onClick={() => void actions.generateCharacters(id, index)}>
                {person.url ? "重拍" : "定妆"}
              </button>
            </div>
          ))
        ) : (
          <small>角色/场景/镜头会在“分析故事”成功后回填；没有上游参考图也可以直接按文案生成。</small>
        )}
      </section>
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
                {shot.characters.length || 1} 角色 · {shot.status || "pending"}
              </small>
            </div>
            <button type="button" className="nodrag" disabled={Boolean(actions.busy)} onClick={() => void actions.generateShots(id, index)}>
              {shot.url ? "重拍" : "出图"}
            </button>
          </div>
        ))}
      </section>
      <Port id="out" type="source" position={Position.Right} label="分镜" tone="out" />
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
};
