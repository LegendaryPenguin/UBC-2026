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
  const quotes = (store.quotes || [])
    .filter((quote) => quote.thesisId === thesis.id && quote.accountId === accountId)
    .map((quote) => ({
      id: quote.id,
      kind: "quote" as const,
      at: new Date(quote.issuedAt * 1000).toISOString(),
      status: quote.status,
      mode: (quote as typeof quote & { mode?: string }).mode || (quote.signature === "0x" ? "paper or replay" : "live"),
      premium: quote.premium,
      fee: quote.fee,
      maxPayout: quote.maxPayout,
    }));
  const positions = (store.positions || [])
    .filter((position) => position.thesisId === thesis.id && position.accountId === accountId)
    .map((position) => ({
      id: position.id,
      kind: "position" as const,
      at: position.createdAt,
      status: position.status,
      mode: position.mode,
      premium: position.premium,
      fee: position.fee,
      maxPayout: position.maxPayout,
      scenarioIndex: position.scenarioIndex,
      scenarioLabel: position.scenarioIndex == null ? null : position.labels[position.scenarioIndex] || null,
      href: `/positions/${position.id}`,
    }));
  const timeline = [...quotes, ...positions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return ok({ thesisId: thesis.id, currentRevision: thesis.revision, versions, timeline });
}
