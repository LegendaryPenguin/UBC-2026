// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "thesis-1" }), useRouter: () => ({ push: navigation.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));

import History from "@/app/theses/[id]/history/page";

const historyResponse = {
  currentRevision: 2,
  versions: [{
    id: "revision-1",
    thesisId: "thesis-1",
    accountId: "account-1",
    revision: 1,
    recordedAt: "2026-11-14T00:00:00.000Z",
    reason: "confirmed",
    snapshot: {
      topicSlug: "btc-friday",
      familyId: "btc-friday",
      familyVersion: "1",
      template: "range",
      direction: null,
      lowerThreshold: 95_000,
      upperThreshold: 100_000,
      rationale: "The settlement should finish inside the range.",
      invalidation: "A confirmed close outside the range.",
      evidenceIds: [],
      status: "confirmed",
    },
  }],
  timeline: [{
    id: "position-1",
    kind: "position" as const,
    at: "2026-11-15T00:00:00.000Z",
    status: "open",
    mode: "paper",
    premium: "62500000",
    fee: "0",
    maxPayout: "100000000",
    scenarioLabel: null,
    href: "/positions/position-1",
  }],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigation.push.mockClear();
  let restoreAttempts = 0;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/theses/thesis-1/history") return new Response(JSON.stringify(historyResponse), { status: 200 });
    if (String(input) === "/api/theses/thesis-1" && init?.method === "PATCH") {
      restoreAttempts += 1;
      if (restoreAttempts === 1) return new Response(JSON.stringify({ error: { message: "The saved revision could not be restored yet." } }), { status: 503 });
      return new Response(JSON.stringify({ thesis: { id: "thesis-1" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Unexpected history request." } }), { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.push.mockClear();
});

describe("thesis history flow", () => {
  it("shows the recorded position and restores a prior revision as a draft with retry recovery", async () => {
    render(<History />);
    expect(await screen.findByRole("heading", { name: "Thesis history" })).toBeTruthy();
    expect(screen.getByText(/Revision 2 is current\. Each saved view stays frozen/)).toBeTruthy();
    expect(screen.getByText("The settlement should finish inside the range.")).toBeTruthy();
    expect(screen.getByText(/Position · open/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /View in Portfolio/ }).getAttribute("href")).toBe("/positions/position-1");

    fireEvent.click(screen.getByRole("button", { name: "Restore as new draft" }));
    expect(await screen.findByRole("dialog", { name: /Restore revision 1 as a new draft/ })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Restore as new draft" }).at(-1)!);
    expect((await screen.findByRole("alert")).textContent).toContain("The saved revision could not be restored yet.");
    expect(screen.getByText("The settlement should finish inside the range.")).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Restore as new draft" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Restore as new draft" }).at(-1)!);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/theses/thesis-1"));
    const restoreCalls = fetchMock.mock.calls.filter(([input, init]) => String(input) === "/api/theses/thesis-1" && init?.method === "PATCH");
    expect(restoreCalls).toHaveLength(2);
    expect(JSON.parse(String(restoreCalls[0][1]?.body))).toMatchObject({ action: "restore", revision: 1 });
    expect(JSON.parse(String(restoreCalls[1][1]?.body))).toMatchObject({ action: "restore", revision: 1 });
  });
});
