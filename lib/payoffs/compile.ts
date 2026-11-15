import type {
  Direction,
  MarketFamily,
  PayoffRow,
  PayoffSpec,
  Scenario,
  ViewTemplate,
} from "@/lib/domain/types";
import { familyHash, payoffHash } from "@/lib/payoffs/hash";

export class CompileError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function rowsFor(
  family: MarketFamily,
  payouts: bigint[],
): PayoffRow[] {
  return family.scenarios.map((s, i) => ({
    scenarioId: s.id,
    label: s.label,
    detail: s.detail,
    payout: payouts[i] ?? 0n,
  }));
}

function spec(
  family: MarketFamily,
  template: ViewTemplate,
  maxPayout: bigint,
  payouts: bigint[],
  sourceContractIds: string[],
  notes: string[],
): PayoffSpec {
  if (maxPayout <= 0n) throw new CompileError("INVALID_SIZE", "Maximum payout must be positive.");
  if (payouts.length !== family.scenarios.length) {
    throw new CompileError("INCOMPATIBLE_RULES", "Payout vector does not match scenario count.");
  }
  for (const p of payouts) {
    if (p < 0n || p > maxPayout) {
      throw new CompileError("INVALID_SIZE", "Payout is outside [0, M].");
    }
  }
  return {
    familyId: family.id,
    familyVersion: family.version,
    familyHash: family.familyHash || familyHash({
      slug: family.slug,
      version: family.version,
      contractIds: family.contracts.map((c) => c.id),
      scenarioLabels: family.scenarios.map((s) => s.label),
      observationTime: family.observationTime,
    }),
    template,
    maxPayout,
    rows: rowsFor(family, payouts),
    payoffHash: payoffHash(payouts),
    sourceContractIds,
    notes,
  };
}

export function sampleValue(scenario: Scenario): number {
  if (scenario.minInclusive != null) return scenario.minInclusive;
  if (scenario.maxExclusive != null) return scenario.maxExclusive - 1;
  return 0;
}

export function compileDirectional(
  family: MarketFamily,
  threshold: number,
  direction: Direction,
  maxPayout: bigint,
): PayoffSpec {
  const pred = family.predicates.find((p) => p.threshold === threshold);
  if (!pred) {
    throw new CompileError("INCOMPATIBLE_RULES", "Threshold is not in this market family.");
  }
  const payouts = family.scenarios.map((s) => {
    const yes = sampleValue(s) >= threshold;
    const win = direction === "yes" ? yes : !yes;
    return win ? maxPayout : 0n;
  });
  return spec(
    family,
    "directional",
    maxPayout,
    payouts,
    [pred.contractId],
    [
      direction === "yes"
        ? `Pays if the observed value is at least ${formatThreshold(threshold, pred.unit)}.`
        : `Pays if the observed value is below ${formatThreshold(threshold, pred.unit)}.`,
    ],
  );
}

export function compileRange(
  family: MarketFamily,
  lower: number,
  upper: number,
  maxPayout: bigint,
): PayoffSpec {
  if (!(lower < upper)) {
    throw new CompileError("INCOMPATIBLE_RULES", "Lower threshold must be below the upper threshold.");
  }
  const a = family.predicates.find((p) => p.threshold === lower);
  const b = family.predicates.find((p) => p.threshold === upper);
  if (!a || !b) {
    throw new CompileError("INCOMPATIBLE_RULES", "Range bounds must match listed contracts.");
  }
  const payouts = family.scenarios.map((s) => {
    const v = sampleValue(s);
    return v >= lower && v < upper ? maxPayout : 0n;
  });
  if (!payouts.some((p) => p > 0n)) {
    throw new CompileError("INCOMPATIBLE_RULES", "Range does not match any valid scenario.");
  }
  return spec(
    family,
    "range",
    maxPayout,
    payouts,
    [a.contractId, b.contractId],
    [
      `Pays only if the observed value is at least ${formatThreshold(lower, a.unit)} and below ${formatThreshold(upper, b.unit)}.`,
      "Ordinary YES on the lower ticket still pays if the value is above the upper bound.",
    ],
  );
}

export function compileView(
  family: MarketFamily,
  template: ViewTemplate,
  args: { threshold?: number | null; direction?: Direction | null; lower?: number | null; upper?: number | null },
  maxPayout: bigint,
): PayoffSpec {
  if (template === "directional") {
    if (args.threshold == null || !args.direction) {
      throw new CompileError("INCOMPATIBLE_RULES", "Directional views need a threshold and side.");
    }
    return compileDirectional(family, args.threshold, args.direction, maxPayout);
  }
  if (args.lower == null || args.upper == null) {
    throw new CompileError("INCOMPATIBLE_RULES", "Range views need lower and upper thresholds.");
  }
  return compileRange(family, args.lower, args.upper, maxPayout);
}

export function twoTicketAlternative(
  family: MarketFamily,
  lower: number,
  upper: number,
  unitPayout: bigint,
): PayoffSpec | null {
  const a = family.predicates.find((p) => p.threshold === lower);
  const b = family.predicates.find((p) => p.threshold === upper);
  if (!a || !b || !(lower < upper)) return null;
  const payouts = family.scenarios.map((s) => {
    const v = sampleValue(s);
    const yesA = v >= lower;
    const noB = v < upper;
    let units = 0n;
    if (yesA) units += 1n;
    if (noB) units += 1n;
    return units * unitPayout;
  });
  const max = payouts.reduce((m, p) => (p > m ? p : m), 0n);
  return spec(
    family,
    "range",
    max,
    payouts,
    [a.contractId, b.contractId],
    [
      "One YES on the lower ticket plus one NO on the upper ticket.",
      "This construction pays outside the target interval and pays twice inside it.",
    ],
  );
}

export function formatThreshold(value: number, unit: string): string {
  if (unit === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }
  return `${value} ${unit}`;
}
