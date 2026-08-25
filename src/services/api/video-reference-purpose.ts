import type { VideoReferenceUseAs } from "@/types/media";

export function normalizeVideoReferenceUseAs(value: unknown): VideoReferenceUseAs {
    return value === "first_clip" || value === "source_video" ? value : "reference_video";
}

export function resolveVideoReferencePurposeAssignments(
    assignments: readonly { nodeId: string; useAs?: unknown }[],
): Map<string, VideoReferenceUseAs | undefined> {
    const resolved = new Map<string, VideoReferenceUseAs | undefined>();
    const effective = new Map<string, VideoReferenceUseAs>();
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
