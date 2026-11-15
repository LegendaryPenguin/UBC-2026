import { fail, ok } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";
import { quoteExpired } from "@/lib/escrow/quote";
import { thesisOwner } from "@/lib/server/session";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const quote = mutate((s) => s.quotes.find((q) => q.id === params.id));
  const owner = thesisOwner();
  if (!quote || !owner || quote.accountId !== owner) return fail("NOT_FOUND", "Quote not found", 404);
  if (quote.status === "available" && quoteExpired(quote)) quote.status = "expired";
  return ok({ quote });
}
