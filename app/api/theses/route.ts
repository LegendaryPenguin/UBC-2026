import type { ThesisRevision } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { thesisOwner } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function GET() {
  const owner = thesisOwner();
  if (!owner) return ok({ theses: [] });
  const mine = mutate((s) => s.theses.filter((t) => (t as ThesisRevision & { accountId?: string }).accountId === owner));
  return ok({ theses: mine });
}

export async function POST(req: Request) {
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
    accountId: thesisOwner(true)!,
  };
  mutate((s) => {
    s.theses.push(thesis);
  });
  return ok({ thesis });
}
