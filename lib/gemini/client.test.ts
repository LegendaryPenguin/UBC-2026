import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiApiHealth, listEvents } from "@/lib/gemini/client";

type GeminiRuntime = typeof globalThis & { __thesisGeminiApiCheck?: { at: string; failed: boolean } };
const runtime = globalThis as GeminiRuntime;
const priorCheck = runtime.__thesisGeminiApiCheck;

beforeEach(() => {
  delete runtime.__thesisGeminiApiCheck;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (priorCheck) runtime.__thesisGeminiApiCheck = priorCheck;
  else delete runtime.__thesisGeminiApiCheck;
});

describe("Gemini API health", () => {
  it("shares a successful catalog check with the status route runtime", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await listEvents({ limit: 1 });

    expect(geminiApiHealth().state).toBe("available");
    expect(geminiApiHealth().note).toContain("Most recent live request succeeded");
  });

  it("marks the latest live request degraded after a provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(listEvents({ limit: 1 })).rejects.toThrow("offline");

    expect(geminiApiHealth().state).toBe("degraded");
  });
});
