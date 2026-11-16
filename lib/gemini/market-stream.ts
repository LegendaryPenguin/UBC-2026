export type GeminiMarketStreamUpdate =
  | {
      kind: "book";
      feed: "bookTicker" | "depth5";
      instrumentSymbol: string;
      eventAt: string | null;
      receivedAt: string;
      updateId?: number;
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

function depthSide(value: unknown, best: "highest" | "lowest"): { price: string; size: string } | null {
  if (!Array.isArray(value)) return null;
  const levels = value.flatMap((level) => {
    if (!Array.isArray(level) || level.length < 2) return [];
    const price = decimal(level[0], 0, 1);
    const size = decimal(level[1], 0, Number.MAX_SAFE_INTEGER);
    return price != null && size != null && Number(size) > 0 ? [{ price, size }] : [];
  });
  return levels.reduce<{ price: string; size: string } | null>((selected, level) => {
    if (!selected) return level;
    const improves = best === "highest" ? Number(level.price) > Number(selected.price) : Number(level.price) < Number(selected.price);
    return improves ? level : selected;
  }, null);
}

export function parseGeminiMarketStreamMessage(
  raw: string,
  expectedSymbol: string,
  receivedAt = new Date().toISOString(),
): GeminiMarketStreamUpdate | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  const symbol = typeof message.s === "string" ? message.s : typeof message.symbol === "string" ? message.symbol : null;

  if ("lastUpdateId" in message && "bids" in message && "asks" in message) {
    // Gemini's documented depth5 snapshot omits its symbol. This hook opens a
    // connection for one exact instrument, so only an omitted symbol is
    // inferred from that subscription; an explicit mismatch is still rejected.
    if (symbol && symbol.toUpperCase() !== expectedSymbol.toUpperCase()) return null;
    const updateId = message.lastUpdateId;
    if (typeof updateId !== "number" || !Number.isSafeInteger(updateId) || updateId < 0) return null;
    const bid = depthSide(message.bids, "highest");
    const ask = depthSide(message.asks, "lowest");
    return {
      kind: "book",
      feed: "depth5",
      instrumentSymbol: expectedSymbol,
      eventAt: null,
      receivedAt,
      updateId,
      bid: bid?.price ?? null,
      bidSize: bid?.size ?? null,
      ask: ask?.price ?? null,
      askSize: ask?.size ?? null,
      lastTrade: null,
      lastTradeSize: null,
    };
  }

  if (!symbol || symbol.toUpperCase() !== expectedSymbol.toUpperCase()) return null;
  const timestamp = eventTime(message.E);
  if (!timestamp) return null;

  if ("b" in message || "a" in message) {
    return {
      kind: "book",
      feed: "bookTicker",
      instrumentSymbol: expectedSymbol,
      eventAt: timestamp,
      receivedAt,
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
