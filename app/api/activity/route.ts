import { ok } from "@/lib/server/http";
import { thesisOwner } from "@/lib/server/session";
import { readStore } from "@/lib/server/store";

export async function GET() {
  const owner = thesisOwner();
  if (!owner) return ok({ transactions: [] });
  return ok({ transactions: readStore().transactions.filter((transaction) => transaction.accountId === owner) });
}
