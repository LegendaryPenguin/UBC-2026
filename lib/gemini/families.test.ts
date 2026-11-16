import { describe, expect, it } from "vitest";
import { geminiRichText, type GeminiEvent } from "@/lib/gemini/types";
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

  it("retains nested Gemini contract wording, strike data, source, and exact terms URL", () => {
    const description = {
      data: {},
      content: [{ data: {}, marks: [], value: "If BTC is $95,000 or above at expiry, this resolves YES. Otherwise, NO." }],
      nodeType: "document",
    };
    const event = activeEvent({
      contracts: [{
        ...activeEvent().contracts![0],
        description,
        source: "LS-LRRR-XBTUSD",
        strike: { value: "95000", type: "above", availableAt: "2026-11-20T22:00:00.000Z" },
        termsAndConditionsUrl: "https://example.com/exact-contract.pdf",
      }],
    });
    const binary = binaryFromEvent(event, "2026-11-15T01:00:00.000Z", "0xpayload", true, "contract-95");

    expect(geminiRichText(description)).toBe("If BTC is $95,000 or above at expiry, this resolves YES. Otherwise, NO.");
    expect(geminiRichText("Use the [full contract rules](https://example.com/terms.pdf)."))
      .toBe("Use the full contract rules.");
    expect(binary?.contracts[0]).toMatchObject({
      description: "If BTC is $95,000 or above at expiry, this resolves YES. Otherwise, NO.",
      source: "LS-LRRR-XBTUSD",
      strike: { value: "95000", type: "above", availableAt: "2026-11-20T22:00:00.000Z" },
      termsUrl: "https://example.com/exact-contract.pdf",
    });
  });

  it("does not label event-level terms as exact contract rules", () => {
    const event = activeEvent({
      contracts: [{ ...activeEvent().contracts![0], termsAndConditionsUrl: null }],
    });
    const family = binaryFromEvent(event, "2026-11-15T01:00:00.000Z", "0xpayload", true, "contract-95");

    expect(toSourceContract(event, event.contracts![0]).termsUrl).toBeNull();
    expect(family?.contracts[0].termsUrl).toBeNull();
    expect(family?.sourceEvent.sourceUrl).toBe("https://example.com/event-terms");
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
