// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/theses/thesis-1" }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/WalletButton", () => ({ WalletButton: () => <button type="button">Connect wallet</button> }));

import { Shell } from "@/components/Shell";

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

  it("requires confirmation, keeps Replay on cancel, and announces a confirmed mode change", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    render(<Shell><p>Thesis workspace content</p></Shell>);
    const selector = await screen.findByRole("combobox", { name: /Mode/ }) as HTMLSelectElement;
    expect(selector.value).toBe("replay");
    expect(screen.getAllByRole("link", { name: "My Theses" }).some((link) => link.getAttribute("aria-current") === "page")).toBe(true);

    fireEvent.change(selector, { target: { value: "live" } });
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain("Existing orders and positions stay in their original environment.");
    expect(localStorage.getItem("thesis_mode")).toBe("replay");
    expect(selector.value).toBe("replay");
    expect(modeChanges).toHaveLength(0);

    confirm.mockReturnValue(true);
    fireEvent.change(selector, { target: { value: "paper" } });
    expect(localStorage.getItem("thesis_mode")).toBe("paper");
    expect(selector.value).toBe("paper");
    expect(modeChanges).toHaveLength(1);
    expect(modeChanges[0].detail.mode).toBe("paper");
  });
});
