import { currentSession } from "@/lib/server/session";
import { fail, ok, readJson } from "@/lib/server/http";
import { GeminiPrivateApiError, geminiPrivateRequest } from "@/lib/gemini/private";
import { getEvent } from "@/lib/gemini/client";
import { flattenEvents, type GeminiContract } from "@/lib/gemini/types";
import { geminiAccessToken } from "@/lib/gemini/oauth";
import { mutate, readStore, type GeminiOrderIntent } from "@/lib/server/store";

export const dynamic = "force-dynamic";

type OrderBucket = "active" | "filled" | "cancelled";

interface PlaceBody {
  action: "place";
  intentId: string;
  ticker: string;
  symbol: string;
  side: "buy" | "sell";
  outcome: "yes" | "no";
  quantity: string;
  price: string;
}

function publicError(error: unknown) {
  if (error instanceof GeminiPrivateApiError) return fail("GEMINI_ORDER_REQUEST", error.message, error.status);
  if (error instanceof Error && error.message === "Gemini account is not connected") return fail("GEMINI_NOT_CONNECTED", error.message, 409);
  if (error instanceof Error && error.message === "Gemini event 404") return fail("NOT_FOUND", "Gemini could not find this event.", 404);
  return fail("GEMINI_ORDER_REQUEST", "Gemini order data is unavailable. Refresh to try again.", 502);
}

const DECIMAL_SCALE = 1_000_000_000_000n;

function decimalUnits(value: string): bigint | null {
  const match = value.match(/^(0|[1-9]\d*)(?:\.(\d{1,12}))?$/);
  if (!match) return null;
  const fractional = (match[2] || "").padEnd(12, "0");
  return BigInt(match[1]) * DECIMAL_SCALE + BigInt(fractional || "0");
}

function onGrid(value: string, minimum: string, increment: string) {
  const amount = decimalUnits(value);
  const floor = decimalUnits(minimum);
  const step = decimalUnits(increment);
  return amount != null && floor != null && step != null && step > 0n && amount >= floor && amount % step === 0n;
}

function matchingContract(events: ReturnType<typeof flattenEvents>, symbol: string): GeminiContract | undefined {
  return events.flatMap((event) => event.contracts || []).find((contract) => contract.instrumentSymbol === symbol);
}

function visibleIntent(intent: GeminiOrderIntent) {
  const { accountId: _accountId, ...safe } = intent;
  return safe;
}

