import type { ThesisRevision, ViewTemplate } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { thesisOwner } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";
import { recordThesisVersion } from "@/lib/server/thesis-history";
import { getTopic } from "@/lib/gemini/catalog";
import { compileView } from "@/lib/payoffs/compile";

const VIEW_TEMPLATES: ViewTemplate[] = ["binary", "directional", "range", "outside"];

export async function GET() {
  const owner = thesisOwner();
  if (!owner) return ok({ theses: [] });
  const mine = mutate((s) => s.theses.filter((t) => (t as ThesisRevision & { accountId?: string }).accountId === owner));
  return ok({ theses: mine });
}

export async function POST(req: Request) {
  const body = await readJson<Partial<ThesisRevision> & { accountId?: string; mode?: string }>(req);
  if (typeof body.topicSlug !== "string" || typeof body.familyId !== "string") return fail("INVALID", "Topic required");
  if (body.topicSlug.length > 79 || !/^[a-z0-9][a-z0-9-]{0,78}$/i.test(body.topicSlug)) return fail("INVALID", "Choose a valid topic.");
  const mode = body.mode === "live" ? "live" : "replay";
  const family = await getTopic(body.topicSlug, mode);
  if (!family || family.id !== body.familyId || (body.familyVersion && body.familyVersion !== family.version)) {
    return fail("UNSUPPORTED_FAMILY", "This topic changed or is no longer available. Reload it before saving a view.", 409);
  }
  const template = body.template || (family.predicates.length === 1 ? "binary" : "range");
  if (!VIEW_TEMPLATES.includes(template)) return fail("UNSUPPORTED_TEMPLATE", "Choose a supported view template for this market.", 409);
  const hasViewIntent = body.template !== undefined || body.direction !== undefined || body.lowerThreshold != null || body.upperThreshold != null;
  if (hasViewIntent) {
    try {
      compileView(family, template, {
        threshold: body.lowerThreshold,
        direction: body.direction,
        lower: body.lowerThreshold,
        upper: body.upperThreshold,
      }, 100_000000n);
    } catch (error) {
      return fail("INCOMPATIBLE_RULES", error instanceof Error ? error.message : "The view does not match this market.", 409);
    }
  }
  const thesis: ThesisRevision & { accountId: string } = {
    id: uid("th"),
    topicSlug: body.topicSlug,
    familyId: body.familyId,
    familyVersion: body.familyVersion || "1",
    template,
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
    recordThesisVersion(s, thesis, thesis.accountId, "Created draft");
  });
  return ok({ thesis });
}
