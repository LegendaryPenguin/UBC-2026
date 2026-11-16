import type { MarketFamily, PayoffSpec } from "@/lib/domain/types";
import { compileBinary, compileDirectional, compileRange, twoTicketAlternative } from "@/lib/payoffs/compile";

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
  } else if (custom.template === "binary" && bounds.direction) {
    ticket = compileBinary(family, bounds.direction, M);
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
  const scale = 1_000_000;
  const low = Math.max(0, Math.round((lowerBid - upperAsk) * scale)) / scale;
  const high = Math.min(scale, Math.round((lowerAsk - upperBid) * scale)) / scale;
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

export interface ReferenceCostLeg {
  contractId: string;
  contractLabel: string;
  side: "yes" | "no";
  payoutAmount: bigint;
  referencePrice: string;
}

export interface ReferenceCostEstimate {
  total: bigint;
  legs: ReferenceCostLeg[];
}

function priceMicros(value: string | null | undefined): bigint | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return null;
  return BigInt(Math.round(parsed * 1_000_000));
}

function referenceCostLeg(
  family: MarketFamily,
  contractId: string,
  side: "yes" | "no",
  payoutAmount: bigint,
): ReferenceCostLeg | null {
  const contract = family.contracts.find((item) => item.id === contractId);
  if (!contract || contract.status !== "active") return null;
  const referencePrice = side === "yes" ? contract.ask : contract.noAsk;
  const price = priceMicros(referencePrice);
  if (price == null) return null;
  return { contractId, contractLabel: contract.label, side, payoutAmount, referencePrice: referencePrice! };
}

function costOfLeg(leg: ReferenceCostLeg): bigint {
  return (leg.payoutAmount * priceMicros(leg.referencePrice)!) / 1_000_000n;
}

export function estimateSingleTicketCost(
  family: MarketFamily,
  contractId: string | undefined,
  side: "yes" | "no" | null,
  maxPayout: bigint,
): ReferenceCostEstimate | null {
  if (family.mode === "live" && family.freshness !== "fresh") return null;
  if (!contractId || !side || maxPayout <= 0n) return null;
  const leg = referenceCostLeg(family, contractId, side, maxPayout);
  return leg ? { total: costOfLeg(leg), legs: [leg] } : null;
}

export function estimateTwoTicketCost(
  family: MarketFamily,
  lowerContractId: string | undefined,
  upperContractId: string | undefined,
  maxPayout: bigint,
): ReferenceCostEstimate | null {
  if (family.mode === "live" && family.freshness !== "fresh") return null;
  if (!lowerContractId || !upperContractId || maxPayout <= 0n) return null;
  const halfPayout = maxPayout / 2n;
  const legs = [
    referenceCostLeg(family, lowerContractId, "yes", halfPayout),
    referenceCostLeg(family, upperContractId, "no", halfPayout),
  ];
  if (legs.some((leg) => leg === null)) return null;
  const completeLegs = legs as ReferenceCostLeg[];
  return { total: completeLegs.reduce((total, leg) => total + costOfLeg(leg), 0n), legs: completeLegs };
}

export function estimateBasketCost(
  family: MarketFamily,
  legs: { contractId: string; side: "yes" | "no"; payoutAmount: bigint; enabled: boolean }[],
): ReferenceCostEstimate | null {
  if (family.mode === "live" && family.freshness !== "fresh") return null;
  const activeLegs = legs.filter((leg) => leg.enabled && leg.payoutAmount > 0n);
  if (!activeLegs.length) return null;
  const references = activeLegs.map((leg) => referenceCostLeg(family, leg.contractId, leg.side, leg.payoutAmount));
  if (references.some((leg) => leg === null)) return null;
  const completeLegs = references as ReferenceCostLeg[];
  return { total: completeLegs.reduce((total, leg) => total + costOfLeg(leg), 0n), legs: completeLegs };
}
