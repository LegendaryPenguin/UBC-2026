import type { MarketFamily, PayoffSpec } from "@/lib/domain/types";
import { compileDirectional, compileRange, twoTicketAlternative } from "@/lib/payoffs/compile";

export function scaleToMax(spec: PayoffSpec, maxPayout: bigint): PayoffSpec {
  if (spec.maxPayout === 0n) return spec;
  return {
    ...spec,
    maxPayout,
    rows: spec.rows.map((row) => ({
      ...row,
      payout: (row.payout * maxPayout) / spec.maxPayout,
    })),
    notes: [...spec.notes, "Scaled to equal maximum payout."],
  };
}

export function buildComparisons(
  family: MarketFamily,
  custom: PayoffSpec,
  bounds: { lower?: number | null; upper?: number | null; threshold?: number | null; direction?: "yes" | "no" | null },
): { custom: PayoffSpec; ticket: PayoffSpec | null; twoTicket: PayoffSpec | null } {
  const M = custom.maxPayout;
  let ticket: PayoffSpec | null = null;
  let twoTicket: PayoffSpec | null = null;

  if (custom.template === "range" && bounds.lower != null && bounds.upper != null) {
    ticket = compileDirectional(family, bounds.lower, "yes", M);
    const rawTwo = twoTicketAlternative(family, bounds.lower, bounds.upper, M);
    twoTicket = rawTwo ? scaleToMax(rawTwo, M) : null;
  } else if (bounds.threshold != null && bounds.direction) {
    ticket = compileDirectional(family, bounds.threshold, bounds.direction, M);
  }

  return { custom, ticket, twoTicket };
}

export function impliedMiddleInterval(
  lowerBid: number | null,
  lowerAsk: number | null,
  upperBid: number | null,
  upperAsk: number | null,
): { low: number; high: number } | null {
  if (lowerBid == null || lowerAsk == null || upperBid == null || upperAsk == null) return null;
  const low = Math.max(0, lowerBid - upperAsk);
  const high = Math.min(1, lowerAsk - upperBid);
  if (high < low) return null;
  return { low, high };
}

export function computePositionPayout(payouts: bigint[], scenarioIndex: number): bigint {
  if (scenarioIndex < 0 || scenarioIndex >= payouts.length) {
    throw new Error("Unknown scenario");
  }
  return payouts[scenarioIndex];
}

export function makerResidual(maxPayout: bigint, buyerPayout: bigint): bigint {
  return maxPayout - buyerPayout;
}
