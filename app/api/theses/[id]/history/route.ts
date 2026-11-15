import { fail, ok } from "@/lib/server/http";
import { mutate, readStore, uid } from "@/lib/server/store";
import { thesisOwner } from "@/lib/server/session";
import { thesisSnapshot } from "@/lib/server/thesis-history";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const accountId = thesisOwner();
  if (!accountId) return fail("NOT_FOUND", "Thesis not found", 404);
  const store = readStore();
  const thesis = store.theses.find((item) =>
    item.id === params.id && (item as typeof item & { accountId?: string }).accountId === accountId
  );
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);

  let versions = (store.thesisHistory || [])
    .filter((record) => record.thesisId === thesis.id && record.accountId === accountId)
    .sort((a, b) => a.revision - b.revision);
  if (!versions.length) {
    mutate((state) => {
      state.thesisHistory ??= [];
      state.thesisHistory.push({
        id: uid("rev"),
        thesisId: thesis.id,
        accountId,
        revision: thesis.revision,
        recordedAt: thesis.updatedAt,
        reason: "Existing saved view",
        snapshot: thesisSnapshot(thesis),
      });
    });
    versions = (readStore().thesisHistory || [])
      .filter((record) => record.thesisId === thesis.id && record.accountId === accountId)
      .sort((a, b) => a.revision - b.revision);
  }
  return ok({ thesisId: thesis.id, currentRevision: thesis.revision, versions });
}
