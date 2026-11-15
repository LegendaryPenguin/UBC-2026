import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ watchlists: [] });
  return ok({ watchlists: mutate((s) => s.watchlists.filter((w) => w.accountId === ctx.account.id)) });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ name?: string; slugs?: string[] }>(req);
  const name = body.name?.trim() || "Research topics";
  const slugs = body.slugs || [];
  if (name.length > 80 || !Array.isArray(slugs) || slugs.length > 100 || slugs.some((slug) => typeof slug !== "string" || !/^[a-z0-9-]{1,100}$/i.test(slug))) {
    return fail("INVALID", "Enter a shorter list name and valid topic slugs.");
  }
  const item = {
    id: uid("wl"),
    accountId: ctx.account.id,
    name,
    slugs: [...new Set(slugs)],
    notes: "",
    createdAt: new Date().toISOString(),
  };
  mutate((s) => s.watchlists.push(item));
  return ok({ watchlist: item });
}
