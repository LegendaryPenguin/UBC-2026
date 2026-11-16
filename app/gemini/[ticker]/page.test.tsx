// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ ticker: "BTCFRIDAY" }) }));
vi.mock("@/lib/client", () => ({ api: apiMock, modeFromStorage: () => "live" }));
vi.mock("@/lib/use-mode-change", () => ({ useModeChange: () => undefined }));

import GeminiEventPage from "@/app/gemini/[ticker]/page";

let detailReads: number;

beforeEach(() => {
  detailReads = 0;
  apiMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/gemini/events/")) {
      detailReads += 1;
      if (detailReads === 1) throw new Error("Gemini event lookup timed out.");
      return {
        event: {
          id: "event-btc",
          title: "Bitcoin Friday",
          ticker: "BTCFRIDAY",
          status: "active",
          termsLink: "https://gemini.example/events/btc-rules",
          contracts: [{
            id: "contract-95",
            label: "BTC at or above $95,000",
            instrumentSymbol: "GEMI-BTCFRIDAY-HI95K",
            status: "active",
            description: "Bitcoin settles above $95,000",
            termsAndConditionsUrl: "https://gemini.example/contracts/btc-95-rules",
          }],
        },
        mode: "live",
        source: "Gemini API",
        fetchedAt: "2026-11-16T10:00:00.000Z",
        payloadHash: "abc123",
        compatibleTopicSlug: "btc-range",
        compatibleTopics: [{ slug: "btc-range", contractId: "contract-95", contractLabel: "BTC at or above $95,000" }],
      };
    }
    if (url === "/api/gemini/oauth") return { configured: false, connection: null };
    if (url === "/api/status") return { services: [{ id: "geminiTrade", state: "unqualified", note: "Native orders are not qualified." }] };
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe("Gemini event detail route", () => {
  it("recovers from a detail error and preserves separate event and contract rules links", async () => {
    render(<GeminiEventPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("Gemini event lookup timed out.");
    expect(screen.getByRole("link", { name: "Return to Gemini markets" }).getAttribute("href")).toBe("/gemini");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Bitcoin Friday" })).toBeTruthy();
    expect(detailReads).toBe(2);
    expect(screen.getByRole("link", { name: "Open Gemini event-level terms" }).getAttribute("href")).toBe("https://gemini.example/events/btc-rules");
    expect(screen.getByRole("link", { name: "Exact contract rules" }).getAttribute("href")).toBe("https://gemini.example/contracts/btc-95-rules");
    expect(screen.getByRole("link", { name: "Research · BTC at or above $95,000" }).getAttribute("href")).toBe("/topics/btc-range");
    await waitFor(() => expect(screen.getByText(/Native orders are not qualified/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Place Gemini limit order" })).toBeNull();
  });
});
