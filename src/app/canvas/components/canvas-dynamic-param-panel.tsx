import React from "react";
import { Slider, InputNumber, Input, Select, Button, Collapse } from "antd";
import {
  generateDefaultParamSchema,
  isDynamicParamVisible,
  normalizeDynamicParamValue,
  type ModelParamSchema,
} from "@/services/api/dynamic-model-registry";

export interface CanvasDynamicParamPanelProps {
  model: string;
  category?: "image" | "video";
  values: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
  customSchemas?: ModelParamSchema[];
  className?: string;
}

export const CanvasDynamicParamPanel: React.FC<CanvasDynamicParamPanelProps> = ({
  model,
  category = "image",
  values,
  onChange,
  customSchemas,
  className = "",
}) => {
  const schemas = (customSchemas || generateDefaultParamSchema(model, category)).filter((param) => isDynamicParamVisible(param, values));
  const basicParams = schemas.filter((s) => s.group === "basic");
  const advancedParams = schemas.filter((s) => s.group === "advanced");

  const handleFieldChange = (param: ModelParamSchema, value: unknown) => {
    const normalized = normalizeDynamicParamValue(param, value);
    onChange({ [param.key]: normalized });
  };

  const randomizeSeed = () => {
    // 生成全平台安全通用的 31 位无符号随机整型
    const randomSafeSeed = Math.floor(Math.random() * 2147483647);
    onChange({ seed: randomSafeSeed });
  };

  const setAutoSeed = () => {
    onChange({ seed: -1 });
  };

  const renderControl = (param: ModelParamSchema) => {
    const currentValue = values[param.key] !== undefined ? values[param.key] : param.default;

    switch (param.type) {
      case "number":
      case "integer": {
        if (param.key === "seed") {
          const displaySeed = currentValue === undefined || currentValue === null ? "-1" : String(currentValue);
          return (
            <div className="flex items-center gap-1.5">
              <Input
                value={displaySeed}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  onChange({ [param.key]: val === "" || val === "-1" ? -1 : val });
                }}
                className="w-full text-xs font-mono nodrag nopan"
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="-1 随机 / 支持任意长种子"
              />
              <Button size="small" onClick={randomizeSeed} title="生成一个随机种子">
                🎲
              </Button>
              <Button size="small" onClick={setAutoSeed} title="重置为自动随机 (-1)">
                -1
              </Button>
            </div>
          );
        }

        if (param.min !== undefined && param.max !== undefined) {
          const numericDefault = typeof param.default === "number" ? param.default : param.min;
          const sliderValue = typeof currentValue === "number" ? currentValue : numericDefault;
          return (
            <div className="flex items-center gap-2">
              <Slider
                min={param.min}
                max={param.max}
                step={param.step || (param.type === "integer" ? 1 : 0.1)}
                value={sliderValue}
                onChange={(val) => handleFieldChange(param, val)}
                className="flex-1 my-1 nodrag nopan"
              />
              <InputNumber
                min={param.min}
                max={param.max}
                step={param.step || (param.type === "integer" ? 1 : 0.1)}
                value={currentValue}
                onChange={(val) => handleFieldChange(param, val)}
                size="small"
                className="w-16 text-xs nodrag nopan"
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          );
        }

        return (
          <InputNumber
            value={currentValue}
            onChange={(val) => handleFieldChange(param, val)}
            size="small"
            className="w-full text-xs nodrag nopan"
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        );
      }

      case "select": {
        return (
          <div
            className="nodrag nopan"
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Select
              value={currentValue}
              onChange={(val) => handleFieldChange(param, val)}
              options={param.options}
              size="small"
              className="w-full text-xs"
            />
          </div>
        );
      }

      case "string":
      case "image_slot":
      case "lora_slot": {
        return (
          <input
            type="text"
            value={String(currentValue ?? "")}
            placeholder={param.type === "image_slot" ? "参考图 URL 或由画布连接" : param.type === "lora_slot" ? "LoRA URL / model id" : undefined}
            aria-label={param.label}
            className="h-8 w-full rounded-lg border bg-transparent px-2 text-xs outline-none nodrag nopan"
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(event) => handleFieldChange(param, event.target.value)}
          />
        );
      }

      case "boolean":
        return (
          <label className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
            <input
              type="checkbox"
              checked={currentValue === true}
              aria-label={param.label}
              onChange={(event) => handleFieldChange(param, event.target.checked)}
            />
            <span>{currentValue === true ? "已启用" : "未启用"}</span>
          </label>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`space-y-3 text-xs nodrag nopan nowheel ${className}`}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 基础参数展示区 */}
      <div className="space-y-2">
        {basicParams.map((param) => (
          <div key={param.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-muted-foreground font-medium">
              <span>{param.label}</span>
              {param.description && (
                <span className="text-[10px] opacity-70 scale-90 origin-right">{param.description}</span>
              )}
            </div>
            {renderControl(param)}
          </div>
        ))}
      </div>

      {/* 高级参数折叠区（如 ComfyUI 的 Sampler, Scheduler, Denoise 等） */}
      {advancedParams.length > 0 && (
        <Collapse
          size="small"
          ghost
          defaultActiveKey={["advanced"]}
          className="border-t border-border/40 mt-2"
          items={[
            {
              key: "advanced",
              label: (
                <span className="text-xs font-medium opacity-80">
                  高级推理参数 ({advancedParams.length})
                </span>
              ),
              children: (
                <div className="space-y-2 pt-1">
                  {advancedParams.map((param) => (
                    <div key={param.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{param.label}</span>
                      </div>
                      {renderControl(param)}
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
};
