import { describe, expect, it } from "vitest";
import type { GeminiEvent } from "@/lib/gemini/types";
import { binaryFromEvent } from "@/lib/gemini/families";
import { settledGeminiOutcome } from "@/lib/gemini/settlement";

function settledEvent(): GeminiEvent {
  const base: GeminiEvent = {
    id: "event-1",
    ticker: "BTCFRIDAY",
    title: "Where will Bitcoin finish Friday?",
    description: "Bitcoin settlement at the Friday deadline",
    category: "Crypto",
    status: "settled",
    expiryDate: "2026-11-20T23:59:00.000Z",
    resolvedAt: "2026-11-20T23:59:10.000Z",
    termsLink: "https://example.com/event-rules",
    contracts: [
      {
        id: "contract-95",
        ticker: "HI95K",
        instrumentSymbol: "GEMI-BTCFRIDAY-HI95K",
        label: "$95,000 or above",
        status: "settled",
        resolutionSide: "yes",
        resolvedAt: "2026-11-20T23:59:10.000Z",
        expiryDate: "2026-11-20T23:59:00.000Z",
        termsAndConditionsUrl: null,
      },
      {
        id: "contract-100",
        ticker: "HI100K",
        instrumentSymbol: "GEMI-BTCFRIDAY-HI100K",
        label: "$100,000 or above",
        status: "active",
        expiryDate: "2026-11-20T23:59:00.000Z",
      },
    ],
  };
  return base;
}

describe("Gemini settlement source matching", () => {
  it("settles the exact accepted binary contract and ignores unselected event contracts", () => {
    const event = settledEvent();
    const expected = binaryFromEvent(event, "2026-11-20T23:59:11.000Z", "0xold", true, "contract-95", true)!;
    const result = settledGeminiOutcome({
      event,
      fetchedAt: "2026-11-20T23:59:11.000Z",
      payloadHash: "0xpayload",
      expectedFamilyHash: expected.familyHash,
      expectedContractIds: ["contract-95"],
      expectedPayouts: ["0", "100"],
      expectedLabels: expected.scenarios.map((scenario) => scenario.label),
    });

    expect(result.scenario.id).toBe("yes");
    expect(result.scenario.index).toBe(1);
    expect(result.sourceSnapshot.contracts).toHaveLength(1);
    expect(result.sourceSnapshot.contracts[0].id).toBe("contract-95");
    expect(result.sourceSnapshot.contracts[0].termsAndConditionsUrl).toBeNull();
  });

  it("rejects a selected-contract mismatch even when the event is settled", () => {
    const event = settledEvent();
    const expected = binaryFromEvent(event, "2026-11-20T23:59:11.000Z", "0xold", true, "contract-95", true)!;
    expect(() => settledGeminiOutcome({
      event,
      fetchedAt: "2026-11-20T23:59:11.000Z",
      payloadHash: "0xpayload",
      expectedFamilyHash: expected.familyHash,
      expectedContractIds: ["contract-100"],
      expectedPayouts: ["0", "100"],
      expectedLabels: expected.scenarios.map((scenario) => scenario.label),
    })).toThrow("selected contract identifiers changed");
  });
});
