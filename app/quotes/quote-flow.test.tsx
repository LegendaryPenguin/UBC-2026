// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SignedQuote } from "@/lib/domain/types";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "quote-paper-1" }), useRouter: () => ({ push: navigation.push }) }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, chainId: undefined }),
  usePublicClient: () => undefined,
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useWaitForTransactionReceipt: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));

import QuotePage from "@/app/quotes/[id]/page";

const quote: SignedQuote = {
  id: "quote-paper-1",
  status: "available",
  maker: `0x${"1".repeat(40)}`,
  taker: `0x${"2".repeat(40)}`,
  escrow: `0x${"3".repeat(40)}`,
  token: `0x${"4".repeat(40)}`,
  familyHash: `0x${"5".repeat(64)}`,
  payoffHash: `0x${"6".repeat(64)}`,
  maxPayout: "100000000",
  premium: "2000000",
  fee: "25000",
  nonce: "1",
  issuedAt: 1_800_000_000,
  deadline: 1_800_003_600,
  chainId: 5042002,
  longstop: 0,
  finalizationDelay: 0,
  signature: "0x",
  payouts: ["0", "100000000"],
  scenarioLabels: ["Below range", "Inside range"],
};

let failAcceptance = false;
let holdAcceptance = false;
let resolvePendingAcceptance: ((response: Response) => void) | null = null;
let requests: { url: string; init?: RequestInit }[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  failAcceptance = false;
  holdAcceptance = false;
  resolvePendingAcceptance = null;
  requests = [];
  navigation.push.mockClear();
  localStorage.clear();
  localStorage.setItem("thesis_mode", "paper");
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "/api/quotes/quote-paper-1") return new Response(JSON.stringify({ quote }), { status: 200 });
    if (url === "/api/positions" && init?.method === "POST") {
      if (holdAcceptance) return new Promise<Response>((resolve) => { resolvePendingAcceptance = resolve; });
      if (failAcceptance) return new Response(JSON.stringify({ error: { message: "Paper position service is temporarily unavailable." } }), { status: 503 });
      return new Response(JSON.stringify({ position: { id: "paper-position-1" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Unexpected request." } }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Paper quote review and acceptance", () => {
  it("disables repeated acceptance while position creation is pending", async () => {
    render(<QuotePage />);
    expect(await screen.findByRole("heading", { name: "Quote quote-paper-1" })).toBeTruthy();

    holdAcceptance = true;
    fireEvent.click(screen.getByRole("button", { name: "Accept paper quote" }));
    const pendingButton = screen.getByRole("button", { name: "Creating paper position…" }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    expect(requests.filter(({ url, init }) => url === "/api/positions" && init?.method === "POST")).toHaveLength(1);

    holdAcceptance = false;
    resolvePendingAcceptance?.(new Response(JSON.stringify({ error: { message: "Paper acceptance can be retried." } }), { status: 503 }));
    expect((await screen.findByRole("alert")).textContent).toContain("Paper acceptance can be retried.");
    expect(screen.getByRole("button", { name: "Accept paper quote" })).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("shows exact terms, requires explicit acceptance, and preserves a failed acceptance for retry", async () => {
    render(<QuotePage />);
    expect(await screen.findByRole("heading", { name: "Quote quote-paper-1" })).toBeTruthy();
    expect(screen.getByText("Pay 2 USDC premium plus 0.025 fee.")).toBeTruthy();
    expect(screen.getByText("Simulation using recorded market data.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept paper quote" })).toBeTruthy();
    expect(requests.some(({ url, init }) => url === "/api/positions" && init?.method === "POST")).toBe(false);

    failAcceptance = true;
    fireEvent.click(screen.getByRole("button", { name: "Accept paper quote" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Paper position service is temporarily unavailable.");
    expect(screen.getByRole("button", { name: "Accept paper quote" })).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();

    failAcceptance = false;
    fireEvent.click(screen.getByRole("button", { name: "Accept paper quote" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/positions/paper-position-1"));
    const attempts = requests.filter(({ url, init }) => url === "/api/positions" && init?.method === "POST");
    expect(attempts).toHaveLength(2);
    expect(attempts.every(({ init }) => JSON.parse(String(init?.body)).quoteId === quote.id)).toBe(true);
    expect(attempts.every(({ init }) => JSON.parse(String(init?.body)).mode === "paper")).toBe(true);
  });
});
