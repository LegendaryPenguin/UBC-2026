import { fail, ok, readJson } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";
import { currentSession } from "@/lib/server/session";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<{ name?: string; slugs?: string[]; notes?: string; action?: string }>(req);
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80)) {
    return fail("INVALID", "Enter a list name up to 80 characters.");
  }
  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2_000)) {
    return fail("INVALID", "List notes must be 2,000 characters or fewer.");
  }
  if (body.slugs !== undefined && (!Array.isArray(body.slugs) || body.slugs.length > 100 || body.slugs.some((slug) => typeof slug !== "string" || !/^[a-z0-9-]{1,100}$/i.test(slug)))) {
    return fail("INVALID", "Enter valid topic slugs.");
  }
  const item = mutate((s) => {
    const w = s.watchlists.find((x) => x.id === params.id && x.accountId === ctx.account.id);
    if (!w) return null;
    if (body.action === "delete") {
      s.watchlists = s.watchlists.filter((x) => !(x.id === params.id && x.accountId === ctx.account.id));
      return w;
    }
    if (body.name !== undefined) w.name = body.name.trim();
    if (body.slugs !== undefined) w.slugs = [...new Set(body.slugs)];
    if (body.notes !== undefined) w.notes = body.notes;
    return w;
  });
  if (!item) return fail("NOT_FOUND", "Watchlist not found", 404);
  return ok({ watchlist: item });
}
