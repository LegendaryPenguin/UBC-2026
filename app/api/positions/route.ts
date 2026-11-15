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
    thesisId: string;
    mode: "paper" | "live" | "hackathon";
    txHash?: string;
    chainPositionId?: string;
    topicSlug: string;
    familyId: string;
  }>(req);
  const quote = mutate((s) => s.quotes.find((q) => q.id === body.quoteId));
  if (!quote) return fail("NOT_FOUND", "Quote not found", 404);
  if (body.mode !== "paper") {
    if (quote.status !== "available") return fail("QUOTE_EXPIRED", "Quote is not available.");
    if (!body.txHash) return fail("UNAVAILABLE", "Live acceptance needs a confirmed transaction hash.");
  }
  if (quote.deadline * 1000 < Date.now() && body.mode !== "paper") {
    quote.status = "expired";
    return fail("QUOTE_EXPIRED", "Quote expired. Request a new offer.");
  }
  const position = mutate((s) => {
    quote.status = "accepted";
    const p = {
      id: uid("pos"),
      accountId: ctx.account.id,
      thesisId: body.thesisId,
      quoteId: quote.id,
      mode: body.mode,
      chainPositionId: body.chainPositionId || null,
      txHash: body.txHash || null,
      status: "open" as const,
      scenarioIndex: null,
      payouts: quote.payouts,
      labels: quote.scenarioLabels,
      maxPayout: quote.maxPayout,
      premium: quote.premium,
      fee: quote.fee,
      familyId: body.familyId,
      topicSlug: body.topicSlug,
      createdAt: new Date().toISOString(),
    };
    s.positions.push(p);
    s.transactions.push({
      id: uid("tx"),
      accountId: ctx.account.id,
      type: "accept_quote",
      status: body.txHash ? "confirmed" : "confirmed",
      hash: body.txHash || null,
      amount: quote.premium,
      unit: "USDC",
      related: p.id,
      error: null,
      createdAt: new Date().toISOString(),
    });
    s.journals.push({
      id: uid("j"),
      accountId: ctx.account.id,
      thesisId: body.thesisId,
      positionId: p.id,
      snapshot: { quote, thesisId: body.thesisId },
      reflection: "",
      tags: [],
      createdAt: new Date().toISOString(),
    });
    return p;
  });
  return ok({ position });
}
