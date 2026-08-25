type PromptTextareaHeightInput = {
    minimumHeight: number;
    maximumHeight: number;
    contentHeight: number;
    manualHeight: number | null;
};

export function resolvePromptTextareaHeight({ minimumHeight, maximumHeight, contentHeight, manualHeight }: PromptTextareaHeightInput) {
    const targetHeight = manualHeight === null ? contentHeight : manualHeight;
    return Math.min(Math.max(Math.ceil(targetHeight), minimumHeight), maximumHeight);
}
