import type { ThesisRevision } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ theses: [] });
  const mine = mutate((s) => s.theses.filter((t) => (t as ThesisRevision & { accountId?: string }).accountId === ctx.account.id));
  return ok({ theses: mine });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  const body = await readJson<Partial<ThesisRevision> & { accountId?: string }>(req);
  if (!body.topicSlug || !body.familyId) return fail("INVALID", "Topic required");
  const thesis: ThesisRevision & { accountId: string } = {
    id: uid("th"),
    topicSlug: body.topicSlug,
    familyId: body.familyId,
    familyVersion: body.familyVersion || "1",
    template: body.template || "range",
    direction: body.direction ?? null,
    lowerThreshold: body.lowerThreshold ?? null,
    upperThreshold: body.upperThreshold ?? null,
    rationale: body.rationale || "",
    invalidation: body.invalidation || "",
    evidenceIds: body.evidenceIds || [],
    status: "draft",
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accountId: ctx?.account.id || "guest",
  };
  mutate((s) => {
    s.theses.push(thesis);
  });
  return ok({ thesis });
}
