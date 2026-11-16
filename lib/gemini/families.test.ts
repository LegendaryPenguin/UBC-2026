import { describe, expect, it } from "vitest";
import type { GeminiEvent } from "@/lib/gemini/types";
import { binaryFromEvent, familyFromEvent, toSourceContract } from "@/lib/gemini/families";
import { compileBinary, compileView } from "@/lib/payoffs/compile";

function activeEvent(overrides: Partial<GeminiEvent> = {}): GeminiEvent {
  return {
    id: "event-1",
    ticker: "BTCFRIDAY",
    title: "Where will Bitcoin finish Friday?",
    description: "Bitcoin settlement at the Friday deadline",
    category: "Crypto",
    type: "categorical",
    status: "active",
    expiryDate: "2026-11-20T23:59:00.000Z",
    effectiveDate: "2026-11-15T00:00:00.000Z",
    termsLink: "https://example.com/event-terms",
    sourceDetails: { agency: "Kaiko", index: "BTC-USD" },
    contracts: [
      {
        id: "contract-95",
        ticker: "HI95K",
        instrumentSymbol: "GEMI-BTCFRIDAY-HI95K",
        label: "$95,000 or above",
        status: "active",
        expiryDate: "2026-11-20T23:59:00.000Z",
        effectiveDate: "2026-11-15T00:00:00.000Z",
        termsAndConditionsUrl: "https://example.com/event-terms",
        prices: { bestBid: "0.60", bestAsk: "0.62", lastTradePrice: "0.61" },
      },
      {
        id: "contract-100",
        ticker: "HI100K",
        instrumentSymbol: "GEMI-BTCFRIDAY-HI100K",
        label: "$100,000 or above",
        status: "active",
        expiryDate: "2026-11-20T23:59:00.000Z",
        effectiveDate: "2026-11-15T00:00:00.000Z",
        termsAndConditionsUrl: "https://example.com/event-terms",
        prices: { bestBid: "0.25", bestAsk: "0.27", lastTradePrice: "0.26" },
      },
    ],
    ...overrides,
  };
}

describe("Gemini live market semantics", () => {
  it("does not infer a live threshold family from similar labels", () => {
    expect(familyFromEvent(activeEvent(), "2026-11-15T01:00:00.000Z", "0xpayload", true)).toBeNull();
  });

  it("builds one distinct binary family per real instrument symbol", () => {
    const event = activeEvent();
    const first = binaryFromEvent(event, "2026-11-15T01:00:00.000Z", "0xpayload", true, "contract-95");
    const second = binaryFromEvent(event, "2026-11-15T01:00:00.000Z", "0xpayload", true, "contract-100");

    expect(first?.contracts).toHaveLength(1);
    expect(first?.predicates).toHaveLength(1);
    expect(first?.contracts[0].instrumentSymbol).toBe("GEMI-BTCFRIDAY-HI95K");
    expect(first?.slug).not.toBe(second?.slug);
    expect(first?.familyHash).not.toBe(second?.familyHash);
    expect(compileBinary(first!, "yes", 100n).rows.map((row) => row.payout)).toEqual([0n, 100n]);
    expect(compileView(first!, "binary", { direction: "no" }, 100n).rows.map((row) => row.payout)).toEqual([100n, 0n]);
  });

  it("does not manufacture an instrument symbol when Gemini omits it", () => {
    const event = activeEvent({ contracts: [{ ...activeEvent().contracts![0], instrumentSymbol: undefined }] });
    expect(toSourceContract(event, event.contracts![0]).instrumentSymbol).toBe("");
    expect(binaryFromEvent(event, "2026-11-15T01:00:00.000Z", "0xpayload", true, "contract-95")).toBeNull();
  });

  it("maps only validated depth levels from the exact instrument key", () => {
    const event = activeEvent({
      contractOrderbooks: {
        "GEMI-BTCFRIDAY-HI95K": {
          bids: [{ side: "buy", price: "0.61", quantity: "12" }, { side: "buy", price: "bad", quantity: "8" }],
          asks: [{ side: "buy", price: "0.63", quantity: "7" }],
        },
      },
    });
    const mapped = toSourceContract(event, event.contracts![0], "2026-11-15T01:00:00.000Z");
    expect(mapped.orderBook).toEqual({
      bids: [{ price: "0.61", quantity: "12" }],
      asks: [{ price: "0.63", quantity: "7" }],
      receivedAt: "2026-11-15T01:00:00.000Z",
      sourceTime: null,
    });
  });
});
