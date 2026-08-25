export function normalizeVideoReferenceUseAs(value) {
    return value === "first_clip" || value === "source_video" ? value : "reference_video";
}

export function resolveVideoReferencePurposeAssignments(assignments) {
    const resolved = new Map();
    const effective = new Map();
    for (const assignment of assignments) {
        const useAs = normalizeVideoReferenceUseAs(assignment.useAs);
        const current = effective.get(assignment.nodeId);
        if (current && current !== useAs) {
            throw new Error(`视频素材 ${assignment.nodeId} 通过多条连线被同时标记为 ${current} 和 ${useAs}；请统一用途后再生成`);
        }
        effective.set(assignment.nodeId, useAs);
        if (assignment.useAs === "reference_video" || assignment.useAs === "first_clip" || assignment.useAs === "source_video") {
            resolved.set(assignment.nodeId, assignment.useAs);
        } else if (!resolved.has(assignment.nodeId)) {
            resolved.set(assignment.nodeId, undefined);
        }
    }
    return resolved;
}
