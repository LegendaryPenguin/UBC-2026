import type { ThesisRevision } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { mutate, uid } from "@/lib/server/store";

function get(id: string) {
  return mutate((s) => s.theses.find((t) => t.id === id) as (ThesisRevision & { accountId?: string }) | undefined);
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const thesis = get(params.id);
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  return ok({ thesis });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<Partial<ThesisRevision> & { action?: string }>(req);
  const thesis = mutate((s) => {
    const t = s.theses.find((x) => x.id === params.id);
    if (!t) return null;
    if (body.action === "confirm") {
      t.status = "confirmed";
      t.revision += 1;
    } else if (body.action === "duplicate") {
      const copy = { ...t, id: uid("th"), status: "draft" as const, revision: 1, createdAt: new Date().toISOString() };
      s.theses.push(copy);
      return copy;
    } else if (body.action === "archive") {
      (t as ThesisRevision & { archived?: boolean }).status = t.status;
      (t as { archived?: boolean }).archived = true;
    } else {
      Object.assign(t, body, { updatedAt: new Date().toISOString() });
    }
    t.updatedAt = new Date().toISOString();
    return t;
  });
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  return ok({ thesis });
}
