import type { ThesisHistoryRecord, ThesisRevision, ThesisSnapshot } from "@/lib/domain/types";
import type { StoreShape } from "@/lib/server/store";
import { uid } from "@/lib/server/store";

export function thesisSnapshot(thesis: ThesisRevision): ThesisSnapshot {
  return {
    articleSource: thesis.articleSource ? { ...thesis.articleSource } : null,
    topicSlug: thesis.topicSlug,
    familyId: thesis.familyId,
    familyVersion: thesis.familyVersion,
    template: thesis.template,
    direction: thesis.direction,
    lowerThreshold: thesis.lowerThreshold,
    upperThreshold: thesis.upperThreshold,
    rationale: thesis.rationale,
    invalidation: thesis.invalidation,
    evidenceIds: [...thesis.evidenceIds],
    status: thesis.status === "quoted" ? "confirmed" : thesis.status,
  };
}

export function recordThesisVersion(
  state: StoreShape,
  thesis: ThesisRevision,
  accountId: string,
  reason: string,
) {
  state.thesisHistory ??= [];
  const record: ThesisHistoryRecord = {
    id: uid("rev"),
    thesisId: thesis.id,
    accountId,
    revision: thesis.revision,
    recordedAt: thesis.updatedAt,
    reason,
    snapshot: thesisSnapshot(thesis),
  };
  state.thesisHistory.push(record);
}
