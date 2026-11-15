import type {
  Freshness,
  MarketFamily,
  MarketStatus,
  Predicate,
  Scenario,
  SourceContract,
  SourceEvent,
} from "@/lib/domain/types";
import { familyHash } from "@/lib/payoffs/hash";
import { formatThreshold } from "@/lib/payoffs/compile";
import type { GeminiContract, GeminiEvent } from "@/lib/gemini/client";

const THRESHOLD_RE = /\$?\s*([\d,]+(?:\.\d+)?)\s+or above/i;

function mapStatus(value?: string | null): MarketStatus {
  switch (value) {
    case "approved":
    case "active":
    case "closed":
    case "under_review":
    case "settled":
    case "invalid":
      return value;
    default:
      return "unknown";
  }
}

function parseThreshold(label: string): number | null {
  const match = label.match(THRESHOLD_RE);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function freshness(fetchedAt: string, expiryDate: string | null, live: boolean): Freshness {
  if (!live) return "replay";
  const age = Date.now() - Date.parse(fetchedAt);
  if (!Number.isFinite(age)) return "unavailable";
  if (expiryDate && Date.parse(expiryDate) <= Date.now()) return "stale";
  return age <= 90_000 ? "fresh" : "stale";
}

export function toSourceEvent(event: GeminiEvent, fetchedAt: string, hash: string): SourceEvent {
  return {
    id: event.id,
    ticker: event.ticker,
    title: event.title,
    description: typeof event.description === "string" ? event.description : "",
    sourceUrl: event.termsLink ?? null,
    category: event.category ?? "unknown",
    status: mapStatus(event.status),
    expiryDate: event.expiryDate ?? null,
    effectiveDate: event.effectiveDate ?? null,
    payloadHash: hash,
    fetchedAt,
    sourceAgency: event.sourceDetails?.agency ?? null,
    sourceIndex: event.sourceDetails?.index ?? null,
  };
}

export function toSourceContract(event: GeminiEvent, contract: GeminiContract): SourceContract {
  return {
    id: contract.id,
    instrumentSymbol: contract.instrumentSymbol ?? `${event.ticker}:${contract.ticker ?? contract.id}`,
    eventId: event.id,
    ticker: contract.ticker ?? "",
    label: contract.label,
    termsUrl: contract.termsAndConditionsUrl ?? event.termsLink ?? null,
    expiryDate: contract.expiryDate ?? event.expiryDate ?? null,
    effectiveDate: contract.effectiveDate ?? event.effectiveDate ?? null,
    status: mapStatus(contract.status ?? event.status),
    resolutionSide:
      contract.resolutionSide === "yes" || contract.resolutionSide === "no"
        ? contract.resolutionSide
        : null,
    resolvedAt: contract.resolvedAt ?? null,
    bid: contract.prices?.bestBid ?? contract.prices?.sell?.yes ?? null,
    ask: contract.prices?.bestAsk ?? contract.prices?.buy?.yes ?? null,
    noBid: contract.prices?.sell?.no ?? null,
    noAsk: contract.prices?.buy?.no ?? null,
    lastTrade: contract.prices?.lastTradePrice ?? null,
    priceHistory: contract.priceHistory ?? null,
  };
}

export function buildScenarios(predicates: Predicate[]): Scenario[] {
  const ordered = [...predicates].sort((a, b) => a.threshold - b.threshold);
  const scenarios: Scenario[] = [];
  if (ordered.length === 0) return scenarios;

  scenarios.push({
    id: `below-${ordered[0].threshold}`,
    index: 0,
    label: `Below ${formatThreshold(ordered[0].threshold, ordered[0].unit)}`,
    detail: `value < ${ordered[0].threshold}`,
    minInclusive: null,
    maxExclusive: ordered[0].threshold,
    predicateYes: Object.fromEntries(ordered.map((p) => [p.id, false])),
  });

  for (let i = 0; i < ordered.length; i++) {
    const lo = ordered[i];
    const hi = ordered[i + 1];
    const predicateYes = Object.fromEntries(ordered.map((p) => [p.id, p.threshold <= lo.threshold]));
    scenarios.push({
      id: hi ? `bin-${lo.threshold}-${hi.threshold}` : `at-least-${lo.threshold}`,
      index: i + 1,
      label: hi
        ? `At least ${formatThreshold(lo.threshold, lo.unit)} and below ${formatThreshold(hi.threshold, hi.unit)}`
        : `At least ${formatThreshold(lo.threshold, lo.unit)}`,
      detail: hi ? `${lo.threshold} ≤ value < ${hi.threshold}` : `value ≥ ${lo.threshold}`,
      minInclusive: lo.threshold,
      maxExclusive: hi ? hi.threshold : null,
      predicateYes,
    });
  }
  return scenarios;
}

export function familyFromEvent(
  event: GeminiEvent,
  fetchedAt: string,
  hash: string,
  live: boolean,
): MarketFamily | null {
  const contracts = (event.contracts ?? []).map((c) => toSourceContract(event, c));
  const predicates: Predicate[] = [];
  for (const contract of event.contracts ?? []) {
    const threshold = parseThreshold(contract.label);
    if (threshold == null) continue;
    predicates.push({
      id: contract.id,
      contractId: contract.id,
      instrumentSymbol: contract.instrumentSymbol ?? contract.ticker ?? contract.id,
      label: contract.label,
      kind: "gte",
      threshold,
      unit: "USD",
    });
  }
  predicates.sort((a, b) => a.threshold - b.threshold);
  if (predicates.length < 2) return null;

  const sourceEvent = toSourceEvent(event, fetchedAt, hash);
  const scenarios = buildScenarios(predicates);
  const slug = event.ticker.toLowerCase();
  const version = "1";
  const observationTime = event.expiryDate ?? null;
  const longstop = observationTime
    ? new Date(Date.parse(observationTime) + 7 * 24 * 3600 * 1000).toISOString()
    : null;

  return {
    id: event.ticker,
    slug,
    version,
    mode: live ? "live" : "replay",
    title: event.title,
    question: event.description || event.title,
    observationTime,
    sourceEvent,
    contracts,
    predicates,
    scenarios,
    closeTime: observationTime,
    longstopTime: longstop,
    familyHash: familyHash({
      slug,
      version,
      contractIds: contracts.map((c) => c.id),
      scenarioLabels: scenarios.map((s) => s.label),
      observationTime,
    }),
    // Discovery labels alone do not establish settlement compatibility.
    quotesAvailable: false,
    freshness: freshness(fetchedAt, observationTime, live),
    fetchedAt,
  };
}

export function binaryFromEvent(
  event: GeminiEvent,
  fetchedAt: string,
  hash: string,
  live: boolean,
): MarketFamily | null {
  const contract = event.contracts?.[0];
  if (!contract) return null;
  const sourceEvent = toSourceEvent(event, fetchedAt, hash);
  const sourceContract = toSourceContract(event, contract);
  const predicates: Predicate[] = [
    {
      id: contract.id,
      contractId: contract.id,
      instrumentSymbol: sourceContract.instrumentSymbol,
      label: contract.label || "Up",
      kind: "gte",
      threshold: 1,
      unit: "index",
    },
  ];
  const scenarios: Scenario[] = [
    {
      id: "no",
      index: 0,
      label: "NO / Down",
      detail: "Resolves NO",
      minInclusive: null,
      maxExclusive: 1,
      predicateYes: { [contract.id]: false },
    },
    {
      id: "yes",
      index: 1,
      label: "YES / Up",
      detail: "Resolves YES",
      minInclusive: 1,
      maxExclusive: null,
      predicateYes: { [contract.id]: true },
    },
  ];
  const slug = event.ticker.toLowerCase();
  return {
    id: event.ticker,
    slug,
    version: "1",
    mode: live ? "live" : "replay",
    title: event.title,
    question: event.description || event.title,
    observationTime: event.expiryDate ?? null,
    sourceEvent,
    contracts: [sourceContract],
    predicates,
    scenarios,
    closeTime: event.expiryDate ?? null,
    longstopTime: event.expiryDate
      ? new Date(Date.parse(event.expiryDate) + 7 * 24 * 3600 * 1000).toISOString()
      : null,
    familyHash: familyHash({
      slug,
      version: "1",
      contractIds: [sourceContract.id],
      scenarioLabels: scenarios.map((s) => s.label),
      observationTime: event.expiryDate ?? null,
    }),
    quotesAvailable: false,
    freshness: freshness(fetchedAt, event.expiryDate ?? null, live),
    fetchedAt,
  };
}
