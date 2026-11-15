import { currentSession } from "@/lib/server/session";
import { fail, ok } from "@/lib/server/http";
import { GeminiPrivateApiError, geminiPrivateRequest } from "@/lib/gemini/private";

export const dynamic = "force-dynamic";

type TermsStatus = { hasAcceptedLatest: boolean; acceptedVersion?: number; latestVersion?: number };
type TermsDocument = { termsType?: string; version?: number; content?: string; updatedAt?: string };

function publicError(error: unknown) {
  if (error instanceof GeminiPrivateApiError) return fail("GEMINI_TERMS", error.message, error.status);
  if (error instanceof Error && error.message === "Gemini account is not connected") return fail("GEMINI_NOT_CONNECTED", error.message, 409);
  return fail("GEMINI_TERMS", "Gemini terms status could not be retrieved. No acceptance or order was sent.", 502);
}

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  try {
    const status = await geminiPrivateRequest<TermsStatus>(ctx.account.id, "/v1/prediction-markets/terms/status", {}, "orders:read");
    const terms = status.hasAcceptedLatest
      ? null
      : await geminiPrivateRequest<TermsDocument>(ctx.account.id, "/v1/prediction-markets/terms", {}, "orders:read");
    return ok({ status, terms });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  let body: { reviewedVersion?: unknown };
  try {
    body = await req.json() as { reviewedVersion?: unknown };
  } catch {
    return fail("INVALID", "Review the current Gemini terms before accepting them.");
  }
  if (!Number.isInteger(body.reviewedVersion)) return fail("INVALID", "Review the current Gemini terms before accepting them.");
  try {
    const status = await geminiPrivateRequest<TermsStatus>(ctx.account.id, "/v1/prediction-markets/terms/status", {}, "orders:read");
    if (status.hasAcceptedLatest) return ok({ accepted: true, alreadyAccepted: true });
    const terms = await geminiPrivateRequest<TermsDocument>(ctx.account.id, "/v1/prediction-markets/terms", {}, "orders:read");
    if (terms.version !== body.reviewedVersion) return fail("GEMINI_TERMS_CHANGED", "Gemini updated its terms after you reviewed them. Review the latest version before accepting.", 409);
    const result = await geminiPrivateRequest<{ success?: boolean }>(ctx.account.id, "/v1/prediction-markets/terms/accept", {}, "orders:create");
    if (result.success === false) return fail("GEMINI_TERMS", "Gemini did not confirm terms acceptance.", 502);
    return ok({ accepted: true, alreadyAccepted: false });
  } catch (error) {
    return publicError(error);
  }
}
