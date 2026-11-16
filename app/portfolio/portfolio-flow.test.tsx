// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AlertRule, PositionRecord } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "position-1" }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, chainId: undefined }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useWaitForTransactionReceipt: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/chain", () => ({ arcTestnet: { id: 123, blockExplorers: { default: { url: "https://explorer.example" } } }, publicEscrow: () => null }));
vi.mock("@/lib/escrow/abi", () => ({ escrowAbi: [] }));

import Portfolio from "@/app/portfolio/page";
import PositionPage from "@/app/positions/[id]/page";
import Alerts from "@/app/alerts/page";

const position: PositionRecord = {
  id: "position-1",
  accountId: "account-1",
  thesisId: "thesis-1",
  quoteId: "quote-1",
  mode: "paper",
  chainPositionId: null,
  txHash: null,
  status: "open",
  scenarioIndex: null,
  payouts: ["0", "100000000", "0"],
  labels: ["Below $95,000", "$95,000–$100,000", "Above $100,000"],
  maxPayout: "100000000",
  premium: "62500000",
  fee: "0",
  longstop: 1_800_000_000,
  finalizationDelay: 3600,
  familyId: "btc-friday",
  topicSlug: "btc-friday",
  sourceTicker: "BTCFRIDAY",
  sourceContractIds: ["contract-95", "contract-100"],
  createdAt: "2026-11-15T00:00:00.000Z",
};

let fetchMock: ReturnType<typeof vi.fn>;
let savedAlert: AlertRule | null;
let portfolioPositions: PositionRecord[];
let failLocalPositionLoads: number;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  savedAlert = null;
  portfolioPositions = [position];
  failLocalPositionLoads = 0;
  window.history.replaceState({}, "", "/portfolio");
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/positions" || url === "/api/positions?include=settled") {
      if (url === "/api/positions" && failLocalPositionLoads > 0) {
        failLocalPositionLoads -= 1;
        return new Response(JSON.stringify({ error: { message: "Positions are temporarily unavailable." } }), { status: 503 });
      }
      return new Response(JSON.stringify({ positions: portfolioPositions }), { status: 200 });
    }
    if (url === "/api/positions/position-1") return new Response(JSON.stringify({ position, walletAddress: null }), { status: 200 });
    if (url === "/api/gemini/positions?bucket=active") return new Response(JSON.stringify({ positions: [] }), { status: 200 });
    if (url === "/api/gemini/positions?bucket=settled") return new Response(JSON.stringify({ positions: [] }), { status: 200 });
    if (url === "/api/activity") return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
    if (url === "/api/alerts" && !init?.method) return new Response(JSON.stringify({ alerts: savedAlert ? [savedAlert] : [], notifications: [] }), { status: 200 });
    if (url === "/api/alerts" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      savedAlert = { id: "alert-1", accountId: "account-1", name: body.name, type: "claim", topicSlug: "btc-friday", positionId: body.positionId, threshold: "0", channel: "inbox", paused: false, createdAt: "2026-11-15T00:00:00.000Z" };
      return new Response(JSON.stringify({ alert: savedAlert }), { status: 200 });
    }
    if (url === "/api/alerts" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      const currentAlert = savedAlert;
      if (currentAlert && currentAlert.id === body.id) {
        const updatedAlert: AlertRule = { ...currentAlert, paused: body.paused };
        savedAlert = updatedAlert;
        return new Response(JSON.stringify({ alert: updatedAlert }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "Alert was not found." } }), { status: 404 });
    }
    return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Portfolio and settlement alert follow-through", () => {
  it("explains empty open and settled states and returns to the open positions tab", async () => {
    portfolioPositions = [];
    render(<Portfolio />);

    const explore = await screen.findByRole("link", { name: "Explore markets" });
    expect(explore.getAttribute("href")).toBe("/explore");

    fireEvent.click(screen.getByRole("button", { name: "Settled history" }));
    expect(await screen.findByText("No settled Gemini positions")).toBeTruthy();
    expect(screen.getByText("No settled Arc or paper positions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to open positions" }));
    expect(screen.getByRole("button", { name: "Open positions" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("recovers from a local position read error with Retry", async () => {
    portfolioPositions = [];
    failLocalPositionLoads = 1;
    render(<Portfolio />);

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Positions are temporarily unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Explore markets" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the linked paper position, preserves its thesis, and sets then pauses and resumes an alert", async () => {
    render(<Portfolio />);
    expect(await screen.findByText("btc-friday · open · paper")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open position" }).getAttribute("href")).toBe("/positions/position-1");
    expect(screen.getByRole("link", { name: "Revisit thesis" }).getAttribute("href")).toBe("/theses/thesis-1");

    cleanup();
    render(<PositionPage />);
    expect(await screen.findByRole("heading", { name: "Position" })).toBeTruthy();
    expect(screen.getByText("Maximum loss")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim payout" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "thesis" }));
    expect(screen.getByRole("link", { name: "Open thesis" }).getAttribute("href")).toBe("/theses/thesis-1");
    expect(screen.getByRole("link", { name: "Set settlement alert" }).getAttribute("href")).toBe("/alerts?positionId=position-1");

    cleanup();
    window.history.replaceState({}, "", "/alerts?positionId=position-1");
    render(<Alerts />);
    expect(await screen.findByRole("heading", { name: "Position alerts" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Position" }) as HTMLSelectElement).value).toBe("position-1");
    fireEvent.click(screen.getByRole("button", { name: "Set alert" }));
    await waitFor(() => expect(screen.getByText("Position settlement update · active")).toBeTruthy());
    expect(savedAlert?.positionId).toBe("position-1");

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Position settlement update · paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText("Position settlement update · active")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input) === "/api/positions/position-1" && init?.method === "PATCH")).toBe(false);
  });
});
