import { BUNDLED_PROMPTS, type LocalPrompt } from "@/data/prompt-library";

export type Prompt = LocalPrompt;

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

export async function fetchPrompts({
    keyword = "",
    tag = [],
    category = ALL_PROMPTS_OPTION,
    page = 1,
    pageSize = 24,
}: {
    keyword?: string;
    tag?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
} = {}): Promise<PromptListResponse> {
    const query = keyword.trim().toLowerCase();
    const tags = tag.filter((item) => item && item !== ALL_PROMPTS_OPTION);
    const filtered = BUNDLED_PROMPTS.filter((item) => {
        if (category && category !== ALL_PROMPTS_OPTION && item.category !== category) return false;
        if (tags.length && !tags.every((selected) => item.tags.includes(selected))) return false;
        if (!query) return true;
        return `${item.title} ${item.prompt} ${item.tags.join(" ")}`.toLowerCase().includes(query);
    });
    const start = Math.max(0, (page - 1) * pageSize);
    return {
        items: filtered.slice(start, start + pageSize),
        tags: [ALL_PROMPTS_OPTION, ...unique(BUNDLED_PROMPTS.flatMap((item) => item.tags))],
        categories: [ALL_PROMPTS_OPTION, ...unique(BUNDLED_PROMPTS.map((item) => item.category))],
        total: filtered.length,
    };
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))];
}
