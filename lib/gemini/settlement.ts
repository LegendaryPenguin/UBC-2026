import { keccak256, stringToHex } from "viem";
import type { MarketFamily } from "@/lib/domain/types";
import type { GeminiEvent } from "@/lib/gemini/types";
import { binaryFromEvent, familyFromEvent } from "@/lib/gemini/families";

export function settledGeminiOutcome(params: {
  event: GeminiEvent;
  fetchedAt: string;
  payloadHash: string;
  expectedFamilyHash: string;
  expectedPayouts: string[];
  expectedLabels: string[];
}) {
  const { event, fetchedAt, payloadHash } = params;
  if (!event.ticker || event.status !== "settled" || !Array.isArray(event.contracts) || event.contracts.length === 0) {
    throw new Error("Gemini has not reported this event as settled.");
  }
  const contracts = event.contracts;
  if (contracts.some((contract) => contract.status !== "settled" ||
    (contract.resolutionSide !== "yes" && contract.resolutionSide !== "no") ||
    !contract.resolvedAt || !Number.isFinite(Date.parse(contract.resolvedAt)))) {
    throw new Error("Every Gemini contract must have a final side and resolution timestamp.");
  }
  const resolvedAt = event.resolvedAt || contracts.map((contract) => contract.resolvedAt!).sort().at(-1)!;
  if (!Number.isFinite(Date.parse(resolvedAt))) throw new Error("Gemini's event resolution timestamp is invalid.");

  const family: MarketFamily | null = familyFromEvent(event, fetchedAt, payloadHash, true) ??
    (contracts.length === 1 ? binaryFromEvent(event, fetchedAt, payloadHash, true) : null);
  if (!family || family.predicates.length !== contracts.length) {
    throw new Error("This event's contract set is not a supported exhaustive payoff family.");
  }
  if (family.familyHash.toLowerCase() !== params.expectedFamilyHash.toLowerCase()) {
    throw new Error("Gemini's event rules or contract identifiers changed since this position was accepted.");
  }
  if (family.scenarios.length !== params.expectedPayouts.length ||
    family.scenarios.map((scenario) => scenario.label).join("\n") !== params.expectedLabels.join("\n")) {
    throw new Error("The source scenarios do not match the immutable position payout schedule.");
  }

  const resolvedSides = new Map(contracts.map((contract) => [contract.id, contract.resolutionSide]));
  const candidates = family.scenarios.filter((scenario) => family.predicates.every((predicate) =>
    scenario.predicateYes[predicate.id] === (resolvedSides.get(predicate.contractId) === "yes")));
  if (candidates.length !== 1) throw new Error("Gemini's final contract results do not map to one unique scenario.");

  const sourceSnapshot = {
    id: event.id,
    ticker: event.ticker,
    status: event.status,
    resolvedAt,
    expiryDate: event.expiryDate ?? null,
    contracts: [...contracts].sort((left, right) => left.id.localeCompare(right.id)).map((contract) => ({
      id: contract.id,
      ticker: contract.ticker ?? null,
      status: contract.status,
      resolutionSide: contract.resolutionSide,
      resolvedAt: contract.resolvedAt,
      settlementValue: contract.settlementValue ?? null,
      termsAndConditionsUrl: contract.termsAndConditionsUrl ?? event.termsLink ?? null,
    })),
  };
  const canonical = JSON.stringify(sourceSnapshot);
  return {
    family,
    scenario: candidates[0],
    evidenceHash: keccak256(stringToHex(canonical)),
    payloadHash,
    fetchedAt,
    resolvedAt,
    sourceSnapshot,
    rawSource: event,
  };
}
