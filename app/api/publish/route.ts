import { randomUUID } from "node:crypto";
import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, readStore, uid } from "@/lib/server/store";

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ thesisId: string; includeRationale?: boolean; access?: "unlisted" | "public" }>(req);
  if (body.access !== undefined && body.access !== "unlisted" && body.access !== "public") {
    return fail("INVALID", "Choose a valid access level.");
  }
  const thesis = readStore().theses.find((t) =>
    t.id === body.thesisId && (t as typeof t & { accountId?: string }).accountId === ctx.account.id
  );
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  const pub = {
    id: uid("pub"),
    accountId: ctx.account.id,
    thesisId: body.thesisId,
    token: randomUUID(),
    includeRationale: body.includeRationale === true,
    access: body.access || "unlisted",
    createdAt: new Date().toISOString(),
    snapshot: {
      topicSlug: thesis.topicSlug,
      rationale: body.includeRationale === true ? thesis.rationale : undefined,
    },
  };
  mutate((s) => s.publications.push(pub));
  return ok({ publication: pub });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const pub = readStore().publications.find((p) => p.token === token);
  if (!pub?.snapshot) return fail("NOT_FOUND", "Snapshot not found", 404);
  return ok({ thesis: pub.snapshot });
}
