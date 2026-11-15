import { fail, ok, readJson } from "@/lib/server/http";
import { mutate, readStore, uid } from "@/lib/server/store";
import { currentSession } from "@/lib/server/session";

function ownedPosition(id: string) {
  const accountId = currentSession()?.account.id;
  return readStore().positions.find((p) => p.id === id && p.accountId === accountId);
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const position = ownedPosition(params.id);
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  return ok({ position });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<{ action: string; txHash?: string }>(req);
  const position = ownedPosition(params.id);
  if (!position) return fail("NOT_FOUND", "Position not found", 404);
  if (body.action === "claim") {
    if (position.mode !== "paper") {
      return fail("UNAVAILABLE", "Live claim recording requires a verified Arc receipt.", 503);
    }
    if (body.txHash) return fail("INVALID", "Paper claims have no chain receipt.");
    if (position.status === "claimed") return ok({ position });
    if (position.status !== "resolved" && position.status !== "voided") {
      return fail("INVALID", "This position has no claimable outcome.");
    }
    const amount = position.status === "voided"
      ? position.premium
      : position.scenarioIndex === null ? undefined : position.payouts[position.scenarioIndex];
    if (amount === undefined) return fail("INVALID", "The recorded outcome does not match this payoff.");
    mutate((s) => {
      position.status = "claimed";
      s.transactions.push({
        id: uid("tx"),
        accountId: position.accountId,
        type: "claim_paper",
        status: "confirmed",
        hash: null,
        amount,
        unit: "USDC",
        related: position.id,
        error: null,
        createdAt: new Date().toISOString(),
      });
    });
    return ok({ position });
  }
  if (body.action === "exit") return fail("UNAVAILABLE", "No buyback quote is available.", 503);
  return fail("INVALID", "Unknown position action.");
}
