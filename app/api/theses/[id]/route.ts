import type { ThesisRevision, ViewTemplate } from "@/lib/domain/types";
import { fail, ok, readJson } from "@/lib/server/http";
import { mutate, readStore, uid } from "@/lib/server/store";
import { thesisOwner } from "@/lib/server/session";
import { recordThesisVersion, thesisSnapshot } from "@/lib/server/thesis-history";
import { getTopic } from "@/lib/gemini/catalog";
import { compileView } from "@/lib/payoffs/compile";

const VIEW_TEMPLATES: ViewTemplate[] = ["binary", "directional", "range", "outside", "stepped"];

function getOwnedThesis(id: string, accountId: string) {
  return readStore().theses.find((thesis) =>
    thesis.id === id && (thesis as ThesisRevision & { accountId?: string }).accountId === accountId
  );
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const accountId = thesisOwner();
  if (!accountId) return fail("NOT_FOUND", "Thesis not found", 404);
  const thesis = getOwnedThesis(params.id, accountId);
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  return ok({ thesis });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await readJson<Partial<ThesisRevision> & { action?: string; revision?: number; mode?: string }>(req);
  const accountId = thesisOwner();
  if (!accountId) return fail("AUTH", "Thesis owner required", 401);
  const existing = getOwnedThesis(params.id, accountId);
  if (!existing) return fail("NOT_FOUND", "Thesis not found", 404);

  if (body.action === "restore") {
    if (!Number.isInteger(body.revision) || body.revision! < 1) return fail("INVALID", "Choose a valid revision.");
    const revision = (readStore().thesisHistory || []).find((record) =>
      record.thesisId === existing.id &&
      record.accountId === accountId &&
      record.revision === body.revision
    );
    if (!revision) return fail("NOT_FOUND", "Revision not found", 404);

    const now = new Date().toISOString();
    const restored: ThesisRevision & { accountId: string } = {
      ...revision.snapshot,
      id: uid("th"),
      status: "draft",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      accountId,
    };
    mutate((state) => {
      state.theses.push(restored);
      recordThesisVersion(state, restored, accountId, `Restored from revision ${revision.revision}`);
    });
    return ok({ thesis: restored });
  }

  if (body.action && !["confirm", "duplicate", "archive", "unarchive", "rename", "bind"].includes(body.action)) {
    return fail("INVALID", "Unknown thesis action.");
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 100)) {
    return fail("INVALID", "A thesis title must contain 1–100 characters.");
  }
  if (body.template !== undefined && !VIEW_TEMPLATES.includes(body.template)) {
    return fail("INVALID", "Choose a valid payoff template.");
  }
  if (body.direction !== undefined && body.direction !== null && body.direction !== "yes" && body.direction !== "no") {
    return fail("INVALID", "Choose YES or NO direction.");
  }
  for (const threshold of [body.lowerThreshold, body.upperThreshold]) {
    if (threshold !== undefined && threshold !== null && (typeof threshold !== "number" || !Number.isFinite(threshold))) {
      return fail("INVALID", "Thresholds must be finite numbers.");
    }
  }
  if (body.rationale !== undefined && (typeof body.rationale !== "string" || body.rationale.length > 4_000)) {
    return fail("INVALID", "Rationale must be 4,000 characters or fewer.");
  }
  if (body.invalidation !== undefined && (typeof body.invalidation !== "string" || body.invalidation.length > 2_000)) {
    return fail("INVALID", "Reconsideration notes must be 2,000 characters or fewer.");
  }
  if (body.evidenceIds !== undefined && (!Array.isArray(body.evidenceIds) || body.evidenceIds.some((id) => typeof id !== "string"))) {
    return fail("INVALID", "Evidence references are invalid.");
  }
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
      body.articleSource = { title: source.title.trim(), url: url.href, publisher: source.publisher.trim(), excerpt: source.excerpt.trim() };
    } catch {
      return fail("INVALID", "Choose a valid article source.");
    }
  }
  if (body.savedConstruction !== undefined && body.savedConstruction !== null) {
    const construction = body.savedConstruction;
    if (!Array.isArray(construction.basket) || construction.basket.length > 4 ||
        construction.basket.some((leg) => !leg || typeof leg.contractId !== "string" ||
          (leg.side !== "yes" && leg.side !== "no") || typeof leg.payoutAmount !== "string" ||
          typeof leg.enabled !== "boolean") ||
        typeof construction.max !== "string" || typeof construction.savedAt !== "string" ||
        !Number.isInteger(construction.thesisRevision) || typeof construction.familyVersion !== "string") {
      return fail("INVALID", "Saved construction is invalid.");
    }
  }

  if (body.mode !== undefined && !["live", "replay", "paper", "research"].includes(body.mode)) {
    return fail("INVALID", "Choose Live or Replay market data.");
  }
  let bindingFamily: Awaited<ReturnType<typeof getTopic>> = null;
  if (body.action === "bind") {
    if (existing.status !== "draft") return fail("IMMUTABLE", "Only a draft can change its research market.", 409);
    if (typeof body.topicSlug !== "string" || typeof body.familyId !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,78}$/i.test(body.topicSlug)) {
      return fail("INVALID", "Choose a valid supported market.");
    }
    bindingFamily = await getTopic(body.topicSlug, body.mode === "live" ? "live" : "replay");
    if (!bindingFamily || bindingFamily.id !== body.familyId ||
        (body.familyVersion && bindingFamily.version !== body.familyVersion)) {
      return fail("UNSUPPORTED_FAMILY", "This market changed or is no longer compatible. Refresh Explore and choose it again.", 409);
    }
  }
  const viewFieldsChanged = body.template !== undefined || body.direction !== undefined ||
    body.lowerThreshold !== undefined || body.upperThreshold !== undefined;
  if (body.action === "confirm" || viewFieldsChanged) {
    const family = await getTopic(existing.topicSlug, body.mode === "live" ? "live" : "replay");
    if (!family || family.id !== existing.familyId || family.version !== existing.familyVersion) {
      return fail("UNSUPPORTED_FAMILY", "The source market changed or is unavailable. Reload it before confirming this view.", 409);
    }
    const template = body.template ?? existing.template;
    if (template === "stepped") return fail("UNSUPPORTED_TEMPLATE", "Stepped views need the scenario editor, which is not available for this market yet.", 409);
    try {
      compileView(family, template, {
        threshold: body.lowerThreshold !== undefined ? body.lowerThreshold : existing.lowerThreshold,
        direction: body.direction !== undefined ? body.direction : existing.direction,
        lower: body.lowerThreshold !== undefined ? body.lowerThreshold : existing.lowerThreshold,
        upper: body.upperThreshold !== undefined ? body.upperThreshold : existing.upperThreshold,
      }, 100_000000n);
    } catch (error) {
      return fail("INCOMPATIBLE_RULES", error instanceof Error ? error.message : "The view does not match this market.", 409);
    }
  }

  let result: ThesisRevision | null = null;
  mutate((state) => {
    state.thesisHistory ??= [];
    const thesis = state.theses.find((item) =>
      item.id === existing.id && (item as ThesisRevision & { accountId?: string }).accountId === accountId
    );
    if (!thesis) return;

    if (body.action === "duplicate") {
      const now = new Date().toISOString();
      const copy = {
        ...thesis,
        title: `${(body.title ?? thesis.title ?? thesis.topicSlug).trim()} copy`.slice(0, 100),
        ...(body.template !== undefined ? { template: body.template } : {}),
        ...(body.direction !== undefined ? { direction: body.direction } : {}),
        ...(body.lowerThreshold !== undefined ? { lowerThreshold: body.lowerThreshold } : {}),
        ...(body.upperThreshold !== undefined ? { upperThreshold: body.upperThreshold } : {}),
        ...(body.rationale !== undefined ? { rationale: body.rationale } : {}),
        ...(body.invalidation !== undefined ? { invalidation: body.invalidation } : {}),
        ...(body.evidenceIds !== undefined ? { evidenceIds: [...body.evidenceIds] } : {}),
        id: uid("th"),
        status: "draft" as const,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        evidenceIds: [...(body.evidenceIds ?? thesis.evidenceIds)],
      };
      state.theses.push(copy);
      recordThesisVersion(state, copy, accountId, `Copied from revision ${thesis.revision}`);
      result = copy;
      return;
    }

    if (body.action === "archive") {
      (thesis as ThesisRevision & { archived?: boolean }).archived = true;
      thesis.updatedAt = new Date().toISOString();
      result = thesis;
      return;
    }

    if (body.action === "unarchive") {
      (thesis as ThesisRevision & { archived?: boolean }).archived = false;
      thesis.updatedAt = new Date().toISOString();
      result = thesis;
      return;
    }

    if (body.action === "rename") {
      thesis.title = body.title!.trim();
      thesis.updatedAt = new Date().toISOString();
      result = thesis;
      return;
    }

    if (body.action === "bind" && bindingFamily) {
      const single = bindingFamily.predicates.length === 1 && bindingFamily.contracts.length === 1;
      thesis.topicSlug = bindingFamily.slug;
      thesis.familyId = bindingFamily.id;
      thesis.familyVersion = bindingFamily.version;
      thesis.template = single ? "binary" : bindingFamily.predicates.length >= 2 ? "range" : "directional";
      thesis.direction = "yes";
      thesis.lowerThreshold = single ? null : bindingFamily.predicates[0]?.threshold ?? null;
      thesis.upperThreshold = !single && bindingFamily.predicates.length >= 2 ? bindingFamily.predicates[1]?.threshold ?? null : null;
      thesis.revision += 1;
      thesis.updatedAt = new Date().toISOString();
      recordThesisVersion(state, thesis, accountId, "Bound research market");
      result = thesis;
      return;
    }

    const before = thesisSnapshot(thesis);
    if (body.template !== undefined) thesis.template = body.template;
    if (body.direction !== undefined) thesis.direction = body.direction;
    if (body.lowerThreshold !== undefined) thesis.lowerThreshold = body.lowerThreshold;
    if (body.upperThreshold !== undefined) thesis.upperThreshold = body.upperThreshold;
    if (body.rationale !== undefined) thesis.rationale = body.rationale;
    if (body.invalidation !== undefined) thesis.invalidation = body.invalidation;
    if (body.evidenceIds !== undefined) thesis.evidenceIds = [...body.evidenceIds];
    if (body.articleSource !== undefined) thesis.articleSource = body.articleSource ? { ...body.articleSource } : null;
    if (body.savedConstruction !== undefined) {
      thesis.savedConstruction = body.savedConstruction ? {
        ...body.savedConstruction,
        basket: body.savedConstruction.basket.map((leg) => ({ ...leg })),
      } : null;
      thesis.updatedAt = new Date().toISOString();
    }

    const candidate = thesisSnapshot(thesis);
    const contentChanged = JSON.stringify({ ...before, status: undefined }) !== JSON.stringify({ ...candidate, status: undefined });
    const nextStatus = body.action === "confirm"
      ? "confirmed"
      : contentChanged ? "draft" : thesis.status;
    const statusChanged = thesisSnapshot({ ...thesis, status: nextStatus }).status !== before.status;

    if (contentChanged || statusChanged) {
      thesis.status = nextStatus;
      thesis.revision += 1;
      thesis.updatedAt = new Date().toISOString();
      for (const quote of state.quotes) {
        if (quote.thesisId === thesis.id && (quote.status === "available" || quote.status === "requested")) {
          quote.status = "invalidated";
        }
      }
      recordThesisVersion(state, thesis, accountId, body.action === "confirm" ? "Confirmed view" : "Saved changes");
    }

    result = thesis;
  });

  if (!result) return fail("NOT_FOUND", "Thesis not found", 404);
  return ok({ thesis: result });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const accountId = thesisOwner();
  if (!accountId) return fail("AUTH", "Thesis owner required", 401);
  const store = readStore();
  const thesis = store.theses.find((item) => item.id === params.id &&
    (item as ThesisRevision & { accountId?: string }).accountId === accountId);
  if (!thesis) return fail("NOT_FOUND", "Thesis not found", 404);
  if (thesis.status !== "draft") return fail("IMMUTABLE", "Only an unconfirmed draft can be deleted.", 409);
  if (store.quotes.some((quote) => quote.thesisId === thesis.id && quote.accountId === accountId) ||
      store.positions.some((position) => position.thesisId === thesis.id && position.accountId === accountId)) {
    return fail("IMMUTABLE", "This thesis has financial records and cannot be deleted. Archive it instead.", 409);
  }
  mutate((state) => {
    state.theses = state.theses.filter((item) => item.id !== thesis.id ||
      (item as ThesisRevision & { accountId?: string }).accountId !== accountId);
    state.thesisHistory = (state.thesisHistory || []).filter((record) => record.thesisId !== thesis.id || record.accountId !== accountId);
    for (const conversation of state.conversations) {
      if (conversation.accountId === accountId && conversation.thesisId === thesis.id) {
        conversation.kind = "general";
        conversation.thesisId = null;
      }
    }
  });
  return ok({ deleted: true, id: thesis.id });
}
