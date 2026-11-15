import { describe, expect, it } from "vitest";
import type { MarketFamily } from "@/lib/domain/types";
import { compileRange, compileDirectional, twoTicketAlternative } from "@/lib/payoffs/compile";
import { buildComparisons, computePositionPayout, impliedMiddleInterval, makerResidual } from "@/lib/payoffs/compare";

function family(): MarketFamily {
  return {
    id: "btc-nov20",
    slug: "btc-nov20",
    version: "1",
    mode: "replay",
    title: "BTC price on November 20",
    question: "Where does BTC settle at the observation time?",
    observationTime: "2026-11-20T22:00:00.000Z",
    sourceEvent: {
      id: "e",
      ticker: "BTC2611202200",
      title: "BTC price on November 20",
      description: "Interval BTC price",
      sourceUrl: null,
      category: "Crypto",
      status: "active",
      expiryDate: "2026-11-20T22:00:00.000Z",
      effectiveDate: null,
      payloadHash: "0x",
      fetchedAt: "2026-11-14T00:00:00.000Z",
      sourceAgency: "lukka",
      sourceIndex: "LS-LRRR-XBTUSD",
    },
    contracts: [
      { id: "a", instrumentSymbol: "A", eventId: "e", ticker: "HI95000", label: "$95,000 or above", termsUrl: null, expiryDate: null, effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.70", ask: "0.72", lastTrade: null },
      { id: "b", instrumentSymbol: "B", eventId: "e", ticker: "HI100000", label: "$100,000 or above", termsUrl: null, expiryDate: null, effectiveDate: null, status: "active", resolutionSide: null, resolvedAt: null, bid: "0.28", ask: "0.30", lastTrade: null },
    ],
    predicates: [
      { id: "p95", contractId: "a", instrumentSymbol: "A", label: "$95,000 or above", kind: "gte", threshold: 95000, unit: "USD" },
      { id: "p100", contractId: "b", instrumentSymbol: "B", label: "$100,000 or above", kind: "gte", threshold: 100000, unit: "USD" },
    ],
    scenarios: [
      { id: "s0", index: 0, label: "Below $95,000", detail: "value < 95,000", minInclusive: null, maxExclusive: 95000, predicateYes: { p95: false, p100: false } },
      { id: "s1", index: 1, label: "At least $95,000 and below $100,000", detail: "95,000 ≤ value < 100,000", minInclusive: 95000, maxExclusive: 100000, predicateYes: { p95: true, p100: false } },
      { id: "s2", index: 2, label: "At least $100,000", detail: "value ≥ 100,000", minInclusive: 100000, maxExclusive: null, predicateYes: { p95: true, p100: true } },
    ],
    closeTime: "2026-11-20T22:00:00.000Z",
    longstopTime: "2026-11-27T22:00:00.000Z",
    familyHash: "0x1",
    quotesAvailable: true,
    freshness: "fresh",
    fetchedAt: "2026-11-14T00:00:00.000Z",
  };
}

describe("range compiler", () => {
  it("pays only in the middle scenario", () => {
    const spec = compileRange(family(), 95000, 100000, 100n);
    expect(spec.rows.map((r) => r.payout)).toEqual([0n, 100n, 0n]);
  });

  it("rejects inverted bounds", () => {
    expect(() => compileRange(family(), 100000, 95000, 100n)).toThrow();
  });
});

describe("ticket mismatch", () => {
  it("shows extra outside-range payout on a lower YES ticket", () => {
    const f = family();
    const custom = compileRange(f, 95000, 100000, 1n);
    const ticket = compileDirectional(f, 95000, "yes", 1n);
    const two = twoTicketAlternative(f, 95000, 100000, 1n)!;
    expect(ticket.rows.map((r) => r.payout)).toEqual([0n, 1n, 1n]);
    expect(two.rows.map((r) => r.payout)).toEqual([1n, 2n, 1n]);
    expect(custom.rows.map((r) => r.payout)).toEqual([0n, 1n, 0n]);
  });
});

describe("conservation", () => {
  it("splits locked collateral between buyer and maker", () => {
    const M = 100_000000n;
    const P = 40_000000n;
    const payout = computePositionPayout([0n, M, 0n], 1);
    expect(payout + makerResidual(M, payout)).toBe(M);
    expect(P + (M - P)).toBe(M);
  });
});

describe("comparisons", () => {
  it("keeps equal-max scaling", () => {
    const f = family();
    const custom = compileRange(f, 95000, 100000, 100n);
    const set = buildComparisons(f, custom, { lower: 95000, upper: 100000 });
    expect(set.ticket?.maxPayout).toBe(100n);
    expect(set.twoTicket?.maxPayout).toBe(100n);
  });
});

describe("implied middle interval", () => {
  it("uses conservative bid/ask bounds", () => {
    const interval = impliedMiddleInterval(0.7, 0.72, 0.28, 0.3);
    expect(interval).toEqual({ low: 0.4, high: 0.44 });
  });

  it("returns null when inconsistent", () => {
    expect(impliedMiddleInterval(0.2, 0.21, 0.8, 0.9)).toBeNull();
  });
});
