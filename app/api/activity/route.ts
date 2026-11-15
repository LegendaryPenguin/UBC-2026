import { ok } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ transactions: [] });
  return ok({ transactions: mutate((s) => s.transactions.filter((t) => t.accountId === ctx.account.id)) });
}
