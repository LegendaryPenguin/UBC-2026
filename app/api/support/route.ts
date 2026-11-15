import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ tickets: [] });
  return ok({ tickets: mutate((s) => s.tickets.filter((t) => t.accountId === ctx.account.id)) });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ category: string; text: string }>(req);
  const ticket = {
    id: uid("tix"),
    accountId: ctx.account.id,
    category: body.category,
    body: body.text,
    status: "open" as const,
    createdAt: new Date().toISOString(),
    messages: [{ at: new Date().toISOString(), from: "user", text: body.text }],
  };
  mutate((s) => s.tickets.push(ticket));
  return ok({ ticket });
}