function matchesIntent(intent: GeminiOrderIntent, body: PlaceBody) {
  return intent.ticker === body.ticker && intent.symbol === body.symbol && intent.side === body.side &&
    intent.outcome === body.outcome && intent.quantity === body.quantity && intent.price === body.price;
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
    const unresolvedIntents = bucket === "active"
      ? readStore().geminiOrderIntents
          .filter((intent) => intent.accountId === ctx.account.id && (intent.status === "submitting" || intent.status === "unknown"))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 20)
          .map(visibleIntent)
      : [];
    return ok({ bucket: "active", ...response, unresolvedIntents });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<Partial<Omit<PlaceBody, "action">> & { action?: string; orderId?: string }>(req);

  if (body.action === "cancel") {
    if (!body.orderId || !/^\d{1,24}$/.test(body.orderId)) return fail("INVALID", "Choose an active Gemini order to cancel.");
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

  if (body.action !== "place" || !body.intentId || !/^[A-Za-z0-9_-]{16,80}$/.test(body.intentId) ||
    !body.ticker || !/^[A-Za-z0-9_-]{1,80}$/.test(body.ticker) ||
    !body.symbol || !/^GEMI-[A-Za-z0-9_-]{1,160}$/.test(body.symbol) ||
    (body.side !== "buy" && body.side !== "sell") || (body.outcome !== "yes" && body.outcome !== "no") ||
    typeof body.quantity !== "string" || typeof body.price !== "string") {
    return fail("INVALID", "Provide a valid Gemini limit-order intent.");
  }
  const orderBody = body as PlaceBody;

  const existing = readStore().geminiOrderIntents.find((intent) => intent.accountId === ctx.account.id && intent.id === orderBody.intentId);
  if (existing) {
    if (!matchesIntent(existing, orderBody)) return fail("IDEMPOTENCY_CONFLICT", "This order intent ID was already used for different order terms.", 409);
    return ok({ intent: visibleIntent(existing), duplicate: true }, existing.status === "submitting" ? 202 : 200);
  }

  try {
    const authorization = await geminiAccessToken(ctx.account.id);
    if (!authorization.scopes.includes("orders:create")) return fail("GEMINI_SCOPE", "Trading permission is required. Connect with trading from Connection settings.", 403);

    const { event } = await getEvent(orderBody.ticker);
    if (event.status.toLowerCase() !== "active") return fail("GEMINI_MARKET_CLOSED", "Gemini does not list this event as active.", 409);
    const contract = matchingContract(flattenEvents([event]), orderBody.symbol);
    if (!contract || contract.status?.toLowerCase() !== "active") return fail("GEMINI_CONTRACT_UNAVAILABLE", "Gemini did not return this active contract.", 409);
    if (contract.marketState && contract.marketState.toLowerCase() !== "open") return fail("GEMINI_MARKET_CLOSED", "Gemini does not list this contract as open.", 409);
    const expiry = contract.expiryDate || event.expiryDate;
    if (expiry && Date.parse(expiry) <= Date.now()) return fail("GEMINI_MARKET_CLOSED", "This Gemini contract has expired.", 409);
    if (!contract.quantityMinimum || !contract.quantityIncrement || !contract.priceMinimum || !contract.priceIncrement) {
      return fail("GEMINI_TICK_UNAVAILABLE", "Gemini has not supplied the quantity and price increments required for a safe order.", 409);
    }
    if (!onGrid(orderBody.quantity, contract.quantityMinimum, contract.quantityIncrement)) {
      return fail("INVALID_QUANTITY", `Quantity must be at least ${contract.quantityMinimum} and align to ${contract.quantityIncrement}.`);
    }
    if (!onGrid(orderBody.price, contract.priceMinimum, contract.priceIncrement)) {
      return fail("INVALID_PRICE", `Limit price must be at least ${contract.priceMinimum} and align to ${contract.priceIncrement}.`);
    }
    const priceUnits = decimalUnits(orderBody.price);
    if (priceUnits == null || priceUnits <= 0n || priceUnits >= DECIMAL_SCALE) return fail("INVALID_PRICE", "Limit price must be between 0 and 1.");

    const terms = await geminiPrivateRequest<{ hasAcceptedLatest: boolean }>(
      ctx.account.id,
      "/v1/prediction-markets/terms/status",
      {},
      "orders:read",
    );
    if (!terms.hasAcceptedLatest) return fail("GEMINI_TERMS_REQUIRED", "Review and accept Gemini's latest prediction-market terms before placing an order.", 409);

    const now = new Date().toISOString();
    const intent: GeminiOrderIntent = {
      id: orderBody.intentId,
      accountId: ctx.account.id,
      symbol: orderBody.symbol,
      ticker: orderBody.ticker,
      side: orderBody.side,
      outcome: orderBody.outcome,
      quantity: orderBody.quantity,
      price: orderBody.price,
      status: "submitting",
      venueOrderId: null,
      createdAt: now,
      updatedAt: now,
      message: "Submitting one limit order to Gemini.",
    };
    const reservation = mutate((store) => {
      const existing = store.geminiOrderIntents.find((item) => item.accountId === ctx.account.id && item.id === orderBody.intentId);
      if (existing) return { intent: existing, created: false };
      store.geminiOrderIntents.push(intent);
      return { intent, created: true };
    });
    if (!reservation.created) {
      if (!matchesIntent(reservation.intent, orderBody)) return fail("IDEMPOTENCY_CONFLICT", "This order intent ID was already used for different order terms.", 409);
      return ok({ intent: visibleIntent(reservation.intent), duplicate: true }, reservation.intent.status === "submitting" ? 202 : 200);
    }

    try {
      const order = await geminiPrivateRequest<{ orderId?: string | number; status?: string }>(
        ctx.account.id,
        "/v1/prediction-markets/order",
        {
          symbol: orderBody.symbol,
          orderType: "limit",
          side: orderBody.side,
          quantity: orderBody.quantity,
          price: orderBody.price,
          outcome: orderBody.outcome,
          timeInForce: "good-til-cancel",
        },
        "orders:create",
      );
      const rejected = order.status?.toLowerCase() === "rejected";
      const message = rejected
        ? "Gemini rejected the order. Review the venue response before creating a new intent."
        : "Gemini returned an order response. Refresh Native orders to inspect current fills and status.";
      const saved = mutate((store) => {
        const record = store.geminiOrderIntents.find((item) => item.accountId === ctx.account.id && item.id === orderBody.intentId);
        if (!record) return null;
        record.status = rejected ? "rejected" : "accepted";
        record.venueOrderId = order.orderId == null ? null : String(order.orderId);
        record.updatedAt = new Date().toISOString();
        record.message = message;
        return record;
      });
      return ok({ intent: saved ? visibleIntent(saved) : null, order, message }, 201);
    } catch (error) {
      const uncertain = !(error instanceof GeminiPrivateApiError) || error.status >= 500 || error.status === 429;
      const message = uncertain
        ? "Gemini's response was not conclusive. The app will not resubmit this intent. Inspect Native orders before taking another action."
        : error instanceof Error ? error.message : "Gemini rejected the order request.";
      const saved = mutate((store) => {
        const record = store.geminiOrderIntents.find((item) => item.accountId === ctx.account.id && item.id === orderBody.intentId);
        if (!record) return null;
        record.status = uncertain ? "unknown" : "rejected";
        record.updatedAt = new Date().toISOString();
        record.message = message;
        return record;
      });
      if (uncertain) return ok({ intent: saved ? visibleIntent(saved) : null, message }, 202);
      return publicError(error);
    }
  } catch (error) {
    return publicError(error);
  }
}
