import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ thesisId: string; includeRationale?: boolean; access?: "unlisted" | "public" }>(req);
  const pub = {
    id: uid("pub"),
    accountId: ctx.account.id,
    thesisId: body.thesisId,
    token: uid("share"),
    includeRationale: Boolean(body.includeRationale),
    access: body.access || "unlisted",
    createdAt: new Date().toISOString(),
  };
  mutate((s) => s.publications.push(pub));
  return ok({ publication: pub });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const pub = mutate((s) => s.publications.find((p) => p.token === token));
  if (!pub) return fail("NOT_FOUND", "Snapshot not found", 404);
  const thesis = mutate((s) => s.theses.find((t) => t.id === pub.thesisId));
  return ok({ publication: pub, thesis });
}
