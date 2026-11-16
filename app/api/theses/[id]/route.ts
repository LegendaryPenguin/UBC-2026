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

  if (body.action && !["confirm", "duplicate", "archive"].includes(body.action)) {
    return fail("INVALID", "Unknown thesis action.");
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

  if (body.mode !== undefined && !["live", "replay", "paper", "research"].includes(body.mode)) {
    return fail("INVALID", "Choose Live or Replay market data.");
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
