// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => navigation }));

import { ContextualAssistant } from "@/components/ContextualAssistant";

let thread: { id: string; kind: "general"; thesisId: null; title: string; messages: { id: string; role: "user" | "assistant"; content: string; createdAt: string; action?: { type: string; label: string; href: string } }[]; updatedAt: string } | null;

beforeEach(() => {
  thread = null;
  navigation.push.mockClear();
  localStorage.clear();
  localStorage.setItem("thesis:last-active", "th_abc123");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/status") return new Response(JSON.stringify({ services: [{ id: "voice", state: "unavailable" }] }), { status: 200 });
    if (url === "/api/conversations" && !init?.method) return new Response(JSON.stringify({ conversations: thread ? [thread] : [] }), { status: 200 });
    if (url === "/api/conversations" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (body.action === "create") {
        thread = { id: "conv-1", kind: "general", thesisId: null, title: "New conversation", messages: [], updatedAt: new Date().toISOString() };
        return new Response(JSON.stringify({ conversation: thread }), { status: 200 });
      }
      if (body.action === "save-turn" && thread) {
        const createdAt = new Date().toISOString();
        thread.title = body.user.slice(0, 72);
        thread.messages.push({ id: "msg-1", role: "user", content: body.user, createdAt }, { id: "msg-2", role: "assistant", content: body.assistant, createdAt, action: body.structuredAction });
        thread.updatedAt = createdAt;
        return new Response(JSON.stringify({ conversation: thread }), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), { status: 500 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("contextual assistant navigation", () => {
  it("saves a bounded destination proposal and navigates only after the user confirms it", async () => {
    render(<ContextualAssistant />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Thesis" }));
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Can you compare this construction?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const proposed = await screen.findByRole("button", { name: "Review destination · Open Compare" });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(thread?.messages[1].action?.href).toBe("/theses/th_abc123/compare");
    fireEvent.click(proposed);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/theses/th_abc123/compare"));
  });
});
