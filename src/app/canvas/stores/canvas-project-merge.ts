export type CanvasMergeProject = {
    id?: string;
    title?: string;
    updatedAt?: string;
    nodes?: unknown[];
    connections?: unknown[];
    [key: string]: unknown;
};

export type CanvasMergeScopeProjects = {
    scope: string;
    projects: CanvasMergeProject[];
};

export type CanvasMergeResult = {
    projects: CanvasMergeProject[];
    changed: boolean;
};

type ProjectCandidate = {
    scope: string;
    project: CanvasMergeProject;
    signature: string;
    score: number;
    updatedAtMs: number;
};

export function mergeCanvasProjectsByScope(scopeProjects: CanvasMergeScopeProjects[]): CanvasMergeResult {
    const originalProjects = scopeProjects.flatMap((entry) => entry.projects);
    const reservedIds = new Set(originalProjects.map((project) => project.id).filter((id): id is string => typeof id === "string" && id.length > 0));
    const usedIds = new Set<string>();
    const grouped = new Map<string, ProjectCandidate[]>();

    scopeProjects.forEach((entry) => {
        entry.projects.forEach((project, index) => {
            const id = normalizeProjectId(project.id, entry.scope, index);
            const normalizedProject = project.id === id ? project : { ...project, id };
            const candidate: ProjectCandidate = {
                scope: entry.scope,
                project: normalizedProject,
                signature: stableProjectSignature(normalizedProject),
                score: scoreProject(normalizedProject),
                updatedAtMs: parseUpdatedAt(normalizedProject.updatedAt),
            };
            const bucket = grouped.get(id) || [];
            if (!bucket.some((item) => item.signature === candidate.signature)) {
                bucket.push(candidate);
            }
            grouped.set(id, bucket);
        });
    });

    const projects: CanvasMergeProject[] = [];

    Array.from(grouped.entries())
        .sort((a, b) => compareCandidate(bestCandidate(b[1]), bestCandidate(a[1])))
        .forEach(([id, candidates]) => {
            const sorted = [...candidates].sort(compareCandidate);
            const winner = cloneProjectWithId(sorted[0].project, id);
            projects.push(winner);
            usedIds.add(id);

            sorted.slice(1).forEach((candidate) => {
                if (candidate.signature === sorted[0].signature) return;
                const backupId = allocateBackupProjectId(id, candidate.scope, reservedIds, usedIds);
                projects.push({
                    ...candidate.project,
                    id: backupId,
                    title: appendMergeBackupTitle(candidate.project.title, candidate.scope),
                });
                usedIds.add(backupId);
            });
        });

    projects.sort((a, b) => {
        const backupDiff = Number(isMergeBackupProject(a)) - Number(isMergeBackupProject(b));
        if (backupDiff) return backupDiff;
        const updatedDiff = parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt);
        if (updatedDiff) return updatedDiff;
        return String(a.title || a.id || "").localeCompare(String(b.title || b.id || ""));
    });

    return {
        projects,
        changed: stableProjectSignature(originalProjects) !== stableProjectSignature(projects),
    };
}

export function getCanvasMergeScopes(currentScope: string) {
    return [currentScope];
}

function normalizeProjectId(id: unknown, scope: string, index: number) {
    if (typeof id === "string" && id.trim()) return id;
    return `recovered-${sanitizeScope(scope)}-${index + 1}`;
}

function bestCandidate(candidates: ProjectCandidate[]) {
    return [...candidates].sort(compareCandidate)[0];
}

function compareCandidate(a: ProjectCandidate, b: ProjectCandidate) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.updatedAtMs !== a.updatedAtMs) return b.updatedAtMs - a.updatedAtMs;
    return a.scope.localeCompare(b.scope);
}

function scoreProject(project: CanvasMergeProject) {
    const nodeScore = Array.isArray(project.nodes) ? project.nodes.length * 1_000_000 : 0;
    const connectionScore = Array.isArray(project.connections) ? project.connections.length * 10_000 : 0;
    const contentScore = Math.min(stableProjectSignature(project).length, 50_000);
    return nodeScore + connectionScore + contentScore;
}

function parseUpdatedAt(value: unknown) {
    if (typeof value !== "string") return 0;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
}

function allocateBackupProjectId(originalId: string, scope: string, reservedIds: Set<string>, usedIds: Set<string>) {
    const base = `${originalId}__merged_${sanitizeScope(scope)}`;
    let id = base;
    let index = 2;
    while (reservedIds.has(id) || usedIds.has(id)) {
        id = `${base}_${index}`;
        index += 1;
    }
    return id;
}

function appendMergeBackupTitle(title: unknown, scope: string) {
    const baseTitle = typeof title === "string" && title.trim() ? title.trim() : "未命名画布";
    const suffix = `（合并备份：${scope || "unknown"}）`;
    return baseTitle.includes("合并备份") ? baseTitle : `${baseTitle}${suffix}`;
}

function isMergeBackupProject(project: CanvasMergeProject) {
    return typeof project.title === "string" && project.title.includes("合并备份");
}

function cloneProjectWithId(project: CanvasMergeProject, id: string) {
    return project.id === id ? project : { ...project, id };
}

function sanitizeScope(scope: string) {
    return (scope || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stableProjectSignature(value: unknown) {
    return JSON.stringify(value, Object.keys(flattenKeys(value)).sort());
}

function flattenKeys(value: unknown, keys: Record<string, true> = {}) {
    if (!value || typeof value !== "object") return keys;
    Object.keys(value).forEach((key) => {
        keys[key] = true;
        flattenKeys((value as Record<string, unknown>)[key], keys);
    });
    return keys;
}
