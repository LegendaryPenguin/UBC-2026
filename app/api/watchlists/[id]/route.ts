import { fail, ok, readJson } from "@/lib/server/http";
import { mutate } from "@/lib/server/store";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<{ name?: string; slugs?: string[]; notes?: string; action?: string }>(req);
  const item = mutate((s) => {
    const w = s.watchlists.find((x) => x.id === params.id);
    if (!w) return null;
    if (body.action === "delete") {
      s.watchlists = s.watchlists.filter((x) => x.id !== params.id);
      return w;
    }
    Object.assign(w, body);
    return w;
  });
  if (!item) return fail("NOT_FOUND", "Watchlist not found", 404);
  return ok({ watchlist: item });
}
