export type GeminiMarketStreamUpdate =
  | {
      kind: "book";
      instrumentSymbol: string;
      eventAt: string;
      bid: string | null;
      bidSize: string | null;
      ask: string | null;
      askSize: string | null;
      lastTrade: string | null;
      lastTradeSize: string | null;
    }
  | {
      kind: "trade";
      instrumentSymbol: string;
      eventAt: string;
      tradeId: string;
      price: string;
      quantity: string;
    };

function decimal(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string" || !/^(?:\d+)(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? value : null;
}

function eventTime(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  // Gemini market stream event times are nanoseconds; accept milliseconds too
  // for forward-compatible fixtures and format them as UTC ISO timestamps.
  const milliseconds = value > 1e15 ? Math.floor(value / 1e6) : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseGeminiMarketStreamMessage(raw: string, expectedSymbol: string): GeminiMarketStreamUpdate | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.s !== expectedSymbol) return null;
  const timestamp = eventTime(message.E);
  if (!timestamp) return null;

  if ("b" in message || "a" in message) {
    return {
      kind: "book",
      instrumentSymbol: expectedSymbol,
      eventAt: timestamp,
      bid: decimal(message.b, 0, 1),
      bidSize: decimal(message.B, 0, Number.MAX_SAFE_INTEGER),
      ask: decimal(message.a, 0, 1),
      askSize: decimal(message.A, 0, Number.MAX_SAFE_INTEGER),
      lastTrade: decimal(message.c, 0, 1),
      lastTradeSize: decimal(message.C, 0, Number.MAX_SAFE_INTEGER),
    };
  }

  const price = decimal(message.p, 0, 1);
  const quantity = decimal(message.q, 0, Number.MAX_SAFE_INTEGER);
  if (price == null || quantity == null || Number(quantity) <= 0 || (typeof message.t !== "string" && typeof message.t !== "number")) return null;
  return {
    kind: "trade",
    instrumentSymbol: expectedSymbol,
    eventAt: timestamp,
    tradeId: String(message.t),
    price,
    quantity,
  };
}
