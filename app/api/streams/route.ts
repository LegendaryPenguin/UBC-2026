import { capabilities } from "@/lib/capabilities";
import { fail, ok, readJson } from "@/lib/server/http";
import { mutate, uid } from "@/lib/server/store";

export async function POST(req: Request) {
  const cap = capabilities().streams;
  const secret = process.env.QUICKNODE_STREAMS_SECRET;
  const given = req.headers.get("x-qn-signature") || req.headers.get("authorization");
  if (cap.state !== "available" || !secret) return fail("UNAVAILABLE", cap.reason, 501);
  if (given && !given.includes(secret)) return fail("AUTH", "Bad stream signature", 401);
  const body = await readJson<{
    events?: { name?: string; positionId?: string; scenarioIndex?: number; hash?: string }[];
    data?: unknown;
  }>(req);
  const events = body.events || [];
  mutate((s) => {
    for (const ev of events) {
      if (ev.positionId) {
        const p = s.positions.find((x) => x.id === ev.positionId || x.chainPositionId === ev.positionId);
        if (p && ev.name === "Resolved" && ev.scenarioIndex != null) {
          p.status = "resolved";
          p.scenarioIndex = ev.scenarioIndex;
          s.notifications.unshift({
            id: uid("n"),
            accountId: p.accountId,
            title: "Position resolved",
            body: "A stream event marked this position resolved. Confirm onchain before claiming.",
            href: `/positions/${p.id}`,
            category: "trading",
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  });
  return ok({ accepted: events.length, note: "Streams never authorizes payouts." });
}
