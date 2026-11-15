import { currentSession } from "@/lib/server/session";
import { fail, ok, readJson } from "@/lib/server/http";
import { GeminiPrivateApiError, geminiPrivateRequest } from "@/lib/gemini/private";

export const dynamic = "force-dynamic";

type OrderBucket = "active" | "filled" | "cancelled";

function publicError(error: unknown) {
  if (error instanceof GeminiPrivateApiError) return fail("GEMINI_ORDER_REQUEST", error.message, error.status);
  if (error instanceof Error && error.message === "Gemini account is not connected") return fail("GEMINI_NOT_CONNECTED", error.message, 409);
  return fail("GEMINI_ORDER_REQUEST", "Gemini order data is unavailable. Refresh to try again.", 502);
}

export async function GET(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") as OrderBucket | null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.min(Math.max(Number(url.searchParams.get("offset")) || 0, 0), 10_000);
  try {
    if (bucket === "filled" || bucket === "cancelled") {
      const response = await geminiPrivateRequest<{ orders: unknown[]; pagination?: unknown }>(
        ctx.account.id,
        "/v1/prediction-markets/orders/history",
        { status: bucket, limit, offset },
        "orders:read",
      );
      return ok({ bucket, ...response });
    }
    const response = await geminiPrivateRequest<{ orders: unknown[]; pagination?: unknown }>(
      ctx.account.id,
      "/v1/prediction-markets/orders/active",
      { limit, offset },
      "orders:read",
    );
    return ok({ bucket: "active", ...response });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ action?: string; orderId?: string }>(req);
  if (body.action !== "cancel" || !body.orderId || !/^\d{1,24}$/.test(body.orderId)) {
    return fail("INVALID", "Choose an active Gemini order to cancel.");
  }
  try {
    const result = await geminiPrivateRequest<{ result?: string; message?: string }>(
      ctx.account.id,
      "/v1/prediction-markets/order/cancel",
      { orderId: body.orderId },
      "orders:create",
    );
    return ok({ result, message: "Gemini acknowledged the cancellation request. Refresh to confirm the final order status because fills may occur during cancellation." });
  } catch (error) {
    return publicError(error);
  }
}
