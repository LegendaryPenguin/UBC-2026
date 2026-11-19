// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/theses/thesis-1", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button type="button">Connect wallet</button> }));

import { Shell } from "@/components/Shell";
import { requestModeChange } from "@/lib/client";

describe("workspace shell mode control", () => {
  let modeChanges: CustomEvent[];
  const recordModeChange = (event: Event) => modeChanges.push(event as CustomEvent);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("thesis_mode", "replay");
    modeChanges = [];
    window.addEventListener("thesis:mode-change", recordModeChange);
  });

  afterEach(() => {
    cleanup();
    window.removeEventListener("thesis:mode-change", recordModeChange);
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("requires in-app confirmation and only announces an accepted mode change", async () => {
    render(<Shell><p>Thesis workspace content</p></Shell>);
    const selector = await screen.findByRole("button", { name: /Illustrative demo/ });
    expect(screen.getAllByRole("link", { name: "My Theses" }).some((link) => link.getAttribute("aria-current") === "page")).toBe(true);

    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole("button", { name: "Live data" }));
    expect(await screen.findByRole("dialog", { name: /Switch to live data/ })).toBeTruthy();
    expect(localStorage.getItem("thesis_mode")).toBe("replay");
    expect(modeChanges).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Switch context" }));
    expect(localStorage.getItem("thesis_mode")).toBe("live");
    expect(modeChanges).toHaveLength(1);
    expect(modeChanges[0].detail.mode).toBe("live");
  });

  it("routes page mode-change requests through the same confirmation dialog", async () => {
    localStorage.setItem("thesis_mode", "live");
    render(<Shell><p>Research workspace</p></Shell>);
    await screen.findByRole("button", { name: /Live market data/ });

    act(() => { expect(requestModeChange("paper")).toBe(false); });
    expect(screen.getByRole("dialog", { name: /Switch to Paper simulation/ })).toBeTruthy();
    expect(localStorage.getItem("thesis_mode")).toBe("live");
    fireEvent.click(screen.getByRole("button", { name: "Switch context" }));
    act(() => { expect(requestModeChange("paper")).toBe(true); });
    expect(localStorage.getItem("thesis_mode")).toBe("paper");
  });
});
