import { currentSession } from "@/lib/server/session";
import { fail, ok } from "@/lib/server/http";
import { GeminiPrivateApiError, geminiPrivateRequest } from "@/lib/gemini/private";
import { readStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type PositionBucket = "active" | "settled";

function publicError(error: unknown) {
  if (error instanceof GeminiPrivateApiError) return fail("GEMINI_POSITION_REQUEST", error.message, error.status);
  if (error instanceof Error && error.message === "Gemini account is not connected") return fail("GEMINI_NOT_CONNECTED", error.message, 409);
  return fail("GEMINI_POSITION_REQUEST", "Gemini position data is unavailable. Refresh to try again.", 502);
}

export async function GET(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in to view Gemini positions.", 401);
  const bucket = new URL(req.url).searchParams.get("bucket") as PositionBucket | null;
  if (bucket !== null && bucket !== "active" && bucket !== "settled") return fail("INVALID", "Choose active or settled positions.");
  const selected: PositionBucket = bucket || "active";
  try {
    const response = selected === "settled"
      ? await geminiPrivateRequest<{ positions?: Record<string, unknown>[]; total?: number; [key: string]: unknown }>(
        ctx.account.id,
        "/v1/prediction-markets/positions/settled",
        { limit: 100, offset: 0, sort: "-date" },
        "orders:read",
      )
      : await geminiPrivateRequest<{ positions?: Record<string, unknown>[]; total?: number; [key: string]: unknown }>(
        ctx.account.id,
        "/v1/prediction-markets/positions",
        { limit: 100, offset: 0, sort: "-positionValue" },
        "orders:read",
      );
    const intents = readStore().geminiOrderIntents.filter((intent) => intent.accountId === ctx.account.id && intent.status !== "rejected");
    const positions = (response.positions || []).map((position) => {
      const { accountId: _accountId, ...visible } = position;
      const symbol = typeof position.symbol === "string" ? position.symbol : "";
      const matchingIntents = intents.filter((intent) => intent.symbol === symbol);
      const linkedIntents = matchingIntents.filter((intent) => intent.thesisId);
      const thesisIds = [...new Set(linkedIntents.map((intent) => intent.thesisId!))];
      const hasUnlinkedIntent = matchingIntents.some((intent) => !intent.thesisId);
      const singleCertainLink = thesisIds.length === 1 && linkedIntents.length > 0 && !hasUnlinkedIntent;
      return {
        ...visible,
        ...(singleCertainLink ? { thesisId: thesisIds[0] } : {}),
        ...(thesisIds.length > 1 || (linkedIntents.length > 0 && hasUnlinkedIntent) ? { thesisLinkAmbiguous: true } : {}),
      };
    });
    return ok({ bucket: selected, positions, total: response.total ?? positions.length, snapshotAt: new Date().toISOString() });
  } catch (error) {
    return publicError(error);
  }
}
