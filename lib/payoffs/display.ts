import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { formatThreshold } from "@/lib/payoffs/compile";

export type ScenarioGroup = { id: string; label: string; indexes: number[] };

/** A range can be shown in three rows when each row has a uniform displayed payoff. */
export function rangeScenarioGroups(family: MarketFamily, thesis: ThesisRevision, payouts: bigint[][]): ScenarioGroup[] | undefined {
  const { lowerThreshold: lower, upperThreshold: upper } = thesis;
  if (thesis.template !== "range" || lower == null || upper == null || family.scenarios.length <= 3 || !payouts.length) return undefined;
  const unit = family.predicates[0]?.unit || "USD";
  const low = formatThreshold(lower, unit);
  const high = formatThreshold(upper, unit);
  const slots = [{ label: `Below ${low}`, indexes: [] as number[] }, { label: `${low} to below ${high}`, indexes: [] as number[] }, { label: `At least ${high}`, indexes: [] as number[] }];
  if (family.scenarios.some(({ minInclusive, maxExclusive }) => [lower, upper].some((boundary) =>
    (minInclusive === null || minInclusive < boundary) && (maxExclusive === null || maxExclusive > boundary),
  ))) return undefined;
  family.scenarios.forEach((scenario, index) => {
    const value = scenario.minInclusive;
    const slot = value === null || value < lower ? 0 : value < upper ? 1 : 2;
    slots[slot].indexes.push(index);
  });
  if (slots.some(({ indexes }) => !indexes.length || payouts.some((series) =>
    indexes.some((index) => series[index] == null || series[index] !== series[indexes[0]]),
  ))) return undefined;
  return slots.map((slot) => ({ ...slot, id: family.scenarios[slot.indexes[0]].id }));
}

export function thesisViewLabel(thesis: ThesisRevision, family?: MarketFamily | null, options?: { exact?: boolean }) {
  const unit = family?.predicates[0]?.unit || "USD";
  if (thesis.template === "binary") {
    const proposition = family?.contracts[0]?.label || "selected contract";
    return thesis.direction ? `${thesis.direction.toUpperCase()} · ${proposition}` : `Choose YES or NO · ${proposition}`;
  }
  if (thesis.template === "directional") {
    if (!thesis.direction) return "Choose a direction and threshold";
    const threshold = thesis.lowerThreshold == null ? "a threshold" : formatThreshold(thesis.lowerThreshold, unit);
    return thesis.direction === "no" ? `Below ${threshold}` : `At or above ${threshold}`;
  }
  const lower = thesis.lowerThreshold == null ? "a lower bound" : formatThreshold(thesis.lowerThreshold, unit);
  const upper = thesis.upperThreshold == null ? "an upper bound" : formatThreshold(thesis.upperThreshold, unit);
  if (options?.exact && thesis.template === "outside") return `Below ${lower} or at or above ${upper}`;
  if (options?.exact) return `At or above ${lower} and below ${upper}`;
  if (thesis.template === "outside") return `Outside ${lower} to ${upper}`;
  return `Between ${lower} and ${upper}`;
}
