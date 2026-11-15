import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ positions: [] });
  return ok({ positions: mutate((s) => s.positions.filter((p) => p.accountId === ctx.account.id)) });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{
    quoteId: string;
    mode: "paper" | "live" | "hackathon";
    txHash?: string;
    chainPositionId?: string;
  }>(req);
  const quote = mutate((s) => s.quotes.find((q) => q.id === body.quoteId));
  if (!quote || quote.accountId !== ctx.account.id) return fail("NOT_FOUND", "Quote not found", 404);
  if (body.mode !== "paper") {
    return fail("UNAVAILABLE", "Live position recording requires verified Arc receipts.", 503);
  }
  if (quote.signature !== "0x" || quote.status !== "available" || quote.deadline * 1000 <= Date.now()) {
    return fail("QUOTE_EXPIRED", "Request a new paper quote.");
  }
  if (body.txHash || body.chainPositionId) return fail("INVALID", "Paper positions have no chain receipt.");
  const thesis = mutate((s) => s.theses.find((t) => t.id === quote.thesisId));
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  const position = mutate((s) => {
    quote.status = "accepted";
    const p = {
      id: uid("pos"),
      accountId: ctx.account.id,
      thesisId: thesis.id,
      quoteId: quote.id,
      mode: body.mode,
      chainPositionId: null,
      txHash: null,
      status: quote.recordedScenarioIndex === undefined ? "open" as const : "resolved" as const,
      scenarioIndex: quote.recordedScenarioIndex ?? null,
      payouts: quote.payouts,
      labels: quote.scenarioLabels,
      maxPayout: quote.maxPayout,
      premium: quote.premium,
      fee: quote.fee,
      familyId: thesis.familyId,
      topicSlug: thesis.topicSlug,
      createdAt: new Date().toISOString(),
    };
    s.positions.push(p);
    s.transactions.push({
      id: uid("tx"),
      accountId: ctx.account.id,
      type: "accept_paper_quote",
      status: "confirmed",
      hash: null,
      amount: quote.premium,
      unit: "USDC",
      related: p.id,
      error: null,
      createdAt: new Date().toISOString(),
    });
    s.journals.push({
      id: uid("j"),
      accountId: ctx.account.id,
      thesisId: thesis.id,
      positionId: p.id,
      snapshot: { quote, thesisId: thesis.id },
      reflection: "",
      tags: [],
      createdAt: new Date().toISOString(),
    });
    return p;
  });
  return ok({ position });
}
