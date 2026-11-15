import type { ThesisRevision } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { mutate, uid } from "@/lib/server/store";
import { thesisOwner } from "@/lib/server/session";

function get(id: string) {
  const owner = thesisOwner();
  if (!owner) return undefined;
  return mutate((s) => s.theses.find((t) => t.id === id && (t as ThesisRevision & { accountId?: string }).accountId === owner));
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const thesis = get(params.id);
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  return ok({ thesis });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<Partial<ThesisRevision> & { action?: string }>(req);
  const existing = get(params.id);
  if (!existing) return fail("NOT_FOUND", "Thesis not found", 404);
  const thesis = mutate((s) => {
    const t = existing;
    if (body.action === "duplicate") {
      const copy = { ...t, id: uid("th"), status: "draft" as const, revision: 1, createdAt: new Date().toISOString() };
      s.theses.push(copy);
      return copy;
    } else if (body.action === "archive") {
      (t as ThesisRevision & { archived?: boolean }).status = t.status;
      (t as { archived?: boolean }).archived = true;
    } else {
      if (body.template !== undefined) t.template = body.template;
      if (body.direction !== undefined) t.direction = body.direction;
      if (body.lowerThreshold !== undefined) t.lowerThreshold = body.lowerThreshold;
      if (body.upperThreshold !== undefined) t.upperThreshold = body.upperThreshold;
      if (body.rationale !== undefined) t.rationale = body.rationale;
      if (body.invalidation !== undefined) t.invalidation = body.invalidation;
      if (body.evidenceIds !== undefined) t.evidenceIds = body.evidenceIds;
      t.status = body.action === "confirm" ? "confirmed" : "draft";
      if (body.action === "confirm") t.revision += 1;
    }
    t.updatedAt = new Date().toISOString();
    return t;
  });
  return ok({ thesis });
}
