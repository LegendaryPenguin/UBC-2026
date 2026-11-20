import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";

export type ResearchRange = {
  lower: number;
  upper: number;
  lowerInclusive: boolean;
  upperInclusive: boolean;
  unit: string;
};

export function marketThesisTitle(thesis: ThesisRevision, family?: MarketFamily | null) {
  const title = thesis.title?.trim();
  const generated = thesis.topicSlug.replaceAll("-", " ");
  if (title && title !== thesis.topicSlug && title !== generated) return title;
  return family?.title || (thesis.topicSlug ? "Gemini market thesis" : "Untitled thesis");
}

export function researchRangeLabel(range: ResearchRange) {
  const lower = range.lower.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const upper = range.upper.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const units = range.unit === "USD" ? "" : ` ${range.unit}`;
  const prefix = range.unit === "USD" ? "$" : "";
  return `${range.lowerInclusive ? "At least" : "More than"} ${prefix}${lower} and ${range.upperInclusive ? "at most" : "less than"} ${prefix}${upper}${units}`;
}

const amount = "\\$?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*([km]\\b)?";

function readBound(text: string, operator: string) {
  const match = text.match(new RegExp(`\\b(${operator})\\s+${amount}`, "i"));
  if (!match) return null;
  const multiplier = match[3]?.toLowerCase() === "k" ? 1_000 : match[3]?.toLowerCase() === "m" ? 1_000_000 : 1;
  const value = Number(match[2].replaceAll(",", "")) * multiplier;
  return Number.isFinite(value) ? { value, inclusive: /^(at least|at most|no more than|up to)$/i.test(match[1]) } : null;
}

export function refineResearchRange(question: string, family: MarketFamily, thesis: ThesisRevision, saved?: ResearchRange | null): ResearchRange | null {
  if (!/\b(?:i think|i expect|i believe|my (?:view|thesis)|make it|change|update|set|instead|though|but|actually|yes)\b/i.test(question)) return null;
  const lower = readBound(question, "more than|greater than|at least|above|over");
  const upper = readBound(question, "no more than|less than|fewer than|at most|up to|below|under");
  if (!lower && !upper) return null;

  let baseLower: typeof lower = saved ? { value: saved.lower, inclusive: saved.lowerInclusive } : null;
  let baseUpper: typeof upper = saved ? { value: saved.upper, inclusive: saved.upperInclusive } : null;
  let unit = saved?.unit || family.predicates[0]?.unit || "";
  if (!saved && thesis.template === "range") {
    if (thesis.lowerThreshold != null) baseLower = { value: thesis.lowerThreshold, inclusive: true };
    if (thesis.upperThreshold != null) baseUpper = { value: thesis.upperThreshold, inclusive: false };
  }
  if (!saved && thesis.template === "directional" && thesis.lowerThreshold != null) {
    if (thesis.direction === "yes") baseLower = { value: thesis.lowerThreshold, inclusive: true };
    if (thesis.direction === "no") baseUpper = { value: thesis.lowerThreshold, inclusive: false };
  }
  if (!saved && thesis.template === "binary" && family.contracts.length === 1) {
    const label = family.contracts[0].label;
    // The sport's listed points line supplies the actual threshold. A binary predicate's index is only 0/1.
    if (!/\bpoints\b/i.test(label)) return null;
    unit = "points";
    const line = readBound(label, "more than|greater than|at least|above|over");
    if (line && thesis.direction === "yes") baseLower = line;
    if (line && thesis.direction === "no") baseUpper = { value: line.value, inclusive: !line.inclusive };
  }
  const lo = lower || baseLower;
  const hi = upper || baseUpper;
  if (!lo || !hi || lo.value >= hi.value) return null;
  return { lower: lo.value, upper: hi.value, lowerInclusive: lo.inclusive, upperInclusive: hi.inclusive, unit };
}

export function matchesListedRange(range: ResearchRange, family: MarketFamily) {
  // The existing range compiler uses verified, inclusive lower and exclusive upper predicates.
  return range.lowerInclusive && !range.upperInclusive && family.predicates.length >= 2 &&
    [range.lower, range.upper].every((value) => family.predicates.some((predicate) => predicate.unit === range.unit && predicate.threshold === value));
}
