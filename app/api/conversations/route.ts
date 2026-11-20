import { fail, ok, readJson } from "@/lib/server/http";
import { thesisOwner } from "@/lib/server/session";
import { mutate, readStore, uid, type ConversationRecord } from "@/lib/server/store";

export const dynamic = "force-dynamic";

function ownsThesis(owner: string, thesisId: string) {
  return readStore().theses.some((item) => item.id === thesisId && (item as typeof item & { accountId?: string }).accountId === owner);
}

export async function GET(req: Request) {
  const owner = thesisOwner();
  if (!owner) return ok({ conversations: [] });
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  if (kind && kind !== "general" && kind !== "thesis") return fail("INVALID", "Choose a supported conversation type.");
  const thesisId = params.get("thesisId");
  if (thesisId && !ownsThesis(owner, thesisId)) return fail("NOT_FOUND", "Thesis not found.", 404);
  const conversations = readStore().conversations
    .filter((item) => item.accountId === owner && (!kind || item.kind === kind) && (thesisId === null || item.thesisId === thesisId))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return ok({ conversations });
}

export async function POST(req: Request) {
  const owner = thesisOwner(true)!;
  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req);
  } catch {
    return fail("INVALID", "Provide a conversation action as JSON.");
  }
  if (!body || typeof body.action !== "string") return fail("INVALID", "Choose a conversation action.");

  if (body.action === "create") {
    const kind = body.kind === "thesis" ? "thesis" : body.kind === "general" || body.kind === undefined ? "general" : null;
    const thesisId = typeof body.thesisId === "string" ? body.thesisId : null;
    if (!kind || (kind === "thesis" && (!thesisId || !ownsThesis(owner, thesisId))) || (kind === "general" && thesisId)) {
      return fail("INVALID", "Choose an owned thesis for a thesis conversation, or create a general conversation.");
    }
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "New conversation";
    const now = new Date().toISOString();
    const conversation: ConversationRecord = { id: uid("conv"), accountId: owner, kind, thesisId, title, messages: [], createdAt: now, updatedAt: now };
    mutate((store) => { store.conversations.push(conversation); });
    return ok({ conversation });
  }

  if (body.action === "save-turn") {
    const id = typeof body.id === "string" ? body.id : "";
    const user = typeof body.user === "string" ? body.user.trim() : "";
    const assistant = typeof body.assistant === "string" ? body.assistant.trim() : "";
    if (!id || !user || user.length > 3_000 || !assistant || assistant.length > 6_000) return fail("INVALID", "A conversation turn needs a user question and assistant reply.");
    let structuredAction: ConversationRecord["messages"][number]["action"];
    let marketOptions: ConversationRecord["messages"][number]["marketOptions"];
    if (body.marketOptions !== undefined) {
      if (!Array.isArray(body.marketOptions) || body.marketOptions.length > 5) return fail("INVALID", "Choose up to five suggested markets.");
      marketOptions = [];
      for (const item of body.marketOptions) {
        if (!item || typeof item.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.slug) ||
          typeof item.title !== "string" || !item.title.trim() || item.title.length > 200 ||
          (item.contract !== undefined && (typeof item.contract !== "string" || item.contract.length > 200)) ||
          (item.eventTicker !== undefined && (typeof item.eventTicker !== "string" || !/^[a-z0-9._:-]{1,180}$/i.test(item.eventTicker)))) {
          return fail("INVALID", "Each suggested market needs a valid topic and title.");
        }
        marketOptions.push({ slug: item.slug, title: item.title, ...(item.contract ? { contract: item.contract } : {}), ...(item.eventTicker ? { eventTicker: item.eventTicker } : {}) });
      }
    }
    if (body.structuredAction !== undefined) {
      const action = body.structuredAction as Record<string, unknown> | null;
      const href = typeof action?.href === "string" ? action.href : "";
      let parsed: URL | null = null;
      try { parsed = new URL(href, "https://thesis.local"); } catch { parsed = null; }
      if (action?.type !== "navigate" || typeof action.label !== "string" || action.label.length > 80 || !href.startsWith("/") || href.startsWith("//") || href.includes("\\") || parsed?.origin !== "https://thesis.local" || !/^\/(|explore|theses|portfolio|theses\/[A-Za-z0-9_-]+(?:\/(?:build|compare|review|history))?|topics\/[a-z0-9-]+)$/.test(parsed.pathname)) {
        return fail("INVALID", "Assistant navigation must use a supported in-app destination.");
      }
      structuredAction = { type: "navigate", label: action.label, href };
    }
    const conversation = mutate((store) => {
      const item = store.conversations.find((entry) => entry.id === id && entry.accountId === owner);
      if (!item) return null;
      if (item.messages.length >= 200) return false;
      const now = new Date().toISOString();
      item.messages.push(
        { id: uid("msg"), role: "user", content: user, createdAt: now },
        { id: uid("msg"), role: "assistant", content: assistant, createdAt: now, ...(structuredAction ? { action: structuredAction } : {}), ...(marketOptions?.length ? { marketOptions } : {}) },
      );
      if (item.title === "New conversation" && item.messages.length === 2) item.title = user.slice(0, 72);
      item.updatedAt = now;
      return item;
    });
    if (conversation === null) return fail("NOT_FOUND", "Conversation not found.", 404);
    if (conversation === false) return fail("LIMIT", "This conversation has reached its 100-turn limit. Start a new conversation.", 409);
    return ok({ conversation });
  }

  if (body.action === "rename") {
    const id = typeof body.id === "string" ? body.id : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!id || !title || title.length > 80) return fail("INVALID", "Enter a conversation title under 80 characters.");
    const conversation = mutate((store) => {
      const item = store.conversations.find((entry) => entry.id === id && entry.accountId === owner);
      if (!item) return null;
      item.title = title;
      item.updatedAt = new Date().toISOString();
      return item;
    });
    return conversation ? ok({ conversation }) : fail("NOT_FOUND", "Conversation not found.", 404);
  }

  if (body.action === "delete") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return fail("INVALID", "Choose a conversation.");
    const deleted = mutate((store) => {
      const before = store.conversations.length;
      store.conversations = store.conversations.filter((entry) => entry.id !== id || entry.accountId !== owner);
      return store.conversations.length !== before;
    });
    return deleted ? ok({ deleted: true }) : fail("NOT_FOUND", "Conversation not found.", 404);
  }

  if (body.action === "link") {
    const id = typeof body.id === "string" ? body.id : "";
    const thesisId = typeof body.thesisId === "string" ? body.thesisId : "";
    if (!id || !thesisId || !ownsThesis(owner, thesisId)) return fail("NOT_FOUND", "Thesis not found.", 404);
    const conversation = mutate((store) => {
      const item = store.conversations.find((entry) => entry.id === id && entry.accountId === owner && entry.kind === "general");
      if (!item) return null;
      item.kind = "thesis";
      item.thesisId = thesisId;
      item.updatedAt = new Date().toISOString();
      return item;
    });
    return conversation ? ok({ conversation }) : fail("NOT_FOUND", "General conversation not found.", 404);
  }

  return fail("INVALID", "Unknown conversation action.");
}
