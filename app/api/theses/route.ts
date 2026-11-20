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
  const store = mutate((s) => s);
  const mine = store.theses
    .filter((t) => (t as ThesisRevision & { accountId?: string }).accountId === owner)
    .map((thesis) => {
      const hasPosition = store.positions.some((position) => position.thesisId === thesis.id && position.accountId === owner);
      const hasQuote = store.quotes.some((quote) => quote.thesisId === thesis.id && quote.accountId === owner);
      const archived = Boolean((thesis as ThesisRevision & { archived?: boolean }).archived);
      return {
        ...thesis,
        libraryState: archived ? "archived" as const : hasPosition ? "traded" as const : thesis.status === "draft" ? "draft" as const : "active" as const,
        canDelete: thesis.status === "draft" && !hasPosition && !hasQuote,
      };
    });
  return ok({ theses: mine });
}

export async function POST(req: Request) {
  const body = await readJson<Partial<ThesisRevision> & { accountId?: string; mode?: string }>(req);
  const hasBinding = typeof body.topicSlug === "string" && Boolean(body.topicSlug) &&
    typeof body.familyId === "string" && Boolean(body.familyId);
  if (!hasBinding && (typeof body.rationale !== "string" || body.rationale.trim().length < 8)) {
    return fail("INVALID", "Describe the question you want to research.");
  }
  if (hasBinding && (body.topicSlug!.length > 79 || !/^[a-z0-9][a-z0-9-]{0,78}$/i.test(body.topicSlug!))) return fail("INVALID", "Choose a valid topic.");
  let articleSource: ThesisRevision["articleSource"] = null;
  if (body.articleSource !== undefined && body.articleSource !== null) {
    const source = body.articleSource;
    if (!source || typeof source.title !== "string" || !source.title.trim() || source.title.length > 240 ||
      typeof source.url !== "string" || source.url.length > 2_000 || typeof source.publisher !== "string" || source.publisher.length > 180 ||
      typeof source.excerpt !== "string" || source.excerpt.length > 700) {
      return fail("INVALID", "The attached article source is incomplete.");
    }
    try {
      const url = new URL(source.url);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return fail("INVALID", "Choose a valid article source.");
      url.hash = "";
      articleSource = { title: source.title.trim(), url: url.href, publisher: source.publisher.trim(), excerpt: source.excerpt.trim() };
    } catch {
      return fail("INVALID", "Choose a valid article source.");
    }
  }
  const mode = body.mode === "live" ? "live" : "replay";
  const family = hasBinding ? await getTopic(body.topicSlug!, mode) : null;
  if (hasBinding && (!family || family.id !== body.familyId || (body.familyVersion && body.familyVersion !== family.version))) {
    return fail("UNSUPPORTED_FAMILY", "This topic changed or is no longer available. Reload it before saving a view.", 409);
  }
  const template = body.template || (family?.predicates.length === 1 ? "binary" : family ? "range" : "directional");
  if (!VIEW_TEMPLATES.includes(template)) return fail("UNSUPPORTED_TEMPLATE", "Choose a supported view template for this market.", 409);
  const hasViewIntent = hasBinding && (body.template !== undefined || body.direction !== undefined || body.lowerThreshold != null || body.upperThreshold != null);
  if (hasViewIntent && family) {
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
    articleSource,
    title: typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 100)
      : hasBinding ? body.topicSlug!.replaceAll("-", " ") : body.rationale!.trim().slice(0, 100),
    topicSlug: hasBinding ? body.topicSlug! : "",
    familyId: hasBinding ? body.familyId! : "",
    familyVersion: hasBinding ? body.familyVersion || family?.version || "1" : "",
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
