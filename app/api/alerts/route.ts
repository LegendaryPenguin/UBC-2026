import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, readStore, uid } from "@/lib/server/store";

export const dynamic = "force-dynamic";

const ALERT_TYPES = new Set(["price", "quote", "source", "cutoff", "claim"]);

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const store = readStore();
  return ok({
    alerts: store.alerts.filter((alert) => alert.accountId === ctx.account.id),
    notifications: store.notifications.filter((item) => item.accountId === ctx.account.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  let body: { name?: unknown; type?: unknown; topicSlug?: unknown; threshold?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide alert details as JSON.");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const topicSlug = body.topicSlug == null || body.topicSlug === "" ? null : body.topicSlug;
  const threshold = body.threshold == null ? "" : body.threshold;
  if (name.length < 1 || name.length > 80 || typeof body.type !== "string" || !ALERT_TYPES.has(body.type) ||
    typeof threshold !== "string" || threshold.length > 80 ||
    (topicSlug !== null && (typeof topicSlug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(topicSlug)))) {
    return fail("INVALID", "Alert name, type, topic, or threshold is invalid.");
  }
  const alert = {
    id: uid("al"),
    accountId: ctx.account.id,
    name,
    type: body.type,
    topicSlug,
    positionId: null,
    threshold,
    channel: "inbox" as const,
    paused: false,
    createdAt: new Date().toISOString(),
  };
  mutate((store) => store.alerts.push(alert));
  return ok({ alert }, 201);
}

export async function PATCH(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  let body: { id?: unknown; action?: unknown; paused?: unknown };
  try {
    body = await readJson<typeof body>(req);
  } catch {
    return fail("INVALID", "Provide an alert or notification update as JSON.");
  }
  if (typeof body.id !== "string" || body.id.length < 1 || body.id.length > 100) {
    return fail("INVALID", "Choose an alert or notification to update.");
  }
  if (body.action === "read" || body.action === "unread") {
    if (body.paused !== undefined) return fail("INVALID", "Update one item at a time.");
    const item = mutate((store) => {
      const notification = store.notifications.find((entry) => entry.id === body.id && entry.accountId === ctx.account.id);
      if (!notification) return null;
      notification.read = body.action === "read";
      return notification;
    });
    return item ? ok({ notification: item }) : fail("NOT_FOUND", "Notification not found", 404);
  }
  if (typeof body.paused !== "boolean" || body.action !== undefined) {
    return fail("INVALID", "Choose whether to pause or resume an alert.");
  }
  const alert = mutate((store) => {
    const item = store.alerts.find((entry) => entry.id === body.id && entry.accountId === ctx.account.id);
    if (!item) return null;
    item.paused = body.paused as boolean;
    return item;
  });
  return alert ? ok({ alert }) : fail("NOT_FOUND", "Alert not found", 404);
}
