import { fail, ok, readJson } from "@/lib/server/http";
import { currentSession } from "@/lib/server/session";
import { mutate, uid } from "@/lib/server/store";

export async function GET() {
  const ctx = currentSession();
  if (!ctx) return ok({ alerts: [], notifications: [] });
  return ok({
    alerts: mutate((s) => s.alerts.filter((a) => a.accountId === ctx.account.id)),
    notifications: mutate((s) => s.notifications.filter((n) => n.accountId === ctx.account.id)),
  });
}

export async function POST(req: Request) {
  const ctx = currentSession();
  if (!ctx) return fail("AUTH", "Sign in required", 401);
  const body = await readJson<{ name: string; type: string; topicSlug?: string; threshold?: string }>(req);
  const alert = {
    id: uid("al"),
    accountId: ctx.account.id,
    name: body.name,
    type: body.type,
    topicSlug: body.topicSlug || null,
    positionId: null,
    threshold: body.threshold || "",
    channel: "inbox" as const,
    paused: false,
    createdAt: new Date().toISOString(),
  };
  mutate((s) => s.alerts.push(alert));
  return ok({ alert });
}

export async function PATCH(req: Request) {
  const body = await readJson<{ id: string; read?: boolean; paused?: boolean; action?: string }>(req);
  mutate((s) => {
    if (body.action === "read" && body.id) {
      const n = s.notifications.find((x) => x.id === body.id);
      if (n) n.read = true;
    }
    if (body.paused != null) {
      const a = s.alerts.find((x) => x.id === body.id);
      if (a) a.paused = body.paused;
    }
  });
  return ok({ ok: true });
}
