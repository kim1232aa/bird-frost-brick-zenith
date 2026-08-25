"use client";

export function StudioModelPicker({ capability, value, onChange }: { capability: "image" | "video" | "text"; value: string; onChange: (value: string) => void }) {
  const groups = [
    { id: "preset-volcengine-plan", name: "火山方舟", models: capability === "image" ? ["doubao-seedream-5.0-lite"] : [] },
    { id: "preset-superxihe-grok", name: "Grok Imagine", models: capability === "video" ? ["grok-imagine-video"] : capability === "text" ? ["grok-4.6"] : ["grok-imagine-image"] },
    { id: "preset-superxihe-image", name: "GPT Image", models: capability === "image" ? ["gpt-image-2", "gpt-image-1.5"] : [] },
    { id: "preset-civitai", name: "Civitai · mature", models: capability === "image" ? ["krea2-turbo", "seedream-4.5", "seedream-5.0-pro"] : [] },
  ].filter((item) => item.models.length);
  return (
    <label className="model-picker">
      模型
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {groups.map((group) => (
          <optgroup key={group.id} label={group.name}>
            {group.models.map((model) => (
              <option key={`${group.id}::${model}`} value={`${group.id}::${model}`}>{model}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
