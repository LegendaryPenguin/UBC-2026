import { keccak256, stringToHex } from "viem";
import type { MarketFamily } from "@/lib/domain/types";
import type { GeminiEvent } from "@/lib/gemini/types";
import { binaryFromEvent, familyFromEvent } from "@/lib/gemini/families";

export function settledGeminiOutcome(params: {
  event: GeminiEvent;
  fetchedAt: string;
  payloadHash: string;
  expectedFamilyHash: string;
  expectedContractIds?: string[];
  expectedPayouts: string[];
  expectedLabels: string[];
}) {
  const { event, fetchedAt, payloadHash } = params;
  if (!event.ticker || event.status !== "settled" || !Array.isArray(event.contracts) || event.contracts.length === 0) {
    throw new Error("Gemini has not reported this event as settled.");
  }
  const allContracts = event.contracts;
  const candidateFamilies: MarketFamily[] = [];
  const compatibleFamily = familyFromEvent(event, fetchedAt, payloadHash, true);
  if (compatibleFamily) candidateFamilies.push(compatibleFamily);
  for (const contract of allContracts) {
    const binary = binaryFromEvent(event, fetchedAt, payloadHash, true, contract.id, true);
    if (binary) candidateFamilies.push(binary);
  }
  const family = candidateFamilies.find((candidate) =>
    candidate.familyHash.toLowerCase() === params.expectedFamilyHash.toLowerCase() &&
    (!params.expectedContractIds || [...candidate.contracts.map((contract) => contract.id)].sort().join("\n") === [...params.expectedContractIds].sort().join("\n"))
  );
  if (!family) throw new Error("Gemini's event rules or selected contract identifiers changed since this position was accepted.");
  const contracts = allContracts.filter((contract) => family.contracts.some((selected) => selected.id === contract.id));
  if (contracts.length !== family.contracts.length || contracts.some((contract) => contract.status !== "settled" ||
    (contract.resolutionSide !== "yes" && contract.resolutionSide !== "no") ||
    !contract.resolvedAt || !Number.isFinite(Date.parse(contract.resolvedAt)))) {
    throw new Error("Every contract used by this position must have a final Gemini outcome and resolution timestamp.");
  }
  const resolvedAt = event.resolvedAt || contracts.map((contract) => contract.resolvedAt!).sort().at(-1)!;
  if (!Number.isFinite(Date.parse(resolvedAt))) throw new Error("Gemini's event resolution timestamp is invalid.");
  if (family.scenarios.length !== params.expectedPayouts.length ||
    family.scenarios.map((scenario) => scenario.label).join("\n") !== params.expectedLabels.join("\n")) {
    throw new Error("The source scenarios do not match the immutable position payout schedule.");
  }

  const resolvedSides = new Map(contracts.map((contract) => [contract.id, contract.resolutionSide]));
  const scenarioCandidates = family.scenarios.filter((scenario) => family.predicates.every((predicate) =>
    scenario.predicateYes[predicate.id] === (resolvedSides.get(predicate.contractId) === "yes")));
  if (scenarioCandidates.length !== 1) throw new Error("Gemini's final contract results do not map to one unique scenario.");

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
      termsAndConditionsUrl: contract.termsAndConditionsUrl ?? null,
    })),
  };
  const canonical = JSON.stringify(sourceSnapshot);
  return {
    family,
    scenario: scenarioCandidates[0],
    evidenceHash: keccak256(stringToHex(canonical)),
    payloadHash,
    fetchedAt,
    resolvedAt,
    sourceSnapshot,
    rawSource: event,
  };
}
