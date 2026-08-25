export function providerModelTriggerAccessibility(
    controlLabel: string | undefined,
    selectionLabel: string | undefined,
    placeholder: string,
) {
    const selected = String(selectionLabel || placeholder).trim();
    const control = String(controlLabel || "").trim();
    const label = control && selected ? `${control}：${selected}` : control || selected;
    return { title: label, ariaLabel: label };
}
